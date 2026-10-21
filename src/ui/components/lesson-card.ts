/**
 * 不透明讲义微课卡（v0.1.5 第 2 批，取代旧 ruleCardSheet）：
 * 米白纸面 bottom-sheet，眉标 + 标题 + 分节条目 + 例块 + 「看动画」按钮；
 * 点动画后 body 换成 lessonPlayer，head 出「← 正文」返回（body ↔ player 切换）。
 */

import { getDemo } from '../../content/lesson-demos';
import type { MicroLesson } from '../../content/micro-lessons';
import { h } from '../dom';
import { lessonPlayer, type LessonPlayer } from './lesson-player';

export interface LessonSheetOpts {
  mode: 'auto' | 'manual';
  /** 关闭回调（auto 模式由调用方 markSeen） */
  onDismiss: () => void;
}

export interface LessonSheet {
  root: HTMLElement;
  destroy(): void;
}

export function lessonSheet(lesson: MicroLesson, opts: LessonSheetOpts): LessonSheet {
  let player: LessonPlayer | null = null;

  const sections = lesson.secs.map((sec) =>
    h(
      'section',
      { className: 'mlesson__sec' },
      h('h3', { className: 'mlesson__sec-title', text: sec.heading }),
      sec.lines.length > 0
        ? h('ul', { className: 'mlesson__lines' }, ...sec.lines.map((l) => h('li', { text: l })))
        : null,
      sec.example !== undefined ? h('p', { className: 'mlesson__example', text: sec.example }) : null,
    ),
  );

  const body = h('div', { className: 'mlesson__body' }, ...sections);
  const backBtn = h('button', {
    className: 'mlesson__back',
    text: '← 正文',
    attrs: { type: 'button' },
    on: {
      click: () => {
        player?.destroy();
        player = null;
        body.replaceChildren(...sections);
        backBtn.hidden = true;
      },
    },
  });
  backBtn.hidden = true;

  const demoBtns = (lesson.demos ?? []).flatMap((ref) => {
    const demo = getDemo(ref.id);
    if (demo === undefined) return [];
    return [
      h('button', {
        className: 'mlesson__demo',
        text: `▶ ${ref.label}`,
        attrs: { type: 'button' },
        on: {
          click: () => {
            player?.destroy();
            player = lessonPlayer(demo);
            body.replaceChildren(player.root);
            backBtn.hidden = false;
          },
        },
      }),
    ];
  });

  const root = h(
    'div',
    { className: 'sheet-wrap' },
    h(
      'div',
      { className: 'sheet mlesson', attrs: { role: 'dialog', 'aria-label': lesson.title } },
      h(
        'div',
        { className: 'mlesson__head' },
        h(
          'div',
          { className: 'mlesson__head-text' },
          h('p', { className: 'mlesson__eyebrow', text: lesson.eyebrow }),
          h('h2', { className: 'mlesson__title', text: lesson.title }),
        ),
        backBtn,
      ),
      body,
      ...demoBtns,
      h(
        'div',
        { className: 'mlesson__foot' },
        h('button', {
          className: opts.mode === 'auto' ? 'btn btn--primary btn--wide' : 'btn btn--ghost btn--wide',
          text: opts.mode === 'auto' ? '知道了' : '关闭',
          attrs: { type: 'button' },
          on: { click: () => opts.onDismiss() },
        }),
      ),
    ),
  );

  return {
    root,
    destroy(): void {
      player?.destroy();
      player = null;
      root.remove();
    },
  };
}
