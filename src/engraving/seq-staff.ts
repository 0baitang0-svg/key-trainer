/**
 * 演奏式视奏长谱渲染：谱号 + 谱号后仅画一次的调号（位于 svg 最左端，
 * 视窗平移时自然滑出左侧）+ 一长串拍点音符 + 小节线/终止线 → SVG 字符串。
 * 复用 staff.ts 的字形与几何常量（ledgerLine 未导出，在此实现等价私有函数），
 * 不修改 staff.ts。
 */

import { GLYPHS, type GlyphName } from './smufl-glyphs';
import { BFL, BSH, TFL, TSH } from './key-signature-slots';
import { glyphSVG, STAFF_BOTTOM, STAFF_S, STAFF_X0, type Clef, type SigType } from './staff';
import { FL_ORDER, SH_ORDER } from '../core/music-theory';
import { letterAccOctToMidi, noteAtStep, type PlaySeq, type SeqNote } from '../core/seq-generator';

/** 谱号 + 调号占位宽（首拍 x 起点；与升降号个数无关 → 视窗锚点稳定） */
export const SEQ_HEADER = 248;
/** 拍点间距 */
export const SEQ_NOTE_GAP = 56;
/** 末拍到 viewBox 右缘的尾距（含终止线与留白） */
export const SEQ_TAIL = 16;

/** 第 i 拍点的 svg x（滚动引擎锚点） */
export function seqNoteX(i: number): number {
  return SEQ_HEADER + i * SEQ_NOTE_GAP;
}

/** 谱面总宽（viewBox 宽） */
export function seqStaffWidth(len: number): number {
  return SEQ_HEADER + len * SEQ_NOTE_GAP + SEQ_TAIL;
}

/** 加线（staff.ts 未导出，等价实现） */
function ledgerLine(cx: number, y: number): string {
  return (
    '<line class="ledger" x1="' + (cx - 11) + '" y1="' + y + '" x2="' + (cx + 11) + '" y2="' + y +
    '" stroke="var(--staff-ink)" stroke-width="1.6"/>'
  );
}

function hline(cls: string, x1: number, x2: number, y: number, w: number): string {
  return (
    '<line class="' + cls + '" x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y +
    '" stroke="var(--staff)" stroke-width="' + w + '"/>'
  );
}

function vline(cls: string, x: number, w: number): string {
  const top = STAFF_BOTTOM - 4 * STAFF_S;
  return (
    '<line class="' + cls + '" x1="' + x + '" y1="' + top + '" x2="' + x + '" y2="' + STAFF_BOTTOM +
    '" stroke="var(--staff)" stroke-width="' + w + '"/>'
  );
}

/** 调号 → 各字母实际记号 */
function keyAccOf(letter: string, type: SigType, n: number): 1 | -1 | 0 {
  const order = type === 'sh' ? SH_ORDER : FL_ORDER;
  if (!order.slice(0, n).includes(letter)) return 0;
  return type === 'sh' ? 1 : -1;
}

/** 无 steps 时按相邻 midi 音程推导上方符头 step（≤4=三度、5~7=四五度、8+=六度） */
function deriveSteps(note: SeqNote): number[] {
  const out = [note.step];
  for (let k = 1; k < note.midis.length; k++) {
    const gap = note.midis[k] - note.midis[k - 1];
    out.push(out[k - 1] + (gap <= 4 ? 2 : gap <= 7 ? 3 : 5));
  }
  return out;
}

/** 单个拍点：符头堆叠 + 临时记号 + 加线 + 符干 → <g class="qnote"> */
function renderNote(note: SeqNote, i: number, clef: Clef, type: SigType, n: number): string {
  const S = STAFF_S;
  const half = S / 2;
  const cx = seqNoteX(i);
  const heads = note.steps ?? deriveSteps(note);
  // 二度（step 差 1）时后一个符头右移 9px 兜底
  const placed: Array<{ step: number; x: number; y: number }> = [];
  for (const st of heads) {
    let x = cx;
    for (const p of placed) {
      if (Math.abs(p.step - st) === 1) x = Math.max(x, p.x + 9);
    }
    placed.push({ step: st, x, y: STAFF_BOTTOM - st * half });
  }

  let g = '<g class="qnote" data-i="' + i + '">';
  // 加线：step 谱外时按偶数 step 补短横线
  for (const p of placed) {
    for (let e = -2; e >= p.step; e -= 2) g += ledgerLine(p.x, STAFF_BOTTOM - e * half);
    for (let e = 10; e <= p.step; e += 2) g += ledgerLine(p.x, STAFF_BOTTOM - e * half);
  }
  // 临时记号：首符头按 mark（undefined 不画，同小节延续也不画）；其余符头按 midi 与调号比对
  const u = S / 250;
  placed.forEach((p, k) => {
    let glyph: GlyphName | null = null;
    if (k === 0) {
      if (note.mark === 1) glyph = 'accidentalSharp';
      else if (note.mark === -1) glyph = 'accidentalFlat';
      else if (note.mark === 0) glyph = 'accidentalNatural';
    } else {
      const { letter, oct } = noteAtStep(p.step, clef);
      const actual = note.midis[k] - letterAccOctToMidi(letter, oct);
      if (actual !== keyAccOf(letter, type, n)) {
        glyph = actual > 0 ? 'accidentalSharp' : actual < 0 ? 'accidentalFlat' : 'accidentalNatural';
      }
    }
    if (glyph) {
      const off = -GLYPHS[glyph].adv * u * 0.5;
      g += glyphSVG(glyph, p.x - 16 + off, p.y, S, 'var(--staff-ink)', undefined, 'note-acc');
    }
  });
  // 符头
  for (const p of placed) {
    g +=
      '<ellipse class="notehead" cx="' + p.x + '" cy="' + p.y +
      '" rx="7.6" ry="5.4" transform="rotate(-16 ' + p.x + ' ' + p.y + ')" fill="var(--staff-ink)"/>';
  }
  // 单符干：从最低音符头出发（step<4 向上，否则向下）
  const lowest = placed.reduce((a, b) => (b.y > a.y ? b : a));
  if (lowest.step < 4) {
    g += '<rect class="stem" x="' + (lowest.x + 6.9) + '" y="' + (lowest.y - 43) +
      '" width="1.7" height="44" fill="var(--staff-ink)"/>';
  } else {
    g += '<rect class="stem" x="' + (lowest.x - 8.6) + '" y="' + (lowest.y - 1) +
      '" width="1.7" height="44" fill="var(--staff-ink)"/>';
  }
  return g + '</g>';
}

export interface SeqStaffOptions {
  clef: Clef;
  type: SigType;
  /** 升/降号个数 0..7 */
  n: number;
  seq: PlaySeq;
}

/** 构建整条视奏长谱（含外层 <svg>，viewBox 宽 = f(len)） */
export function buildSeqStaff(opts: SeqStaffOptions): string {
  const { clef, type, n, seq } = opts;
  if (!Number.isInteger(n) || n < 0 || n > 7) {
    throw new RangeError(`n 必须是 0..7 的整数，收到 ${n}`);
  }
  const S = STAFF_S;
  const bottom = STAFF_BOTTOM;
  const W = seqStaffWidth(seq.notes.length);
  let s = '<svg class="staff seq-staff" viewBox="0 0 ' + W + ' 170" role="img">';

  // 五线（长谱：从 STAFF_X0 铺到右缘）+ 首端封口
  for (let i = 0; i < 5; i++) s += hline('sline', STAFF_X0, W, bottom - i * S, 1.1);
  s += vline('send', STAFF_X0, 1.1);

  // 谱号
  const treble = clef === 'treble';
  const clefName: GlyphName = treble ? 'gClef' : 'fClef';
  const clefY = treble ? bottom - S : bottom - 3 * S;
  s += glyphSVG(clefName, 56, clefY, S, 'var(--staff-ink)', undefined, 'clef');

  // 调号（只在谱号后画一次；槽位查 key-signature-slots）
  if (n > 0) {
    const slotSteps = treble ? (type === 'sh' ? TSH : TFL) : type === 'sh' ? BSH : BFL;
    const gname: GlyphName = type === 'sh' ? 'accidentalSharp' : 'accidentalFlat';
    const u = S / 250;
    const off = type === 'sh' ? -124.5 * u : -120 * u;
    let x = 56 + GLYPHS[clefName].adv * u + 1.15 * S;
    for (let i = 0; i < n; i++) {
      s += glyphSVG(gname, x + off, bottom - slotSteps[i] * (S / 2), S, 'var(--staff-ink)', undefined, 'acc');
      x += 1.3 * S;
    }
  }

  // 小节线（bars 给出的小节起始处细竖线；首拍前的省略）
  for (const b of seq.bars) {
    if (b <= 0) continue;
    s += vline('barline', seqNoteX(b) - 24, 1.1);
  }

  // 拍点
  seq.notes.forEach((note, i) => {
    s += renderNote(note, i, clef, type, n);
  });

  // 终止线（一细一粗）
  const endX = seqNoteX(seq.notes.length - 1) + 40;
  s += vline('barline-end', endX, 1.1);
  s += vline('barline-end barline-thick', endX + 6, 2.6);

  return s + '</svg>';
}
