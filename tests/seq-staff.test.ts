/**
 * 视奏长谱渲染测试：viewBox 宽 = f(len)、调号只画一次且数量 = n、
 * qnote 分组、小节线/终止线、mark=0 画 ♮、音组堆叠符头 y、seqNoteX 单调。
 * 夹具手工构造 PlaySeq（锁定渲染契约），另用生成器实跑一遍做冒烟。
 */

import { describe, expect, it } from 'vitest';
import {
  buildSeqStaff,
  seqNoteX,
  seqStaffWidth,
  SEQ_HEADER,
  SEQ_NOTE_GAP,
  SEQ_TAIL,
} from '../src/engraving/seq-staff';
import { GLYPHS } from '../src/engraving/smufl-glyphs';
import { STAFF_BOTTOM, STAFF_S } from '../src/engraving/staff';
import { generateSeq, seqProfileOf, type PlaySeq, type SeqNote } from '../src/core/seq-generator';
import { makeRng } from '../src/core/question-generator';
import { FL_ORDER, SH_ORDER, type SigType } from '../src/core/music-theory';

/* ---------- 夹具 ---------- */

/** 高音谱号 step → midi（E4=0 基准，无调号） */
const TREBLE_MIDI = [64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84];
function midiAt(step: number): number {
  if (step >= 0 && step < TREBLE_MIDI.length) return TREBLE_MIDI[step];
  const d = 30 + step;
  const oct = Math.floor(d / 7);
  const semi = [0, 2, 4, 5, 7, 9, 11][d - oct * 7];
  return (oct + 1) * 12 + semi;
}

function singleSeq(steps: number[], marks?: Array<1 | -1 | 0 | undefined>): PlaySeq {
  const notes: SeqNote[] = steps.map((st, i) => {
    const note: SeqNote = { step: st, midis: [midiAt(st)], bar: Math.floor(i / 4), steps: [st] };
    if (marks && marks[i] !== undefined) note.mark = marks[i] as 1 | -1 | 0;
    return note;
  });
  const midis = notes.flatMap((nt) => [...nt.midis]);
  return { notes, bars: [0, 4, 8].filter((b) => b < notes.length), loMidi: Math.min(...midis), hiMidi: Math.max(...midis) };
}

/** 按字形 path 数据统计出现次数（调号区 vs 拍点区） */
function countGlyph(svg: string, name: keyof typeof GLYPHS): number {
  return svg.split(GLYPHS[name].d).length - 1;
}

function noteRegion(svg: string): string {
  const idx = svg.indexOf('<g class="qnote"');
  expect(idx).toBeGreaterThan(0);
  return svg.slice(idx);
}

/** 按渲染契约独立算出应画的记号数（mark + 音组上方符头 midi↔调号比对，高音谱号夹具） */
function expectedGlyphs(seq: PlaySeq, type: SigType, n: number): { sharp: number; flat: number; natural: number } {
  const out = { sharp: 0, flat: 0, natural: 0 };
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const altered = (type === 'sh' ? SH_ORDER : FL_ORDER).slice(0, n);
  const push = (acc: number): void => {
    if (acc > 0) out.sharp++;
    else if (acc < 0) out.flat++;
    else out.natural++;
  };
  for (const nt of seq.notes) {
    if (nt.mark !== undefined) push(nt.mark);
    const ns = nt.steps ?? [];
    for (let k = 1; k < ns.length; k++) {
      const d = 30 + ns[k];
      const oct = Math.floor(d / 7);
      const letter = LETTERS[d - oct * 7];
      const actual = nt.midis[k] - ((oct + 1) * 12 + SEMI[letter]);
      const key = altered.includes(letter) ? (type === 'sh' ? 1 : -1) : 0;
      if (actual !== key) push(actual);
    }
  }
  return out;
}

/* ---------- 几何 ---------- */

describe('几何常量与坐标', () => {
  it('SEQ_NOTE_GAP = 56；viewBox 宽 = SEQ_HEADER + len*GAP + 尾距', () => {
    expect(SEQ_NOTE_GAP).toBe(56);
    expect(seqStaffWidth(8)).toBe(SEQ_HEADER + 8 * SEQ_NOTE_GAP + SEQ_TAIL);
    for (const len of [1, 6, 12, 16, 40]) {
      expect(seqStaffWidth(len + 1) - seqStaffWidth(len)).toBe(SEQ_NOTE_GAP);
    }
  });

  it('buildSeqStaff 的 viewBox = 0 0 f(len) 170', () => {
    const seq = singleSeq([4, 2, 6, 0]);
    const svg = buildSeqStaff({ clef: 'treble', type: 'sh', n: 0, seq });
    expect(seq.notes).toHaveLength(4);
    expect(svg).toContain(`viewBox="0 0 ${seqStaffWidth(4)} 170"`);
    expect(seqStaffWidth(4)).toBe(SEQ_HEADER + 4 * SEQ_NOTE_GAP + SEQ_TAIL);
  });

  it('seqNoteX 单调递增，起点 = SEQ_HEADER', () => {
    expect(seqNoteX(0)).toBe(SEQ_HEADER);
    for (let i = 0; i < 50; i++) {
      expect(seqNoteX(i + 1)).toBeGreaterThan(seqNoteX(i));
      expect(seqNoteX(i + 1) - seqNoteX(i)).toBe(SEQ_NOTE_GAP);
    }
  });

  it('五线：5 条 sline 从 STAFF_X0 铺到右缘，y = bottom - i*(S/2)', () => {
    const svg = buildSeqStaff({ clef: 'treble', type: 'sh', n: 0, seq: singleSeq([4, 2]) });
    const W = seqStaffWidth(2);
    const lines = svg.match(/<line class="sline"[^/]*\/>/g) ?? [];
    expect(lines).toHaveLength(5);
    lines.forEach((ln, i) => {
      expect(ln).toContain(`y1="${STAFF_BOTTOM - i * STAFF_S}"`);
      expect(ln).toContain(`y2="${STAFF_BOTTOM - i * STAFF_S}"`);
      expect(ln).toContain(`x2="${W}"`);
    });
  });
});

/* ---------- 调号与谱号 ---------- */

describe('调号只在谱号后画一次', () => {
  it('3♯：调号区 accidentalSharp = n，拍点区 0，gClef 只出现一次', () => {
    const seq = singleSeq([4, 2, 6, 0, 8, 3, 5, 4]);
    const svg = buildSeqStaff({ clef: 'treble', type: 'sh', n: 3, seq });
    const head = svg.slice(0, svg.indexOf('<g class="qnote"'));
    expect(countGlyph(head, 'accidentalSharp')).toBe(3);
    expect(countGlyph(svg, 'accidentalSharp')).toBe(3); // 全串只来自调号
    expect(countGlyph(svg, 'gClef')).toBe(1);
    expect(countGlyph(head, 'gClef')).toBe(1); // 谱号只在最左端画一次
    expect(countGlyph(svg, 'fClef')).toBe(0);
  });

  it('2♭ / 7♭ / 0♯♭：数量与单次出现', () => {
    const seq = singleSeq([4, 2, 6, 0]);
    const fl2 = buildSeqStaff({ clef: 'treble', type: 'fl', n: 2, seq });
    expect(countGlyph(fl2, 'accidentalFlat')).toBe(2);
    expect(countGlyph(fl2, 'accidentalSharp')).toBe(0);
    const fl7 = buildSeqStaff({ clef: 'bass', type: 'fl', n: 7, seq });
    expect(countGlyph(fl7, 'accidentalFlat')).toBe(7);
    expect(countGlyph(fl7, 'fClef')).toBe(1);
    const n0 = buildSeqStaff({ clef: 'treble', type: 'sh', n: 0, seq });
    expect(countGlyph(n0, 'accidentalSharp')).toBe(0);
    expect(countGlyph(n0, 'accidentalFlat')).toBe(0);
  });

  it('n 越界抛 RangeError', () => {
    expect(() => buildSeqStaff({ clef: 'treble', type: 'sh', n: 8, seq: singleSeq([4]) })).toThrow(RangeError);
    expect(() => buildSeqStaff({ clef: 'treble', type: 'sh', n: -1, seq: singleSeq([4]) })).toThrow(RangeError);
  });
});

/* ---------- 拍点分组 / 记号 / 小节线 ---------- */

describe('拍点与记号渲染', () => {
  it('qnote 分组数 = len，data-i 从 0 递增', () => {
    const steps = [4, 2, 6, 0, 8, 3, 5, 4, 2, 7, 1, 6];
    const seq = singleSeq(steps);
    const svg = buildSeqStaff({ clef: 'treble', type: 'sh', n: 1, seq });
    const groups = svg.match(/<g class="qnote" data-i="\d+">/g) ?? [];
    expect(groups).toHaveLength(steps.length);
    groups.forEach((g, i) => expect(g).toContain(`data-i="${i}"`));
    // 符头数 = 拍点数（单音夹具）
    expect(svg.match(/<ellipse class="notehead"/g)).toHaveLength(steps.length);
    // 符头 y = bottom - step*(S/2)
    const ys = [...svg.matchAll(/<ellipse class="notehead" cx="[\d.]+" cy="([\d.]+)"/g)].map((m) => Number(m[1]));
    steps.forEach((st, i) => expect(ys[i]).toBe(STAFF_BOTTOM - st * (STAFF_S / 2)));
  });

  it('拍点区记号：mark 1/-1/0 → sharp/flat/natural，undefined 不画；调号区不受影响', () => {
    const seq = singleSeq([4, 2, 6, 0], [1, -1, 0, undefined]);
    const svg = buildSeqStaff({ clef: 'treble', type: 'sh', n: 2, seq });
    // 调号 2 个 sharp + 拍点 1 个 sharp = 3
    expect(countGlyph(svg, 'accidentalSharp')).toBe(2 + 1);
    expect(countGlyph(svg, 'accidentalFlat')).toBe(1);
    expect(countGlyph(svg, 'accidentalNatural')).toBe(1);
    // 拍点区的 sharp 只来自 mark=1（n=2 的调号全在 qnote 之前）
    const region = noteRegion(svg);
    expect(countGlyph(region, 'accidentalSharp')).toBe(1);
    expect(countGlyph(region, 'accidentalFlat')).toBe(1);
    expect(countGlyph(region, 'accidentalNatural')).toBe(1);
    // 记号类名
    expect(svg.match(/<g class="note-acc"/g)).toHaveLength(3);
  });

  it('小节线：bars 起始处细竖线（首拍省略）+ 末尾一细一粗终止线', () => {
    const seq = singleSeq([4, 2, 6, 0, 8, 3, 5, 4, 2, 7, 1, 6]);
    expect(seq.bars).toEqual([0, 4, 8]);
    const svg = buildSeqStaff({ clef: 'treble', type: 'sh', n: 0, seq });
    const interior = svg.match(/<line class="barline" /g) ?? [];
    expect(interior).toHaveLength(2); // bar 0 的首拍前线省略
    expect(svg).toContain(`<line class="barline" x1="${seqNoteX(4) - 24}"`);
    expect(svg).toContain(`<line class="barline" x1="${seqNoteX(8) - 24}"`);
    expect(svg.match(/class="barline-end/g) ?? []).toHaveLength(2); // 一细一粗
    expect(svg).toContain('barline-thick');
  });
});

/* ---------- 音组堆叠 ---------- */

describe('双/三音堆叠', () => {
  it('双音两符头：同 x，cy = bottom - step*(S/2)', () => {
    const seq: PlaySeq = {
      notes: [{ step: 2, midis: [67, 71], bar: 0, steps: [2, 4] }],
      bars: [0],
      loMidi: 67,
      hiMidi: 71,
    };
    const svg = buildSeqStaff({ clef: 'treble', type: 'sh', n: 0, seq });
    const heads = [...svg.matchAll(/<ellipse class="notehead" cx="([\d.]+)" cy="([\d.]+)"/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    expect(heads).toEqual([
      [seqNoteX(0), STAFF_BOTTOM - 2 * (STAFF_S / 2)],
      [seqNoteX(0), STAFF_BOTTOM - 4 * (STAFF_S / 2)],
    ]);
    expect(svg.match(/<rect class="stem"/g)).toHaveLength(1); // 单符干
    expect(svg.match(/<g class="qnote"/g)).toHaveLength(1);
  });

  it('步进差 1 兜底：后一个符头右移 9px', () => {
    const seq: PlaySeq = {
      notes: [{ step: 4, midis: [71, 72], bar: 0, steps: [4, 5] }],
      bars: [0],
      loMidi: 71,
      hiMidi: 72,
    };
    const svg = buildSeqStaff({ clef: 'treble', type: 'sh', n: 0, seq });
    const heads = [...svg.matchAll(/<ellipse class="notehead" cx="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(heads).toEqual([seqNoteX(0), seqNoteX(0) + 9]);
  });

  it('缺 steps 时按 midi 音程推导上方符头', () => {
    const seq: PlaySeq = {
      notes: [{ step: 2, midis: [67, 71], bar: 0 }],
      bars: [0],
      loMidi: 67,
      hiMidi: 71,
    };
    const svg = buildSeqStaff({ clef: 'treble', type: 'sh', n: 0, seq });
    const ys = [...svg.matchAll(/<ellipse class="notehead" cx="[\d.]+" cy="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(ys).toEqual([STAFF_BOTTOM - 2 * (STAFF_S / 2), STAFF_BOTTOM - 4 * (STAFF_S / 2)]);
  });

  it('上方符头临时记号：midi 与调号不符才画（调内上方音不画）', () => {
    const seq: PlaySeq = {
      notes: [{ step: 2, midis: [67, 72], bar: 0, steps: [2, 5] }], // G4 + C5，0♯♭ 调内
      bars: [0],
      loMidi: 67,
      hiMidi: 72,
    };
    const plain = buildSeqStaff({ clef: 'treble', type: 'sh', n: 0, seq });
    expect(countGlyph(plain, 'accidentalSharp')).toBe(0);
    expect(countGlyph(plain, 'accidentalFlat')).toBe(0);
    expect(countGlyph(plain, 'accidentalNatural')).toBe(0);
    // 上方音 C5 → C♯5（midi 72→73）：画 sharp
    const alt: PlaySeq = { ...seq, notes: [{ step: 2, midis: [67, 73], bar: 0, steps: [2, 5] }] };
    const svg = buildSeqStaff({ clef: 'treble', type: 'sh', n: 0, seq: alt });
    expect(countGlyph(svg, 'accidentalSharp')).toBe(1);
    // 调号字母被上方音还原（2♯ 下 C5 → C♮5）：画 natural
    const nat: PlaySeq = { ...seq, notes: [{ step: 2, midis: [67, 72], bar: 0, steps: [2, 5] }] };
    const svgN = buildSeqStaff({ clef: 'treble', type: 'sh', n: 2, seq: nat });
    expect(countGlyph(svgN, 'accidentalNatural')).toBe(1);
  });
});

/* ---------- 与生成器联跑冒烟 ---------- */

describe('生成器 → 渲染冒烟', () => {
  it('T4 序列渲染：qnote 数 = len、调号数量 = n、加线出现', () => {
    const profile = seqProfileOf(0.4, 10); // T4：len 16 / span 7
    const seq = generateSeq({ type: 'sh', n: 3, clef: 'treble', profile, rng: makeRng(2026) });
    const svg = buildSeqStaff({ clef: 'treble', type: 'sh', n: 3, seq });
    expect(svg).toContain(`viewBox="0 0 ${seqStaffWidth(16)} 170"`);
    expect(svg.match(/<g class="qnote" data-i="\d+">/g) ?? []).toHaveLength(16);
    // 调号 3 个 sharp + 拍点区记号（mark + 音组上方符头）
    const want = expectedGlyphs(seq, 'sh', 3);
    expect(countGlyph(svg, 'accidentalSharp')).toBe(3 + want.sharp);
    expect(countGlyph(svg, 'accidentalFlat')).toBe(want.flat);
    expect(countGlyph(svg, 'accidentalNatural')).toBe(want.natural);
    // 音组：符头总数 = 所有符头数
    const headCount = seq.notes.reduce((acc, nt) => acc + nt.steps!.length, 0);
    expect(svg.match(/<ellipse class="notehead"/g) ?? []).toHaveLength(headCount);
    // span 7（step ≤ 11 / ≥ -2）内会出现加线（step 10/11 或 -2 等）
    const hasLedger = seq.notes.some((nt) => nt.steps!.some((st) => st >= 10 || st <= -2));
    expect(svg.includes('class="ledger"')).toBe(hasLedger);
    // 颜色走 CSS 变量
    expect(svg).toContain('var(--staff)');
    expect(svg).toContain('var(--staff-ink)');
    expect(svg).not.toContain('#000');
  });
});
