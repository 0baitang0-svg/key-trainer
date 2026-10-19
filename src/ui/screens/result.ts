/**
 * 结果页：本节数字小结 + 经验增量 + 徽章解锁弹层 + 逐题回顾（点开看锚点）。
 */

import { h, icon, fmtMs, fmtPct } from '../dom';
import type { AppContext, ScreenInstance } from '../router';
import { staffView } from '../components/staff-view';
import { BADGES, checkBadges } from '../../content/badges';
import { playJingle } from '../../audio/sfx';
import { anchorAccent, type QuestionRecord, type SessionPlan, type SessionSummary } from '../session-controller';

function statCell(label: string, value: string): HTMLElement {
  return h('div', { className: 'stat' }, h('span', { className: 'stat__value', text: value }), h('span', { className: 'stat__label', text: label }));
}

function stars(earned: number): HTMLElement {
  return h(
    'div',
    { className: 'stars' },
    ...[0, 1, 2].map((i) => (i < earned ? icon('star-fill', 18) : icon('star', 18))),
  );
}

export function resultScreen(ctx: AppContext, params: unknown): ScreenInstance {
  const { summary, plan } = params as { summary: SessionSummary; plan: SessionPlan };

  const reviewList = h('div', { className: 'review' });
  summary.records.forEach((rec, i) => reviewList.append(reviewRow(rec, i)));

  const levelPanel =
    summary.mode === 'level' && summary.pass
      ? h(
          'section',
          { className: `card level-result${summary.pass.pass ? ' is-pass' : ''}` },
          h('h2', {
            className: 'card__title',
            text: summary.pass.pass ? '通关了' : '还差一点',
          }),
          summary.pass.pass
            ? stars(summary.pass.stars)
            : h('p', {
                className: 'card__note',
                text: `门槛：正确率 ${Math.round(80)}% 起 · Boss 题须答对 · 反应中位数要更快`,
              }),
          h('p', {
            className: 'card__note',
            text: summary.pass.pass
              ? `正确率 ${fmtPct(summary.pass.acc)} · 中位 ${fmtMs(summary.pass.medianMs)}`
              : `正确率 ${fmtPct(summary.pass.acc)} · 中位 ${fmtMs(summary.pass.medianMs)}${summary.pass.bossOk ? '' : ' · Boss 题没守住'}`,
          }),
        )
      : null;

  const root = h(
    'section',
    { className: 'screen screen--result' },
    h(
      'header',
      { className: 'topbar' },
      h(
        'h1',
        { className: 'app-title' },
        '本节小结',
        h('span', { className: 'app-title__sub', text: summary.title }),
      ),
    ),
    h(
      'div',
      { className: 'screen__body' },
      h(
        'section',
        { className: 'card' },
        h(
          'div',
          { className: 'stats-grid' },
          statCell('正确率', fmtPct(summary.accuracy)),
          statCell('反应中位', fmtMs(summary.medianMs)),
          statCell('≤1.5s', fmtPct(summary.fastRatio)),
          statCell('最高连击', String(summary.bestCombo)),
        ),
        h('div', { className: 'xp-gain' }, h('span', { className: 'xp-gain__num', text: `+${summary.xpEarned}` }), h('span', { text: ' 经验' })),
      ),
      levelPanel,
      h('h2', { className: 'section-title', text: '逐题回顾' }),
      reviewList,
      h(
        'div',
        { className: 'result-actions' },
        h('button', {
          className: 'btn btn--primary btn--big',
          text: summary.mode === 'level' ? '重打本关' : '再来一节',
          attrs: { type: 'button' },
          on: {
            click: () => ctx.reset({ name: 'session', params: { plan } }),
          },
        }),
        summary.mode === 'level'
          ? h('button', {
              className: 'btn btn--ghost btn--wide',
              text: '回关卡地图',
              attrs: { type: 'button' },
              on: { click: () => ctx.reset({ name: 'level-map' }) },
            })
          : h('button', {
              className: 'btn btn--ghost btn--wide',
              text: '回首页',
              attrs: { type: 'button' },
              on: { click: () => ctx.reset({ name: 'home' }) },
            }),
      ),
    ),
  );

  /* ---------- 徽章解锁弹层 ---------- */

  let badgePopup: HTMLElement | null = null;
  const timer = window.setTimeout(() => {
    const unlocked = checkBadges(ctx.getState());
    if (unlocked.length === 0) return;
    try {
      playJingle();
    } catch {
      // 音频不可用时静默
    }
    badgePopup = h(
      'div',
      { className: 'sheet-wrap' },
      h(
        'div',
        { className: 'sheet badge-sheet' },
        h('p', { className: 'badge-sheet__eyebrow', text: '徽章解锁' }),
        h('h2', { className: 'badge-sheet__title', text: unlocked.map((b) => b.title).join(' · ') }),
        h(
          'ul',
          { className: 'badge-sheet__list' },
          ...unlocked.map((b) => h('li', {}, h('span', { className: 'badge-sheet__name', text: b.title }), h('span', { className: 'badge-sheet__desc', text: b.desc }))),
        ),
        h('button', {
          className: 'btn btn--primary btn--wide',
          text: '收下',
          attrs: { type: 'button' },
          on: {
            click: () => {
              ctx.update((s) => ({ ...s, badges: [...s.badges, ...unlocked.map((b) => b.id)] }));
              badgePopup?.remove();
              badgePopup = null;
            },
          },
        }),
      ),
    );
    root.append(badgePopup);
  }, 350);

  return {
    root,
    destroy(): void {
      window.clearTimeout(timer);
    },
  };
}

/** 一行回顾（点开看锚点） */
function reviewRow(rec: QuestionRecord, index: number): HTMLElement {
  const q = rec.question;
  const detail = h('div', { className: 'review__detail' });
  const head = h(
    'button',
    {
      className: `review__row${rec.ok ? ' is-ok' : ' is-bad'}`,
      attrs: { type: 'button' },
      on: {
        click: () => {
          const open = detail.classList.toggle('is-open');
          head.classList.toggle('is-open', open);
        },
      },
    },
    h('span', { className: 'review__no', text: `#${index + 1}` }),
    h('span', { className: 'review__verdict', text: rec.skipped ? '跳过' : rec.ok ? '对' : '错' }),
    h('span', {
      className: 'review__answer',
      text: rec.skipped
        ? `— → ${rec.correctLabel}`
        : rec.ok
          ? rec.correctLabel
          : `${rec.picked ?? '—'} → ${rec.correctLabel}`,
    }),
    h('span', { className: 'review__rt', text: fmtMs(rec.reactionMs) }),
    rec.favorite ? h('span', { className: 'review__fav', text: '收藏' }) : null,
  );
  detail.append(
    staffView({
      clef: q.clef,
      type: q.type,
      n: q.n,
      ...(q.train === 'note' && q.step !== undefined ? { step: q.step } : {}),
      ...(anchorAccent(q) !== undefined ? { accent: anchorAccent(q) as number } : {}),
      mini: true,
      className: 'staff-card--anchor',
    }),
    h('p', { className: 'review__explain', text: rec.explain }),
  );
  return h('div', { className: 'review__item' }, head, detail);
}

/** 徽章墙用（导出给 profile 复用） */
export function badgeWall(unlocked: ReadonlyArray<string>): HTMLElement {
  return h(
    'div',
    { className: 'badge-wall' },
    ...BADGES.map((b) =>
      h(
        'div',
        { className: `badge${unlocked.includes(b.id) ? ' is-on' : ''}` },
        h('span', { className: 'badge__title', text: b.title }),
        h('span', { className: 'badge__desc', text: b.desc }),
      ),
    ),
  );
}
