/**
 * 谱面卡片组件：把 buildStaff 的 SVG 贴成一张「小谱纸」。
 */

import { renderStaff } from '../../engraving/render';
import type { StaffNote, StaffOptions } from '../../engraving/staff';
import { chordSymbol, spellChord, type ChordSpec, type PitchName } from '../../core/chord-theory';
import type { Question } from '../../core/question-generator';
import { h } from '../dom';

export interface StaffViewOptions extends StaffOptions {
  /** 卡片下方的一行小字（如调号名 / 音位提示） */
  caption?: string;
  /** 小尺寸（锚点卡用） */
  mini?: boolean;
  className?: string;
}

const LETTERS = 'CDEFGAB';

/** 音名 + 八度 → 谱面 step（0=第1线，高音 E4 / 低音 G2 为基准）
 *  绝对音级坐标 d = oct*7 + 字母序(C=0…B=6)，与 seq-generator 同款，
 *  A/B 起始（根音）不再差八度。 */
function staffStepOf(p: PitchName, oct: number, clef: 'treble' | 'bass'): number {
  const d = oct * 7 + LETTERS.indexOf(p.letter);
  return d - (clef === 'treble' ? 4 * 7 + 2 : 2 * 7 + 4);
}

/** 和弦 → 谱面堆叠符头（root 起字母步进上行，跨字母升八度） */
function chordStaffNotes(spec: ChordSpec, clef: 'treble' | 'bass'): StaffNote[] {
  const parts = spellChord(spec);
  const out: StaffNote[] = [];
  let oct = clef === 'treble' ? 4 : 3;
  let prevLi = LETTERS.indexOf(parts[0].letter);
  parts.forEach((p, i) => {
    const li = LETTERS.indexOf(p.letter);
    if (i > 0 && li < prevLi) oct++;
    prevLi = li;
    const acc = Math.max(-2, Math.min(2, p.acc)) as StaffNote['acc'];
    out.push({ step: staffStepOf(p, oct, clef), acc });
  });
  return out;
}

/**
 * 由题目推出谱面参数（视奏题带首错/首拍符头；和弦题传 notes 堆叠 + chordSymbolText）。
 * @param firstErrIdx 视奏题回顾用：首错拍（0 起；缺省或负数显示首拍）
 */
export function staffOptionsFor(q: Question, accent?: number, firstErrIdx?: number): StaffOptions {
  const base: StaffOptions = { clef: q.clef, type: q.type, n: q.n };
  if (q.train === 'note') {
    const idx = firstErrIdx !== undefined && firstErrIdx >= 0 ? firstErrIdx : 0;
    const step = q.seq?.notes[idx]?.step ?? q.step;
    if (step !== undefined) base.step = step;
  }
  if (accent !== undefined) base.accent = accent;
  const cq = q.cq;
  if (cq?.chord) {
    base.notes = chordStaffNotes(cq.chord, q.clef);
    // notes2quality 不能露和弦号（性质就是答案）
    if (cq.kind !== 'notes2quality') base.chordSymbolText = chordSymbol(cq.chord);
  } else if (cq?.tonic) {
    base.notes = chordStaffNotes({ root: cq.tonic, quality: 'maj' }, q.clef).slice(0, 1);
  }
  return base;
}

/** 渲染一张谱面卡片 */
export function staffView(opts: StaffViewOptions): HTMLElement {
  const { caption, mini, className, ...staff } = opts;
  const canvas = h('div', { className: 'staff-card__canvas' });
  renderStaff(canvas, staff);
  return h(
    'figure',
    { className: `staff-card${mini ? ' staff-card--mini' : ''}${className ? ` ${className}` : ''}` },
    canvas,
    caption ? h('figcaption', { className: 'staff-card__caption', text: caption }) : null,
  );
}
