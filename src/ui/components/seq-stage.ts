/**
 * 视奏滚动谱面视窗：外层 overflow hidden，内层长谱 svg 按 CSS 像素平移，
 * 当前拍锚定在视窗左起 35%。偏移计算抽成纯函数 offsetFor（可单测），
 * 平移量按 svg 实测缩放（rect.width / viewBox 宽）换算，ResizeObserver
 * 监听容器尺寸（旋转 / 字号）变化后重算；冻结（按错 / 弹层 / 后台）时
 * transition 置 none 并保持偏移，解冻后补齐到当前拍。
 */

import { h } from '../dom';
import { buildSeqStaff, seqNoteX, seqStaffWidth } from '../../engraving/seq-staff';
import type { Clef, SigType } from '../../engraving/staff';
import type { PlaySeq } from '../../core/seq-generator';

/** 当前拍锚点：视窗左起比例 */
export const SEQ_ANCHOR = 0.35;

/**
 * 第 i 拍时的平移量（CSS px，>= 0）：锚点使 seqNoteX(i) 落在视窗 35% 处，
 * 再 clamp 到 [0, 渲染总宽 - 视窗宽]（窄于视窗时恒 0）。
 */
export function offsetFor(i: number, visW: number, scale: number, len: number): number {
  const total = seqStaffWidth(len) * scale;
  const target = seqNoteX(i) * scale - visW * SEQ_ANCHOR;
  const max = Math.max(0, total - visW);
  return Math.min(max, Math.max(0, target));
}

export interface SeqStage {
  /** 外层 .seq-viewport（overflow hidden，底部叠进度条） */
  root: HTMLElement;
  /** 平移到第 i 拍（当前音保持视窗左起 35%） */
  goTo(i: number): void;
  /** 该拍上色（绿=过 / 红=错过） */
  markState(i: number, s: 'done' | 'miss'): void;
  /** 当前拍高亮（is-cur，旧的移除） */
  setCurrent(i: number): void;
  /** 冻结 / 解冻平移（按错、弹层、后台时保持偏移） */
  freeze(on: boolean): void;
  /** 底部进度条 + 「第 i/n 拍」文本 */
  setProgress(done: number, total: number): void;
  /** ghost 高亮透传（连错辅助；由 opts.onGhost 接键盘更简单，这里存值并回调） */
  setGhost(midis: readonly number[]): void;
  onResize?(cb: () => void): void;
  destroy(): void;
}

export interface SeqStageOptions {
  seq: PlaySeq;
  clef: Clef;
  type: SigType;
  n: number;
  /** ghost 键位透传（调用方接键盘高亮） */
  onGhost?: (midis: readonly number[]) => void;
}

export function seqStage(opts: SeqStageOptions): SeqStage {
  const { seq, clef, type, n } = opts;
  const len = seq.notes.length;
  const W = seqStaffWidth(len);

  const holder = document.createElement('div');
  holder.innerHTML = buildSeqStaff({ clef, type, n, seq });
  const svg = holder.firstElementChild as SVGSVGElement;
  holder.replaceChildren();

  const barEl = h('div', { className: 'seq-progress__bar' });
  const textEl = h('span', { className: 'seq-progress__text' });
  const progress = h('div', { className: 'seq-progress' }, barEl, textEl);
  const root = h('div', { className: 'seq-viewport', attrs: { role: 'group', 'aria-label': '视奏谱面' } }, svg, progress);

  let cur = 0;
  let frozen = false;
  let ghost: readonly number[] = [];
  const resizeCbs: Array<() => void> = [];

  /** svg 实测缩放（rect.width / viewBox 宽；未排版时退回高度比） */
  function measure(): { visW: number; scale: number } {
    const cssH = root.clientHeight;
    const r = svg.getBoundingClientRect();
    const scale = r.width > 1 && W > 0 ? r.width / W : (cssH || 170) / 170;
    return { visW: root.clientWidth, scale };
  }

  function applyOffset(): void {
    if (frozen) return;
    const { visW, scale } = measure();
    svg.style.transform = `translateX(${-offsetFor(cur, visW, scale, len)}px)`;
  }

  /** 定尺寸：svg 按视窗高显式定宽高（高 * viewBox 比），再算偏移 */
  function layout(): void {
    const cssH = root.clientHeight;
    if (cssH > 0) {
      svg.style.height = `${cssH}px`;
      svg.style.width = `${(cssH * W) / 170}px`;
    }
    applyOffset();
    for (const cb of resizeCbs) cb();
  }

  function applyProgress(done: number, total: number): void {
    const pct = total > 0 ? Math.min(100, Math.max(0, (done / total) * 100)) : 0;
    barEl.style.setProperty('--p', `${pct}%`);
    textEl.textContent = `第 ${done}/${total} 拍`;
  }

  const ro = new ResizeObserver(() => layout());
  ro.observe(root);

  function noteAt(i: number): SVGGElement | null {
    return svg.querySelector<SVGGElement>(`g.qnote[data-i="${i}"]`);
  }

  layout();
  applyProgress(0, len);

  return {
    root,
    goTo(i: number): void {
      cur = Math.min(len - 1, Math.max(0, i));
      applyOffset();
    },
    markState(i: number, s: 'done' | 'miss'): void {
      const g = noteAt(i);
      if (!g) return;
      g.classList.add(`is-${s}`);
      g.classList.remove(s === 'done' ? 'is-miss' : 'is-done');
    },
    setCurrent(i: number): void {
      for (const g of svg.querySelectorAll('g.qnote.is-cur')) g.classList.remove('is-cur');
      noteAt(i)?.classList.add('is-cur');
    },
    freeze(on: boolean): void {
      if (frozen === on) return;
      frozen = on;
      svg.style.transition = on ? 'none' : '';
      if (!on) applyOffset();
    },
    setProgress(done: number, total: number): void {
      applyProgress(done, total);
    },
    setGhost(midis: readonly number[]): void {
      ghost = [...midis];
      opts.onGhost?.(ghost);
    },
    onResize(cb: () => void): void {
      resizeCbs.push(cb);
    },
    destroy(): void {
      ro.disconnect();
      resizeCbs.length = 0;
      root.remove();
    },
  };
}
