/**
 * 微课动画播放器（v0.1.5 第 2 批）：按 lesson-demos 脚本步进播放
 * 解说文案 + 谱面 / 视奏串 + 吉祥物表情。
 * 默认自动播（每步 ms ?? max(1400, 60×字数)）；prefers-reduced-motion 时默认暂停。
 * staff 缺省 = 沿用上一步谱面；destroy 清定时器。
 */

import type { DemoStep, LessonDemo } from '../../content/lesson-demos';
import type { StaffNote } from '../../engraving/staff';
import { buildSeqStaff } from '../../engraving/seq-staff';
import { h } from '../dom';
import { mascot } from './mascot';
import { staffView, type StaffViewOptions } from './staff-view';

export interface LessonPlayer {
  root: HTMLElement;
  destroy(): void;
}

/** DemoStep.staff（notes.acc 为宽 number）→ staffView 参数（acc 收窄到 StaffNote） */
function toStaffViewOpts(staff: NonNullable<DemoStep['staff']>): StaffViewOptions {
  return {
    clef: staff.clef,
    type: staff.type,
    n: staff.n,
    accent: staff.accent,
    notes: staff.notes?.map((nt) => ({ step: nt.step, acc: nt.acc as StaffNote['acc'] })),
  };
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 本步停留时长：脚本 ms ?? max(1400, 60 × 文案字数) */
function stepMs(step: DemoStep): number {
  return step.ms ?? Math.max(1400, 60 * step.text.length);
}

export function lessonPlayer(demo: LessonDemo): LessonPlayer {
  const steps = demo.steps;
  let index = 0;
  let playing = !prefersReducedMotion();
  let timer = 0;
  /** 沿用的谱面参数（staff 缺省步用上一步的） */
  let staffCtx: NonNullable<DemoStep['staff']> | null = null;

  const stage = h('div', { className: 'lesson-player__stage' });
  const caption = h('p', { className: 'lesson-player__caption', attrs: { 'aria-live': 'polite' } });
  const pet = mascot({ mood: 'neutral', size: 64 });
  const dotEls = steps.map((_, i) => h('span', { className: `lesson-player__dot${i === 0 ? ' is-active' : ''}` }));
  const dots = h('div', { className: 'lesson-player__dots' }, ...dotEls);

  const toggleBtn = h('button', { className: 'btn', text: '自动', attrs: { type: 'button' } });
  const syncToggle = (): void => {
    toggleBtn.textContent = playing ? '暂停' : '自动';
    toggleBtn.setAttribute('aria-label', playing ? '暂停自动播放' : '继续自动播放');
  };

  function clearTimer(): void {
    window.clearTimeout(timer);
    timer = 0;
  }

  /** 重绘谱面区（staff/seq 都缺省 = 沿用上一步，不重绘） */
  function renderStage(step: DemoStep): void {
    if (step.staff !== undefined) staffCtx = step.staff;
    if (step.seq !== undefined) {
      if (staffCtx === null) return;
      const wrap = h('div', { className: 'lesson-player__seq' });
      wrap.innerHTML = buildSeqStaff({ clef: staffCtx.clef, type: staffCtx.type, n: staffCtx.n, seq: step.seq.seq });
      const cur = step.seq.current;
      if (cur !== undefined) {
        const note = wrap.querySelector(`g.qnote[data-i="${cur}"]`);
        note?.classList.add('is-cur');
        if (step.seq.state === 'done') note?.classList.add('is-done');
      }
      stage.replaceChildren(wrap);
      return;
    }
    if (step.staff !== undefined && staffCtx !== null) {
      stage.replaceChildren(staffView({ mini: true, ...toStaffViewOpts(staffCtx) }));
    }
  }

  function schedule(): void {
    clearTimer();
    if (!playing) return;
    timer = window.setTimeout(() => {
      if (index >= steps.length - 1) {
        playing = false;
        syncToggle();
        return;
      }
      goTo(index + 1);
    }, stepMs(steps[index]));
  }

  function render(): void {
    const step = steps[index];
    caption.textContent = step.text;
    dotEls.forEach((d, i) => d.classList.toggle('is-active', i === index));
    renderStage(step);
    if (step.mascot !== undefined) pet.setMood(step.mascot);
    syncToggle();
  }

  function goTo(i: number): void {
    index = Math.max(0, Math.min(steps.length - 1, i));
    render();
    schedule();
  }

  const prevBtn = h('button', {
    className: 'btn',
    text: '◀',
    attrs: { type: 'button', 'aria-label': '上一步' },
    on: { click: () => goTo(index - 1) },
  });
  const replayBtn = h('button', {
    className: 'btn',
    text: '重播',
    attrs: { type: 'button' },
    on: {
      click: () => {
        playing = true;
        goTo(0);
      },
    },
  });
  const nextBtn = h('button', {
    className: 'btn',
    text: '▶',
    attrs: { type: 'button', 'aria-label': '下一步' },
    on: { click: () => goTo(index + 1) },
  });
  toggleBtn.addEventListener('click', () => {
    playing = !playing;
    if (playing) schedule();
    else clearTimer();
    syncToggle();
  });

  const root = h(
    'div',
    { className: 'lesson-player' },
    h(
      'header',
      { className: 'lesson-player__head' },
      h(
        'div',
        { className: 'lesson-player__head-text' },
        h('span', { className: 'lesson-player__label', text: demo.label }),
        dots,
      ),
      pet.root,
    ),
    stage,
    caption,
    h('footer', { className: 'lesson-player__foot' }, prevBtn, toggleBtn, replayBtn, nextBtn),
  );

  render();
  schedule();

  return {
    root,
    destroy(): void {
      clearTimer();
      pet.destroy();
      root.remove();
    },
  };
}
