/**
 * 功能气泡（Coach Mark）：锚定 DOM 元素的玻璃气泡 + 指向箭头 + 挖孔高亮蒙层。
 * 蒙层用「元素 box-shadow 0 0 0 9999px」在锚点处挖孔，锚点保持清晰可见。
 * 「知道了」或返回键关闭（interceptCoachBack 由 main 的返回链优先消费）。
 * showCoachOnce 按 seenFlags 幂等：每条只弹一次。
 */

import { h } from '../dom';
import { hasSeenFlag, markFlagSeen } from '../../core/store';
import type { AppContext } from '../router';

export interface CoachMarkOptions {
  /** 锚点元素：气泡指向它，蒙层在此挖孔高亮 */
  target: Element;
  title: string;
  body: string;
  /** 一次性标记 id（记录到 seenFlags） */
  flag: string;
  onDone?: () => void;
}

export interface CoachMark {
  destroy(): void;
}

/** 打开中的气泡栈（后入先出，返回键关最上层） */
const openStack: CoachMark[] = [];

/** 返回键拦截：有气泡则关掉最上层并消费本次返回 */
export function interceptCoachBack(): boolean {
  const top = openStack[openStack.length - 1];
  if (top === undefined) return false;
  top.destroy();
  return true;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function coachMark(opts: CoachMarkOptions): CoachMark {
  const { target, title, body, flag, onDone } = opts;

  const cutout = h('div', { className: 'coach-mark__cutout', attrs: { 'aria-hidden': 'true' } });
  const arrow = h('div', { className: 'coach-mark__arrow', attrs: { 'aria-hidden': 'true' } });
  const bubble = h(
    'div',
    { className: 'coach-mark__bubble', attrs: { role: 'dialog', 'aria-label': title } },
    arrow,
    h('h3', { className: 'coach-mark__title', text: title }),
    h('p', { className: 'coach-mark__body', text: body }),
    h('button', {
      className: 'btn btn--primary coach-mark__ok',
      text: '知道了',
      attrs: { type: 'button' },
      on: { click: () => destroy() },
    }),
  );
  const root = h(
    'div',
    {
      className: 'coach-mark',
      dataset: { coachFlag: flag },
      on: {
        click: (e) => {
          if (e.target === root) destroy();
        },
      },
    },
    cutout,
    bubble,
  );

  let watchdog = 0;
  let done = false;
  function destroy(): void {
    if (done) return;
    done = true;
    window.clearInterval(watchdog);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    root.remove();
    const i = openStack.indexOf(handle);
    if (i >= 0) openStack.splice(i, 1);
    onDone?.();
  }

  /** 位置跟随：挖孔贴住锚点，气泡贴住锚点上方 / 下方，箭头指向锚点 */
  function place(): void {
    const rect = target.getBoundingClientRect();
    const pad = 6;
    cutout.style.top = `${rect.top - pad}px`;
    cutout.style.left = `${rect.left - pad}px`;
    cutout.style.width = `${Math.max(0, rect.width) + pad * 2}px`;
    cutout.style.height = `${Math.max(0, rect.height) + pad * 2}px`;

    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    const cx = rect.left + rect.width / 2;
    const left = Math.min(Math.max(12, cx - bw / 2), Math.max(12, window.innerWidth - bw - 12));
    // 锚点偏下半屏（或上方放不下）时气泡放上方，否则放下方
    const above = rect.top >= bh + 28 || rect.top >= window.innerHeight - rect.bottom;
    let top = above ? rect.top - bh - 14 : rect.bottom + 14;
    top = Math.min(Math.max(12, top), Math.max(12, window.innerHeight - bh - 12));
    bubble.classList.toggle('is-above', above);
    bubble.classList.toggle('is-below', !above);
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
    bubble.style.setProperty('--arrow-x', `${Math.min(Math.max(18, cx - left), bw - 18)}px`);
  }

  const handle: CoachMark = { destroy };

  document.body.append(root);
  if (!prefersReducedMotion()) bubble.classList.add('is-in');
  place();
  openStack.push(handle);

  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, { capture: true });
  // 锚点随屏幕销毁时自毁（屏幕切换后不留孤儿气泡）
  watchdog = window.setInterval(() => {
    if (!target.isConnected) destroy();
  }, 400);

  return handle;
}

export type ShowCoachOptions = { target: Element; title: string; body: string; onDone?: () => void };

/**
 * 只弹一次的功能气泡：seenFlags 已含 flag 则不弹；展示后把 flag 写入 seenFlags。
 */
export function showCoachOnce(ctx: AppContext, flag: string, opts: ShowCoachOptions): void {
  if (hasSeenFlag(ctx.getState(), flag)) return;
  coachMark({ ...opts, flag });
  ctx.update((s) => markFlagSeen(s, flag));
}
