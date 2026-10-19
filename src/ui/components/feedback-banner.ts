/**
 * 反馈层：答对的小浮签、答错的直读锚点卡（底部纸签）、首遇微课卡。
 * 全部走 200ms 内的克制动效，点按可立即继续。
 */

import { h } from '../dom';
import { staffView, type StaffViewOptions } from './staff-view';
import type { RuleCard } from '../../content/rules-cards';

export interface FeedbackData {
  ok: boolean;
  /** 一句话温度文案：「稳」/「这个再想想」 */
  phrase: string;
  /** 直读锚点解析 */
  explain: string;
  /** 错题锚点微缩谱面（含 accent 高亮） */
  staff?: StaffViewOptions;
  /** 自动继续时长（毫秒） */
  autoMs: number;
  onContinue: () => void;
}

export interface FeedbackBanner {
  root: HTMLElement;
  destroy(): void;
}

/** 反馈浮签 / 锚点卡 */
export function feedbackBanner(data: FeedbackData): FeedbackBanner {
  let timer: number | undefined;
  const done = (): void => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    data.onContinue();
  };

  const root = data.ok
    ? h(
        'div',
        { className: 'fb fb--ok', on: { click: done } },
        h('span', { className: 'fb__phrase', text: data.phrase }),
        h('span', { className: 'fb__explain', text: data.explain }),
      )
    : h(
        'div',
        { className: 'fb fb--bad', on: { click: done }, attrs: { role: 'button', 'aria-label': '继续' } },
        h(
          'div',
          { className: 'fb__sheet' },
          h('p', { className: 'fb__phrase', text: data.phrase }),
          data.staff ? staffView({ ...data.staff, mini: true, className: 'staff-card--anchor' }) : null,
          h('p', { className: 'fb__explain', text: data.explain }),
          h('div', { className: 'fb__meta' }, h('span', { text: '点按继续' })),
        ),
        h('div', { className: 'fb__timer', attrs: { style: `--fb-ms:${data.autoMs}ms` } }),
      );

  timer = window.setTimeout(done, data.autoMs);
  return {
    root,
    destroy(): void {
      if (timer !== undefined) window.clearTimeout(timer);
      root.remove();
    },
  };
}

/** 首遇微课卡（可跳过） */
export function ruleCardSheet(card: RuleCard, onDismiss: (remember: boolean) => void): FeedbackBanner {
  const root = h(
    'div',
    { className: 'sheet-wrap' },
    h(
      'div',
      { className: 'sheet rule-card', attrs: { role: 'dialog', 'aria-label': card.title } },
      h('p', { className: 'rule-card__eyebrow', text: '首次遇到 · 直读微课' }),
      h('h2', { className: 'rule-card__title', text: card.title }),
      h('ul', { className: 'rule-card__lines' }, ...card.lines.map((l) => h('li', { text: l }))),
      h('p', { className: 'rule-card__example', text: card.example }),
      h(
        'div',
        { className: 'rule-card__actions' },
        h('button', {
          className: 'btn btn--ghost',
          text: '跳过',
          attrs: { type: 'button' },
          on: { click: () => onDismiss(false) },
        }),
        h('button', {
          className: 'btn btn--primary',
          text: '记住了',
          attrs: { type: 'button' },
          on: { click: () => onDismiss(true) },
        }),
      ),
    ),
  );
  return {
    root,
    destroy(): void {
      root.remove();
    },
  };
}
