/**
 * 谱面卡片组件：把 buildStaff 的 SVG 贴成一张「小谱纸」。
 */

import { renderStaff } from '../../engraving/render';
import type { StaffOptions } from '../../engraving/staff';
import type { Question } from '../../core/question-generator';
import { h } from '../dom';

export interface StaffViewOptions extends StaffOptions {
  /** 卡片下方的一行小字（如调号名 / 音位提示） */
  caption?: string;
  /** 小尺寸（锚点卡用） */
  mini?: boolean;
  className?: string;
}

/** 由题目推出谱面参数（认音题带目标音符） */
export function staffOptionsFor(q: Question, accent?: number): StaffOptions {
  const base: StaffOptions = { clef: q.clef, type: q.type, n: q.n };
  if (q.train === 'note' && q.step !== undefined) base.step = q.step;
  if (accent !== undefined) base.accent = accent;
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
