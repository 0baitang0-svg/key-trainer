/**
 * 演奏式视奏序列：给定调号与难度档，生成「一长串拍点」的调内行进谱面
 * （小节 / 临时记号 / 同小节延续 / 双三音组）→ 判题目标（midi 串）。
 * 纯函数：全部随机逻辑吃注入 rng，同种子同串；不依赖 DOM / audio 层
 * （noteToMidi 逻辑迁移为 letterAccOctToMidi，保持单向依赖）。
 */

import { FL_MAJ, FL_ORDER, SH_MAJ, SH_ORDER, type Clef, type SigType } from './music-theory';

/* ---------- 类型 ---------- */

export interface SeqProfile {
  len: number;          // 拍点数（单音或音组）
  stepSpan: number;     // 谱面 step 相对轴心(4)的半宽
  barLen: number;       // 每小节拍点数（默认 4）
  accPerBar: number;    // 每小节期望临时记号数
  allowCarry: boolean;  // 是否安排同小节临时记号延续考验
  duoRate: number;      // 双音率 0..0.3
  trioRate: number;     // 三音率（仅高档）
  leapMax: number;      // 最大跳进 step 数
}

export interface SeqNote {
  /** 谱面位置 0=第1线（可越界加线）＝ 最低符头 step */
  step: number;
  /** 画在谱面的记号 1=♯ -1=♭ 0=♮；undefined=不画（同小节延续也不画） */
  mark?: 1 | -1 | 0;
  /** 判题目标：精确 midi 升序 */
  midis: readonly number[];
  /** 小节序号 */
  bar: number;
  /** 各符头 step（升序，steps[0] === step）；缺省时渲染端按 midi 音程推导 */
  steps?: readonly number[];
}

export interface PlaySeq {
  notes: SeqNote[];             // 每项=一个拍点（单音或音组）
  bars: readonly number[];      // 小节起始索引（画小节线）
  loMidi: number;
  hiMidi: number;
}

/* ---------- 音名 ↔ 坐标 ---------- */

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * step 基准（同 staffStepOf：高音 E4=0 / 低音 G2=0，step=距底线半间数）。
 * 用绝对音级坐标 d = oct*7 + 字母序（C=0…B=6），与 T_LET/T_OCT 表逐音吻合。
 */
const STEP_BASE: Record<Clef, number> = { treble: 4 * 7 + 2 /* E4 */, bass: 2 * 7 + 4 /* G2 */ };

/** 音名 + 八度 + 临时记号 → MIDI（C4=60；自 melody-synth.noteToMidi 迁入） */
export function letterAccOctToMidi(letter: string, oct: number, acc = 0): number {
  const semi = LETTER_SEMI[letter.toUpperCase()];
  if (semi === undefined) throw new RangeError(`未知音名 ${letter}`);
  return (oct + 1) * 12 + semi + acc;
}

/** 谱面 step → 音名 + 八度（升降拼写由调号/记号另算） */
export function noteAtStep(step: number, clef: Clef): { letter: string; oct: number } {
  const d = STEP_BASE[clef] + step;
  const oct = Math.floor(d / 7);
  return { letter: LETTERS[d - oct * 7], oct };
}

/* ---------- 难度档 ---------- */

const TIERS: readonly SeqProfile[] = [
  // T0：samples < 3 或 ema 缺省
  { len: 6, stepSpan: 3, barLen: 4, accPerBar: 0.3, allowCarry: false, duoRate: 0, trioRate: 0, leapMax: 3 },
  // T1：ema ≥ 0.85
  { len: 8, stepSpan: 4, barLen: 4, accPerBar: 0.5, allowCarry: false, duoRate: 0.1, trioRate: 0, leapMax: 4 },
  // T2：0.70 ≤ ema < 0.85
  { len: 10, stepSpan: 5, barLen: 4, accPerBar: 1, allowCarry: false, duoRate: 0.15, trioRate: 0, leapMax: 4 },
  // T3：0.55 ≤ ema < 0.70
  { len: 12, stepSpan: 6, barLen: 4, accPerBar: 1, allowCarry: true, duoRate: 0.2, trioRate: 0, leapMax: 5 },
  // T4：ema < 0.55 且 ≥5 样本
  { len: 16, stepSpan: 7, barLen: 4, accPerBar: 1.5, allowCarry: true, duoRate: 0.25, trioRate: 0.05, leapMax: 5 },
];

/** 5 档难度表：samples < 3 或 ema 缺省视同 T0；T4 需 ≥5 样本（3~4 样本回退 T3） */
export function seqProfileOf(ema: number | undefined, samples: number): SeqProfile {
  if (samples < 3 || ema === undefined) return { ...TIERS[0] };
  let tier: number;
  if (ema >= 0.85) tier = 1;
  else if (ema >= 0.7) tier = 2;
  else if (ema >= 0.55) tier = 3;
  else tier = samples >= 5 ? 4 : 3;
  return { ...TIERS[tier] };
}

/**
 * 难度档编码（错题 key 第 9 段用）：`{len}.{span}.{bar}.{acc}.{duo}`。
 * 5 档的前 5 个字段互不相同，编码可唯一反查档位。
 */
export function seqProfileCode(p: SeqProfile): string {
  return `${p.len}.${p.stepSpan}.${p.barLen}.${p.accPerBar}.${p.duoRate}`;
}

/** 难度档编码 → 难度档（查不到返回 null，调用方退回默认档） */
export function seqProfileByCode(code: string): SeqProfile | null {
  const hit = TIERS.find((t) => seqProfileCode(t) === code);
  return hit ? { ...hit } : null;
}

/* ---------- 序列生成 ---------- */

/** 运动权重：级进 ±1=0.60、三度 ±2/3=0.25、四五度 ±4/5=0.10、六八度 ≤0.05（拆到单个 delta） */
function magWeight(d: number): number {
  const a = Math.abs(d);
  if (a === 1) return 0.6 / 2;
  if (a <= 3) return 0.25 / 4;
  if (a <= 5) return 0.1 / 4;
  if (a <= 8) return 0.05 / 6;
  return 0;
}

interface Cand {
  d: number;
  w: number;
}

export function generateSeq(opts: {
  type: SigType;
  n: number;
  clef: Clef;
  profile: SeqProfile;
  rng: () => number;
}): PlaySeq {
  const { type, n, clef, profile, rng } = opts;
  if (!Number.isInteger(n) || n < 0 || n > 7) {
    throw new RangeError(`升降号个数 n 必须是 0..7 的整数，收到 ${n}`);
  }
  const len = profile.len;
  const { barLen, stepSpan, leapMax, allowCarry } = profile;
  const lo = 4 - stepSpan;
  const hi = 4 + stepSpan;
  const cap = Math.min(leapMax, 8);

  // 调号 → 各字母的实际记号（大调音阶 = 7 个字母各一次，n 决定调号）
  const tonic = (type === 'sh' ? SH_MAJ : FL_MAJ)[n];
  const tonicLetter = tonic[0];
  const altered = (type === 'sh' ? SH_ORDER : FL_ORDER).slice(0, n);
  const keyAcc = (letter: string): 1 | -1 | 0 => {
    if (!altered.includes(letter)) return 0;
    return type === 'sh' ? 1 : -1;
  };

  // 主音候选（调内 step 落在轴心附近；E/F 系主音最近八度距轴心 3）
  const tonicSteps: number[] = [];
  for (let s = lo; s <= hi; s++) if (noteAtStep(s, clef).letter === tonicLetter) tonicSteps.push(s);
  const first = tonicSteps.reduce((a, b) => (Math.abs(b - 4) < Math.abs(a - 4) ? b : a));

  const barStarts: number[] = [];
  for (let s = 0; s < len; s += barLen) barStarts.push(s);

  // 延续考验小节（节内拍 s+1 与 s+3 同音同位；仅完整且不落在末拍的小节）
  const cand = barStarts.filter((s) => s + 3 <= len - 2 && s + 3 < s + barLen);
  const wantCarry =
    allowCarry && cand.length > 0
      ? Math.min(cand.length, Math.max(1, Math.ceil(0.3 * barStarts.length)))
      : 0;
  const picked = [...cand];
  for (let i = 0; i < wantCarry; i++) {
    const j = i + Math.floor(rng() * (picked.length - i));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  const carryBars = new Set(picked.slice(0, wantCarry).map((s) => s / barLen));

  /* --- 行进 --- */

  const steps: number[] = new Array(len);
  steps[0] = first;
  const inZ = (s: number): boolean => tonicSteps.some((t) => Math.abs(t - s) <= leapMax);
  /** 末拍组合兼容：同向且都 ≥2 的大跳连续出现被禁止 */
  const compatFinal = (d: number, tf: number): boolean =>
    Math.abs(d) <= 1 || Math.abs(tf) <= 1 || Math.sign(d) !== Math.sign(tf);
  /** 从 s 出发、|步进| ≤ leapMax 且与 pd 组合合法的回主音候选 */
  const finalTargets = (s: number, pd: number): number[] =>
    tonicSteps.filter((t) => Math.abs(t - s) <= leapMax && compatFinal(pd, t - s));

  const candidatesAt = (i: number): Cand[] => {
    const prev = steps[i - 1];
    const pd = i >= 2 ? steps[i - 1] - steps[i - 2] : 0;
    const out: Cand[] = [];
    for (let d = -cap; d <= cap; d++) {
      if (d === 0) continue;
      const ns = prev + d;
      if (ns < lo || ns > hi) continue;
      if (i <= len - 2 && !inZ(ns)) continue; // 中段保持「可达主音」区域
      if (prev === hi && d > 0) continue;     // 触边界必回折
      if (prev === lo && d < 0) continue;
      if (Math.abs(d) >= 2 && Math.abs(pd) >= 2 && Math.sign(d) === Math.sign(pd)) continue;
      if (i === len - 2 && finalTargets(ns, d).length === 0) continue; // 保证末拍回得去
      out.push({ d, w: magWeight(d) });
    }
    return out;
  };

  const pick = (cands: Cand[]): number => {
    let total = 0;
    for (const c of cands) total += c.w;
    let r = rng() * total;
    for (const c of cands) {
      r -= c.w;
      if (r <= 0) return c.d;
    }
    return cands[cands.length - 1].d;
  };

  for (let i = 1; i < len - 1; i++) {
    const bar = Math.floor(i / barLen);
    const isCarryForce = carryBars.has(bar) && i === bar * barLen + 3;
    const cands = candidatesAt(i);
    if (isCarryForce) {
      // 回到本小节拍 s+1（s+3 与 s+1 同音 → 同字母再现延续考点）
      const d = steps[i - 2] - steps[i - 1];
      if (cands.some((c) => c.d === d)) steps[i] = steps[i - 1] + d;
      else {
        steps[i] = steps[i - 1] + pick(cands); // 理论不可达：模式失败则放弃该小节延续
        carryBars.delete(bar);
      }
    } else {
      steps[i] = steps[i - 1] + pick(cands);
    }
  }
  // 末拍回主音（允许停留在已到的主音上）
  {
    const i = len - 1;
    const prev = steps[i - 1];
    const pd = i >= 2 ? steps[i - 1] - steps[i - 2] : 0;
    let cands = finalTargets(prev, pd).map((t) => ({ t, d: t - prev }));
    if (cands.length === 0) cands = tonicSteps.filter((t) => Math.abs(t - prev) <= leapMax).map((t) => ({ t, d: t - prev }));
    if (cands.length > 0) {
      let total = 0;
      for (const c of cands) total += c.d === 0 ? magWeight(1) : magWeight(c.d);
      let r = rng() * total;
      let chosen = cands[cands.length - 1];
      for (const c of cands) {
        r -= c.d === 0 ? magWeight(1) : magWeight(c.d);
        if (r <= 0) {
          chosen = c;
          break;
        }
      }
      steps[i] = chosen.t;
    } else {
      steps[i] = prev; // T 为空（仅非档配置可能出现）
    }
  }

  // 终验延续模式
  for (const bar of [...carryBars]) {
    const s = bar * barLen;
    if (steps[s + 3] !== steps[s + 1]) carryBars.delete(bar);
  }

  /* --- 音组（双/三音，只占中段拍点） --- */

  const extras: Array<Array<{ step: number; acc?: 1 | -1 | 0 }>> = Array.from({ length: len }, () => []);
  /** 变化音选择：调号外字母 ±半音；调号升降字母低档只还原、高档（allowCarry）允许反号 */
  const chooseAcc = (letter: string): 1 | -1 | 0 => {
    const k = keyAcc(letter);
    if (k === 0) return rng() < 0.5 ? 1 : -1;
    if (!allowCarry) return 0;
    if (rng() < 0.5) return 0;
    return k === 1 ? -1 : 1;
  };
  const pickInterval = (): 2 | 3 | 5 => (rng() < 0.7 ? (rng() < 0.5 ? 2 : 3) : 5);

  for (let i = 1; i <= len - 2; i++) {
    const s = steps[i];
    const wantTrio = rng() < profile.trioRate;
    const wantDuo = rng() < profile.duoRate;
    if (wantTrio) {
      const d1: 2 | 3 = rng() < 0.5 ? 2 : 3;
      const d2: 2 | 3 = rng() < 0.5 ? 2 : 3;
      if (s + d1 + d2 <= hi) {
        extras[i].push({ step: s + d1 });
        extras[i].push({ step: s + d1 + d2, acc: chooseAcc(noteAtStep(s + d1 + d2, clef).letter) });
        continue;
      }
    }
    if (wantDuo) {
      const d = pickInterval();
      if (s + d <= hi) extras[i].push({ step: s + d, acc: chooseAcc(noteAtStep(s + d, clef).letter) });
    }
  }

  /* --- 小节与临时记号注入 --- */

  const injections = new Map<number, 1 | -1 | 0>(); // beat → 实际记号
  const headSteps = (i: number): number[] => [steps[i], ...extras[i].map((e) => e.step)];
  const letterCountInBar = (beat: number, letter: string): number => {
    const s = Math.floor(beat / barLen) * barLen;
    let c = 0;
    for (let j = s; j < Math.min(s + barLen, len); j++) {
      for (const st of headSteps(j)) if (noteAtStep(st, clef).letter === letter) c++;
    }
    return c;
  };

  const frac = profile.accPerBar - Math.floor(profile.accPerBar);
  for (let b = 0; b < barStarts.length; b++) {
    const s = barStarts[b];
    const e = Math.min(s + barLen, len);
    const isCarry = carryBars.has(b);
    const k = Math.floor(profile.accPerBar) + (rng() < frac ? 1 : 0);
    const target = Math.max(k, isCarry ? 1 : 0);
    if (target === 0) continue;
    // 首拍=主音锚、末拍=回主音，都不注入
    const eligible: number[] = [];
    for (let i = Math.max(s, 1); i <= Math.min(e - 1, len - 2); i++) eligible.push(i);
    const chosen: number[] = [];
    const active = new Set<string>();
    if (isCarry && eligible.includes(s + 1)) {
      chosen.push(s + 1);
      active.add(noteAtStep(steps[s + 1], clef).letter);
    }
    if (chosen.length < target) {
      const rest = eligible.filter((i) => !chosen.includes(i));
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      for (const i of rest) {
        if (chosen.length >= target) break;
        const letter = noteAtStep(steps[i], clef).letter;
        if (active.has(letter)) continue;
        if (!allowCarry && letterCountInBar(i, letter) !== 1) continue; // 无延续考点
        chosen.push(i);
        active.add(letter);
      }
    }
    for (const i of chosen) injections.set(i, chooseAcc(noteAtStep(steps[i], clef).letter));
  }

  /* --- midi 汇出（同小节同字母延续、新小节还原调号） --- */

  const notes: SeqNote[] = [];
  const activeAcc = new Map<string, 1 | -1 | 0>();
  let curBar = -1;
  for (let i = 0; i < len; i++) {
    const bar = Math.floor(i / barLen);
    if (bar !== curBar) {
      curBar = bar;
      activeAcc.clear();
    }
    const injAcc = injections.get(i);
    const heads = headSteps(i);
    const midis: number[] = [];
    let mark: 1 | -1 | 0 | undefined;
    for (let k = 0; k < heads.length; k++) {
      const { letter, oct } = noteAtStep(heads[k], clef);
      let acc: number;
      if (k === 0 && injAcc !== undefined) {
        acc = injAcc;
        mark = injAcc;
        activeAcc.set(letter, injAcc);
      } else {
        const carried = activeAcc.get(letter);
        if (carried !== undefined) acc = carried; // 同小节延续（不画记号）
        else if (k > 0) acc = extras[i][k - 1].acc ?? keyAcc(letter);
        else acc = keyAcc(letter);
      }
      midis.push(letterAccOctToMidi(letter, oct, acc));
    }
    const note: SeqNote = { step: steps[i], midis, bar, steps: heads };
    if (mark !== undefined) note.mark = mark;
    notes.push(note);
  }

  let loMidi = Infinity;
  let hiMidi = -Infinity;
  for (const nt of notes) {
    for (const m of nt.midis) {
      if (m < loMidi) loMidi = m;
      if (m > hiMidi) hiMidi = m;
    }
  }
  return { notes, bars: barStarts, loMidi, hiMidi };
}

/* ---------- 判题与文案 ---------- */

/**
 * 拍点判题：按下 ⊂ 目标（双音没按全）→ 'wait'；集合相等（含八度、排序无关）→ 'ok'；
 * 含错键 → 'miss'。
 */
export function judgeStep(target: readonly number[], pressed: readonly number[]): 'wait' | 'ok' | 'miss' {
  const t = new Set(target);
  const p = new Set(pressed);
  for (const x of p) if (!t.has(x)) return 'miss';
  return p.size === t.size ? 'ok' : 'wait';
}

/**
 * 串级讲评。
 * @param firstErrIdx 首个出错拍点（0 起；无出错传 -1）
 * @param total       失误拍数
 * @param len         序列拍点数
 */
export function seqExplain(firstErrIdx: number, total: number, len: number): string {
  if (total <= 0 || firstErrIdx < 0) return `全串 ${len} 拍全部命中`;
  const pct = Math.round((total / Math.max(1, len)) * 100);
  return `第 ${firstErrIdx + 1} 拍首次失误，共错 ${total}/${len} 拍（${pct}%）`;
}
