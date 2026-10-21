/**
 * 视奏序列生成器测试：5 档难度表、调内行进/跳进/边界规则、小节与临时记号
 * 真实规则（注入 / 同小节延续 / 新小节还原）、音组、判题与讲评文案。
 * 对照逻辑全部独立重实现，防止实现端自证。
 */

import { describe, expect, it } from 'vitest';
import {
  generateSeq,
  judgeStep,
  letterAccOctToMidi,
  noteAtStep,
  seqExplain,
  seqProfileOf,
  type PlaySeq,
  type SeqProfile,
} from '../src/core/seq-generator';
import { makeRng } from '../src/core/question-generator';
import {
  B_LET,
  B_OCT,
  FL_MAJ,
  FL_ORDER,
  SH_MAJ,
  SH_ORDER,
  T_LET,
  T_OCT,
  type Clef,
  type SigType,
} from '../src/core/music-theory';

/* ---------- 独立重实现（防实现端自证） ---------- */

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** step 基准：高音 E4 / 低音 G2 的绝对音级（oct*7 + 字母序 C=0…B=6） */
const BASE: Record<Clef, number> = { treble: 30, bass: 18 };

function headAt(step: number, clef: Clef): { letter: string; oct: number } {
  const d = BASE[clef] + step;
  const oct = Math.floor(d / 7);
  return { letter: LETTERS[d - oct * 7], oct };
}

function natMidi(step: number, clef: Clef): number {
  const h = headAt(step, clef);
  return (h.oct + 1) * 12 + SEMI[h.letter];
}

function keyAcc(letter: string, type: SigType, n: number): 1 | -1 | 0 {
  const order = type === 'sh' ? SH_ORDER : FL_ORDER;
  return order.slice(0, n).includes(letter) ? (type === 'sh' ? 1 : -1) : 0;
}

function tonicLetterOf(type: SigType, n: number): string {
  return (type === 'sh' ? SH_MAJ : FL_MAJ)[n][0];
}

function majorPcs(type: SigType, n: number): Set<number> {
  const tonic = (type === 'sh' ? SH_MAJ : FL_MAJ)[n];
  const acc = tonic.includes('♯') ? 1 : tonic.includes('♭') ? -1 : 0;
  const pc0 = ((SEMI[tonic[0]] + acc) % 12 + 12) % 12;
  return new Set([0, 2, 4, 5, 7, 9, 11].map((x) => (pc0 + x) % 12));
}

/* ---------- 配置池 ---------- */

const TIER_NAMES = ['T0', 'T1', 'T2', 'T3', 'T4'] as const;
const TIERS: SeqProfile[] = [
  seqProfileOf(undefined, 0),
  seqProfileOf(0.9, 5),
  seqProfileOf(0.75, 5),
  seqProfileOf(0.6, 10),
  seqProfileOf(0.4, 10),
];
const KEYS: Array<{ type: SigType; n: number }> = [
  { type: 'sh', n: 0 },
  { type: 'sh', n: 3 },
  { type: 'sh', n: 6 },
  { type: 'sh', n: 7 },
  { type: 'fl', n: 1 },
  { type: 'fl', n: 4 },
  { type: 'fl', n: 7 },
];
const CLEFS: Clef[] = ['treble', 'bass'];

/* ---------- 综合校验（结构 + 行进 + 小节规则扫描） ---------- */

function checkSeq(seq: PlaySeq, type: SigType, n: number, clef: Clef, p: SeqProfile): void {
  const lo = 4 - p.stepSpan;
  const hi = 4 + p.stepSpan;

  // 结构
  expect(seq.notes).toHaveLength(p.len);
  expect(seq.bars).toEqual(
    Array.from({ length: Math.ceil(p.len / p.barLen) }, (_, i) => i * p.barLen),
  );
  // 首拍 = 主音（E/F 系主音最近八度距轴心 3），末拍回主音
  expect(headAt(seq.notes[0].step, clef).letter).toBe(tonicLetterOf(type, n));
  expect(Math.abs(seq.notes[0].step - 4)).toBeLessThanOrEqual(3);
  expect(headAt(seq.notes[p.len - 1].step, clef).letter).toBe(tonicLetterOf(type, n));

  // 逐拍：音组 step、span、midi 升序、|实际记号| ≤ 1、小节号
  seq.notes.forEach((note, i) => {
    expect(note.bar).toBe(Math.floor(i / p.barLen));
    const ns = note.steps;
    expect(ns).toBeDefined();
    expect(ns![0]).toBe(note.step);
    expect(ns!.length).toBe(note.midis.length);
    for (const st of ns!) {
      expect(st).toBeGreaterThanOrEqual(lo);
      expect(st).toBeLessThanOrEqual(hi);
    }
    for (let k = 0; k < note.midis.length; k++) {
      if (k > 0) expect(note.midis[k]).toBeGreaterThan(note.midis[k - 1]);
      const h = headAt(ns![k], clef);
      const actual = note.midis[k] - ((h.oct + 1) * 12 + SEMI[h.letter]);
      expect(Math.abs(actual)).toBeLessThanOrEqual(1);
      if (k === 0 && note.mark !== undefined) expect(actual).toBe(note.mark);
    }
  });

  // 跳进 ≤ leapMax、无连续同向大跳、触边界回折
  const st = seq.notes.map((nt) => nt.step);
  for (let i = 1; i < p.len; i++) {
    const d = st[i] - st[i - 1];
    expect(Math.abs(d)).toBeLessThanOrEqual(p.leapMax);
    if (i >= 2) {
      const pd = st[i - 1] - st[i - 2];
      const bothBig = Math.abs(d) >= 2 && Math.abs(pd) >= 2;
      expect(bothBig && Math.sign(d) === Math.sign(pd)).toBe(false);
    }
    if (i <= p.len - 2) {
      if (st[i - 1] === hi) expect(d).toBeLessThan(0);
      if (st[i - 1] === lo) expect(d).toBeGreaterThan(0);
    } else {
      if (st[i - 1] === hi) expect(d).toBeLessThanOrEqual(0);
      if (st[i - 1] === lo) expect(d).toBeGreaterThanOrEqual(0);
    }
  }

  // 小节规则扫描：注入即首现、延续不画记号但按变化音、新小节还原调号
  let bar = -1;
  const active = new Map<string, number>();
  for (const note of seq.notes) {
    if (note.bar !== bar) {
      bar = note.bar;
      active.clear();
    }
    const h = headAt(note.step, clef);
    const nat = (h.oct + 1) * 12 + SEMI[h.letter];
    const kAcc = keyAcc(h.letter, type, n);
    if (note.mark !== undefined) {
      expect(active.has(h.letter)).toBe(false); // 同字母同小节不重复注入
      expect(Math.abs(note.mark)).toBeLessThanOrEqual(1);
      expect(note.midis[0]).toBe(nat + note.mark);
      if (kAcc !== 0) {
        // 低档只还原为 ♮；高档（allowCarry=T3+）允许反号
        if (p.allowCarry) expect([0, -kAcc]).toContain(note.mark);
        else expect(note.mark).toBe(0);
      } else {
        expect(Math.abs(note.mark)).toBe(1);
      }
      active.set(h.letter, note.mark);
    } else if (active.has(h.letter)) {
      expect(note.midis[0]).toBe(nat + active.get(h.letter)!); // 同小节延续
    } else {
      expect(note.midis[0]).toBe(nat + kAcc); // 调内 / 新小节还原
    }
  }

  // 音域
  const all = seq.notes.flatMap((nt) => [...nt.midis]);
  expect(seq.loMidi).toBe(Math.min(...all));
  expect(seq.hiMidi).toBe(Math.max(...all));
}

/* ---------- seqProfileOf ---------- */

const T0: SeqProfile = { len: 6, stepSpan: 3, barLen: 4, accPerBar: 0.3, allowCarry: false, duoRate: 0, trioRate: 0, leapMax: 3 };
const T1: SeqProfile = { len: 8, stepSpan: 4, barLen: 4, accPerBar: 0.5, allowCarry: false, duoRate: 0.1, trioRate: 0, leapMax: 4 };
const T2: SeqProfile = { len: 10, stepSpan: 5, barLen: 4, accPerBar: 1, allowCarry: false, duoRate: 0.15, trioRate: 0, leapMax: 4 };
const T3: SeqProfile = { len: 12, stepSpan: 6, barLen: 4, accPerBar: 1, allowCarry: true, duoRate: 0.2, trioRate: 0, leapMax: 5 };
const T4: SeqProfile = { len: 16, stepSpan: 7, barLen: 4, accPerBar: 1.5, allowCarry: true, duoRate: 0.25, trioRate: 0.05, leapMax: 5 };

describe('seqProfileOf：5 档边界', () => {
  it('T0：samples < 3（含 ema 给值）或 ema 缺省', () => {
    expect(seqProfileOf(undefined, 0)).toEqual(T0);
    expect(seqProfileOf(undefined, 10)).toEqual(T0);
    expect(seqProfileOf(0.95, 2)).toEqual(T0);
    expect(seqProfileOf(0.1, 2)).toEqual(T0);
  });

  it('T1：ema ≥ 0.85', () => {
    expect(seqProfileOf(0.85, 5)).toEqual(T1);
    expect(seqProfileOf(1, 30)).toEqual(T1);
    expect(seqProfileOf(0.8499, 5)).toEqual(T2);
  });

  it('T2：0.70 ≤ ema < 0.85', () => {
    expect(seqProfileOf(0.7, 5)).toEqual(T2);
    expect(seqProfileOf(0.849, 5)).toEqual(T2);
    expect(seqProfileOf(0.6999, 5)).toEqual(T3);
  });

  it('T3：0.55 ≤ ema < 0.70；3~4 样本的低 ema 回退 T3', () => {
    expect(seqProfileOf(0.55, 5)).toEqual(T3);
    expect(seqProfileOf(0.69, 5)).toEqual(T3);
    expect(seqProfileOf(0.2, 4)).toEqual(T3); // T4 需 ≥5 样本
  });

  it('T4：ema < 0.55 且 ≥5 样本', () => {
    expect(seqProfileOf(0.5499, 5)).toEqual(T4);
    expect(seqProfileOf(0.1, 99)).toEqual(T4);
  });

  it('档位字段锁死（barLen 恒 4）', () => {
    expect(T0).toEqual({ len: 6, stepSpan: 3, barLen: 4, accPerBar: 0.3, allowCarry: false, duoRate: 0, trioRate: 0, leapMax: 3 });
    expect(T1).toEqual({ len: 8, stepSpan: 4, barLen: 4, accPerBar: 0.5, allowCarry: false, duoRate: 0.1, trioRate: 0, leapMax: 4 });
    expect(T2).toEqual({ len: 10, stepSpan: 5, barLen: 4, accPerBar: 1, allowCarry: false, duoRate: 0.15, trioRate: 0, leapMax: 4 });
    expect(T3).toEqual({ len: 12, stepSpan: 6, barLen: 4, accPerBar: 1, allowCarry: true, duoRate: 0.2, trioRate: 0, leapMax: 5 });
    expect(T4).toEqual({ len: 16, stepSpan: 7, barLen: 4, accPerBar: 1.5, allowCarry: true, duoRate: 0.25, trioRate: 0.05, leapMax: 5 });
  });

  it('每次返回新对象（外部改动不污染档位表）', () => {
    const a = seqProfileOf(0.9, 5);
    a.len = 99;
    expect(seqProfileOf(0.9, 5).len).toBe(8);
  });
});

/* ---------- midi / step 基准 ---------- */

describe('letterAccOctToMidi / noteAtStep', () => {
  it('C4=60、F♯4=66、B♭3=58', () => {
    expect(letterAccOctToMidi('C', 4)).toBe(60);
    expect(letterAccOctToMidi('F', 4, 1)).toBe(66);
    expect(letterAccOctToMidi('B', 3, -1)).toBe(58);
    expect(letterAccOctToMidi('c', 4)).toBe(60); // 大小写不敏感
  });

  it('未知音名抛 RangeError', () => {
    expect(() => letterAccOctToMidi('H', 4)).toThrow(RangeError);
  });

  it('noteAtStep 与 T_LET/T_OCT、B_LET/B_OCT 逐位吻合（step 0..8）', () => {
    for (let step = 0; step <= 8; step++) {
      expect(noteAtStep(step, 'treble'), `treble ${step}`).toEqual({ letter: T_LET[step], oct: T_OCT[step] });
      expect(noteAtStep(step, 'bass'), `bass ${step}`).toEqual({ letter: B_LET[step], oct: B_OCT[step] });
    }
  });
});

/* ---------- generateSeq 多种子综合断言 ---------- */

describe('generateSeq：结构 / 行进 / 小节规则（5 档 × 7 调 × 2 谱号 × 多种子）', () => {
  for (let ti = 0; ti < TIERS.length; ti++) {
    for (const { type, n } of KEYS) {
      for (const clef of CLEFS) {
        it(`${TIER_NAMES[ti]} ${type}${n} ${clef}：全套不变量`, () => {
          for (let seed = 1; seed <= 5; seed++) {
            const seq = generateSeq({ type, n, clef, profile: TIERS[ti], rng: makeRng(seed * 977 + ti) });
            checkSeq(seq, type, n, clef, TIERS[ti]);
          }
        });
      }
    }
  }
});

describe('generateSeq：确定性', () => {
  it('同种子同串', () => {
    const cfg = { type: 'sh' as const, n: 4, clef: 'treble' as const, profile: T3 };
    const a = generateSeq({ ...cfg, rng: makeRng(42) });
    const b = generateSeq({ ...cfg, rng: makeRng(42) });
    expect(a).toEqual(b);
  });

  it('不同种子不同串', () => {
    const cfg = { type: 'fl' as const, n: 5, clef: 'bass' as const, profile: T4 };
    const a = generateSeq({ ...cfg, rng: makeRng(7) });
    const b = generateSeq({ ...cfg, rng: makeRng(8) });
    expect(a).not.toEqual(b);
  });

  it('n 越界抛 RangeError', () => {
    expect(() => generateSeq({ type: 'sh', n: 8, clef: 'treble', profile: T0, rng: makeRng(1) })).toThrow(RangeError);
  });
});

describe('generateSeq：调内行进（accPerBar=0 时全部在大调音阶上）', () => {
  const P: SeqProfile = { len: 10, stepSpan: 5, barLen: 4, accPerBar: 0, allowCarry: false, duoRate: 0, trioRate: 0, leapMax: 4 };

  it('所有音的 pitch class ⊆ 该调大调音阶；midi = step 对应音 + 调号记号', () => {
    for (const { type, n } of KEYS) {
      const pcs = majorPcs(type, n);
      for (const clef of CLEFS) {
        for (let seed = 1; seed <= 6; seed++) {
          const seq = generateSeq({ type, n, clef, profile: P, rng: makeRng(seed * 31 + n) });
          for (const note of seq.notes) {
            expect(note.mark).toBeUndefined(); // 无注入 → 不画记号
            const h = headAt(note.step, clef);
            expect(note.midis[0]).toBe(natMidi(note.step, clef) + keyAcc(h.letter, type, n));
            expect(pcs.has(((note.midis[0] % 12) + 12) % 12)).toBe(true);
          }
        }
      }
    }
  });
});

/* ---------- 小节与临时记号规则 ---------- */

const RULE_TRUE: SeqProfile = { len: 12, stepSpan: 6, barLen: 4, accPerBar: 1, allowCarry: true, duoRate: 0, trioRate: 0, leapMax: 5 };
const RULE_FALSE: SeqProfile = { len: 12, stepSpan: 6, barLen: 4, accPerBar: 1, allowCarry: false, duoRate: 0, trioRate: 0, leapMax: 5 };

describe('小节与临时记号（真实规则）', () => {
  it('accPerBar=1：每小节恰好注入 1 个记号', () => {
    for (const { type, n } of KEYS) {
      for (let seed = 1; seed <= 5; seed++) {
        const seq = generateSeq({ type, n, clef: 'treble', profile: RULE_TRUE, rng: makeRng(seed * 13 + n) });
        for (const start of seq.bars) {
          const barIdx = start / RULE_TRUE.barLen;
          const count = seq.notes.filter((nt) => nt.bar === barIdx && nt.mark !== undefined).length;
          expect(count).toBe(1);
        }
      }
    }
  });

  it('accPerBar=0（且不安排延续）：全序列无任何记号', () => {
    const p: SeqProfile = { ...RULE_TRUE, accPerBar: 0, allowCarry: false };
    for (let seed = 1; seed <= 8; seed++) {
      const seq = generateSeq({ type: 'sh', n: 5, clef: 'bass', profile: p, rng: makeRng(seed) });
      expect(seq.notes.every((nt) => nt.mark === undefined)).toBe(true);
    }
  });

  /** 统计有「注入后同字母再现（mark undefined 且变化音延续）」的小节比例 */
  function carryRatio(seq: PlaySeq, clef: Clef): number {
    const injectedPerBar = new Map<number, Set<string>>();
    const carried = new Set<number>();
    for (const note of seq.notes) {
      const letter = headAt(note.step, clef).letter;
      if (note.mark !== undefined) {
        let set = injectedPerBar.get(note.bar);
        if (!set) {
          set = new Set();
          injectedPerBar.set(note.bar, set);
        }
        set.add(letter);
      } else if (injectedPerBar.get(note.bar)?.has(letter)) {
        carried.add(note.bar);
      }
    }
    return carried.size / seq.bars.length;
  }

  it('allowCarry=true（T3/T4）：≥30% 小节有延续', () => {
    for (const p of [T3, T4]) {
      for (const { type, n } of KEYS) {
        for (let seed = 1; seed <= 5; seed++) {
          const seq = generateSeq({ type, n, clef: 'treble', profile: p, rng: makeRng(seed * 7 + n) });
          expect(carryRatio(seq, 'treble'), `${p.len}拍 ${type}${n} seed${seed}`).toBeGreaterThanOrEqual(0.3);
        }
      }
    }
  });

  it('延续拍：mark undefined、midis 与注入拍一致（变化音延续而非调号原音）', () => {
    let sawCarry = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const seq = generateSeq({ type: 'sh', n: 3, clef: 'treble', profile: RULE_TRUE, rng: makeRng(seed * 101) });
      for (let i = 0; i + 2 < seq.notes.length; i++) {
        const a = seq.notes[i];
        const b = seq.notes[i + 2];
        if (a.bar !== b.bar || a.step !== b.step || a.mark === undefined) continue;
        expect(b.mark).toBeUndefined();
        expect(b.midis[0]).toBe(a.midis[0]);
        expect(b.midis[0]).not.toBe(natMidi(b.step, 'treble') + keyAcc(headAt(b.step, 'treble').letter, 'sh', 3));
        sawCarry++;
      }
    }
    expect(sawCarry).toBeGreaterThan(0);
  });

  it('新小节恢复调号：注入过的字母在下一小节不带延续（无记号则必为调号原音）', () => {
    let checked = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const seq = generateSeq({ type: 'fl', n: 4, clef: 'bass', profile: RULE_TRUE, rng: makeRng(seed * 17) });
      // 找「本小节注入、下一小节再现」的字母
      for (let i = 0; i < seq.notes.length; i++) {
        const note = seq.notes[i];
        if (note.mark === undefined) continue;
        const letter = headAt(note.step, 'bass').letter;
        const later = seq.notes.find(
          (nt) => nt.bar === note.bar + 1 && headAt(nt.step, 'bass').letter === letter,
        );
        if (!later) continue;
        checked++;
        if (later.mark === undefined) {
          // 未重新注入 → 必须回到调号原音（延续不跨小节）
          expect(later.midis[0]).toBe(natMidi(later.step, 'bass') + keyAcc(letter, 'fl', 4));
        } else {
          // 重新注入是新小节的新记号（mark 即实际音，扫描测试另证）
          expect(Math.abs(later.mark)).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('allowCarry=false：每小节注入字母只出现一次（含音组上方符头，无延续考点）', () => {
    for (const p of [{ ...RULE_FALSE, duoRate: 0.2 }, T2]) {
      for (const { type, n } of KEYS) {
        for (let seed = 1; seed <= 5; seed++) {
          const seq = generateSeq({ type, n, clef: 'treble', profile: p, rng: makeRng(seed * 23 + n) });
          for (const start of seq.bars) {
            const barIdx = start / p.barLen;
            const notes = seq.notes.filter((nt) => nt.bar === barIdx);
            for (const note of notes) {
              if (note.mark === undefined) continue;
              const letter = headAt(note.step, 'treble').letter;
              let count = 0;
              for (const nt of notes) {
                for (const st of nt.steps ?? [nt.step]) {
                  if (headAt(st, 'treble').letter === letter) count++;
                }
              }
              expect(count).toBe(1);
            }
          }
        }
      }
    }
  });
});

/* ---------- 音组 ---------- */

describe('音组（双/三音）', () => {
  const NO_GROUP: SeqProfile = { ...RULE_TRUE, duoRate: 0, trioRate: 0 };

  it('duoRate=0 / trioRate=0：全部单音', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const seq = generateSeq({ type: 'sh', n: 3, clef: 'treble', profile: NO_GROUP, rng: makeRng(seed) });
      expect(seq.notes.every((nt) => nt.midis.length === 1 && (nt.steps?.length ?? 0) === 1)).toBe(true);
    }
  });

  it('duoRate=0.3：200 个种子至少出现双音，且双音拍占比 ≤50%', () => {
    const p: SeqProfile = { len: 10, stepSpan: 5, barLen: 4, accPerBar: 0, allowCarry: false, duoRate: 0.3, trioRate: 0, leapMax: 4 };
    let duoBeats = 0;
    let total = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const seq = generateSeq({ type: 'sh', n: 2, clef: 'treble', profile: p, rng: makeRng(seed) });
      for (const nt of seq.notes) {
        total++;
        if (nt.midis.length > 1) duoBeats++;
      }
    }
    expect(duoBeats).toBeGreaterThan(0);
    expect(duoBeats / total).toBeLessThanOrEqual(0.5);
  });

  it('T4 出现三音，且音组 step 差合法（双音 {2,3,5}、三音相邻 {2,3}）', () => {
    let trios = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const seq = generateSeq({ type: 'fl', n: 6, clef: 'bass', profile: T4, rng: makeRng(seed) });
      for (const nt of seq.notes) {
        const ns = nt.steps!;
        if (ns.length === 3) {
          trios++;
          for (const d of [ns[1] - ns[0], ns[2] - ns[1]]) expect([2, 3]).toContain(d);
        } else if (ns.length === 2) {
          expect([2, 3, 5]).toContain(ns[1] - ns[0]);
        } else {
          expect(ns).toHaveLength(1);
        }
        expect(nt.midis).toHaveLength(ns.length);
      }
    }
    expect(trios).toBeGreaterThan(0);
  });
});

/* ---------- judgeStep / seqExplain ---------- */

describe('judgeStep：三态', () => {
  it('子集（双音没按全）→ wait', () => {
    expect(judgeStep([60, 64], [60])).toBe('wait');
    expect(judgeStep([60, 64, 67], [60, 67])).toBe('wait');
    expect(judgeStep([60], [])).toBe('wait');
  });

  it('集合相等（含八度、排序无关）→ ok', () => {
    expect(judgeStep([60, 64], [64, 60])).toBe('ok');
    expect(judgeStep([60], [60])).toBe('ok');
    expect(judgeStep([48, 72], [72, 48])).toBe('ok');
  });

  it('含错键（多按/按错）→ miss', () => {
    expect(judgeStep([60, 64], [60, 65])).toBe('miss');
    expect(judgeStep([60, 64], [60, 64, 67])).toBe('miss');
    expect(judgeStep([60], [61])).toBe('miss');
  });
});

describe('seqExplain：讲评文案', () => {
  it('零失误', () => {
    expect(seqExplain(-1, 0, 12)).toBe('全串 12 拍全部命中');
    expect(seqExplain(0, 0, 8)).toBe('全串 8 拍全部命中');
  });

  it('有失误：首次拍点 + 总失误数', () => {
    expect(seqExplain(2, 3, 12)).toBe('第 3 拍首次失误，共错 3/12 拍（25%）');
    expect(seqExplain(0, 1, 6)).toBe('第 1 拍首次失误，共错 1/6 拍（17%）');
  });
});
