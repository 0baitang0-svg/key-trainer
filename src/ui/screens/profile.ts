/**
 * 统计页：7 日题数 / 正确率小图、每调号正确率条形（弱项标红）、徽章墙、打卡日历。
 */

import { aggregate } from '../../core/stats';
import { h, icon, dateKeyOf, fmtPct } from '../dom';
import type { AppContext, ScreenInstance } from '../router';
import { badgeWall } from './result';

/** 7 日柱状（题数）+ 折线（正确率） */
function weeklyChart(daily: ReadonlyArray<{ date: string; count: number; accuracy: number | null }>): HTMLElement {
  const W = 320;
  const H = 132;
  const padL = 8;
  const padB = 34;
  const innerW = W - padL * 2;
  const innerH = H - padB - 12;
  const maxCount = Math.max(1, ...daily.map((d) => d.count));
  const step = innerW / daily.length;
  const barW = Math.min(26, step * 0.5);

  let bars = '';
  let line = '';
  let labels = '';
  daily.forEach((d, i) => {
    const cx = padL + step * i + step / 2;
    const bh = d.count > 0 ? Math.max(3, (d.count / maxCount) * innerH) : 2;
    bars += `<rect x="${(cx - barW / 2).toFixed(1)}" y="${(12 + innerH - bh).toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" class="wk__bar${d.count === 0 ? ' is-empty' : ''}"/>`;
    if (d.accuracy !== null) {
      const ay = 12 + innerH - d.accuracy * innerH;
      line += `${line ? 'L' : 'M'}${cx.toFixed(1)} ${ay.toFixed(1)} `;
    }
    labels += `<text x="${cx.toFixed(1)}" y="${H - 18}" class="wk__day">${d.date.slice(5)}</text>`;
    labels += `<text x="${cx.toFixed(1)}" y="${H - 5}" class="wk__acc">${d.accuracy === null ? '—' : `${Math.round(d.accuracy * 100)}%`}</text>`;
  });

  const svg = `<svg viewBox="0 0 ${W} ${H}" class="wk" role="img" aria-label="最近 7 天题数与正确率">
    <line x1="${padL}" y1="${12 + innerH}" x2="${W - padL}" y2="${12 + innerH}" class="wk__base"/>
    ${bars}
    <path d="${line.trim()}" class="wk__line"/>
    ${labels}
  </svg>`;
  return h('div', { className: 'chart-card', html: svg });
}

export function profileScreen(ctx: AppContext): ScreenInstance {
  const state = ctx.getState();
  const agg = aggregate(state.stats.records);
  const checked = new Set([...state.streak.dates, ...state.streak.makeupDates]);

  // 打卡日历（近 28 天）
  const today = new Date();
  const days: HTMLElement[] = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const key = dateKeyOf(d);
    const on = checked.has(key);
    const makeup = state.streak.makeupDates.includes(key);
    days.push(
      h('div', {
        className: `cal__day${on ? ' is-on' : ''}${makeup ? ' is-makeup' : ''}`,
        attrs: { title: key },
      }),
    );
  }

  const root = h(
    'section',
    { className: 'screen screen--profile' },
    h(
      'header',
      { className: 'topbar' },
      h('button', {
        className: 'icon-btn',
        attrs: { type: 'button', 'aria-label': '返回' },
        html: icon('back', 22).outerHTML,
        on: { click: () => ctx.back() },
      }),
      h('h1', { className: 'app-title' }, '统计', h('span', { className: 'app-title__sub', text: '训练档案' })),
    ),
    h(
      'div',
      { className: 'screen__body' },
      h(
        'section',
        { className: 'card' },
        h('h2', { className: 'card__title', text: '总览' }),
        h(
          'div',
          { className: 'stats-grid' },
          h('div', { className: 'stat' }, h('span', { className: 'stat__value', text: String(agg.totalAttempts) }), h('span', { className: 'stat__label', text: '累计题数' })),
          h('div', { className: 'stat' }, h('span', { className: 'stat__value', text: fmtPct(agg.accuracy) }), h('span', { className: 'stat__label', text: '总正确率' })),
          h('div', { className: 'stat' }, h('span', { className: 'stat__value', text: String(agg.bestStreak) }), h('span', { className: 'stat__label', text: '最长连击' })),
        ),
      ),
      h('h2', { className: 'section-title', text: '最近 7 天' }),
      weeklyChart(agg.daily),
      h('h2', { className: 'section-title', text: '每调号正确率' }),
      h(
        'section',
        { className: 'card' },
        agg.keyBars.length === 0
          ? h('p', { className: 'card__note', text: '还没有数据，练一节就会出现' })
          : h(
              'div',
              { className: 'keybars' },
              ...agg.keyBars.map((k) => {
                const weak = k.accuracy !== null && k.accuracy < 0.7;
                return h(
                  'div',
                  { className: `keybar${weak ? ' is-weak' : ''}` },
                  h('span', { className: 'keybar__label', text: `${k.n}${k.type === 'sh' ? '♯' : '♭'}` }),
                  h(
                    'div',
                    { className: 'keybar__track' },
                    h('div', {
                      className: 'keybar__fill',
                      attrs: { style: `--kb:${((k.accuracy ?? 0) * 100).toFixed(1)}%` },
                    }),
                  ),
                  h('span', { className: 'keybar__value', text: fmtPct(k.accuracy) }),
                );
              }),
            ),
      ),
      h('h2', { className: 'section-title', text: '徽章墙' }),
      badgeWall(state.badges),
      h('h2', { className: 'section-title', text: '打卡日历 · 近 28 天' }),
      h('div', { className: 'cal' }, ...days),
    ),
  );
  return { root };
}
