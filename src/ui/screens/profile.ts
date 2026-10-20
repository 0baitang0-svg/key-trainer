/**
 * 统计页：7 日题数 / 正确率小图、每调号正确率条形（弱项标红）、模式表现条形、徽章墙、打卡日历。
 * 弱项行（正确率 <70% 且样本 ≥5）行尾带「专练」直达针对性 session。
 */

import { aggregate, WEAK_MIN_ATTEMPTS } from '../../core/stats';
import type { TrainMode } from '../../core/question-generator';
import { h, icon, dateKeyOf, fmtPct } from '../dom';
import type { AppContext, ScreenInstance } from '../router';
import { showCoachOnce } from '../components/coach-mark';
import { planFromWeak, weakTargetOf, type WeakTargetSource } from '../session-controller';
import { badgeWall } from './result';

/** 训练模式 → 中文名（「模式表现」条形区） */
const TRAIN_LABELS: Record<string, string> = {
  sig: '认调',
  note: '认音',
  piece: '曲目',
  func: '和弦归属',
  diatonic: '顺阶和弦',
  degrees: '键盘音级',
  build: '和弦构建',
};

/** 正确率条形行（调号 / 模式共用；<70% 标红；弱项行尾可挂「专练」） */
function accBarRow(
  label: string,
  accuracy: number | null,
  opts: { attempts?: number; onDrill?: () => void } = {},
): HTMLElement {
  const weak = accuracy !== null && accuracy < 0.7;
  const drillable = weak && (opts.attempts ?? 0) >= WEAK_MIN_ATTEMPTS && opts.onDrill !== undefined;
  return h(
    'div',
    { className: `keybar${weak ? ' is-weak' : ''}` },
    h('span', { className: 'keybar__label', text: label }),
    h(
      'div',
      { className: 'keybar__track' },
      h('div', {
        className: 'keybar__fill',
        attrs: { style: `--kb:${((accuracy ?? 0) * 100).toFixed(1)}%` },
      }),
    ),
    h('span', { className: 'keybar__value', text: fmtPct(accuracy) }),
    drillable
      ? h('button', {
          className: 'keybar__drill',
          text: '专练',
          attrs: { type: 'button' },
          on: { click: opts.onDrill },
        })
      : null,
  );
}

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

  // 「专练」直达弱项针对性 session（与结果页推荐卡共用 planFromWeak / weakTargetOf）
  const startWeak = (src: WeakTargetSource): void => {
    ctx.navigate({ name: 'session', params: { plan: planFromWeak(weakTargetOf(src), 3) } });
  };

  const keybarCard = h(
    'section',
    { className: 'card' },
    agg.keyBars.length === 0
      ? h('p', { className: 'card__note', text: '还没有数据，练一节就会出现' })
      : h(
          'div',
          { className: 'keybars' },
          ...agg.keyBars.map((k) => {
            const label = `${k.n}${k.type === 'sh' ? '♯' : '♭'}`;
            return accBarRow(label, k.accuracy, {
              attempts: k.count,
              onDrill: () => startWeak({ train: 'sig', type: k.type, n: k.n, label: `${label} · 认调` }),
            });
          }),
        ),
  );

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
      keybarCard,
      h('h2', { className: 'section-title', text: '模式表现' }),
      h(
        'section',
        { className: 'card' },
        h(
          'div',
          { className: 'keybars' },
          ...agg.modeBars.map((m) =>
            accBarRow(TRAIN_LABELS[m.train] ?? m.train, m.accuracy, {
              attempts: m.count,
              onDrill: () =>
                startWeak({
                  train: m.train as TrainMode,
                  label: TRAIN_LABELS[m.train] ?? m.train,
                }),
            }),
          ),
        ),
      ),
      h('h2', { className: 'section-title', text: '徽章墙' }),
      badgeWall(state.badges),
      h('h2', { className: 'section-title', text: '打卡日历 · 近 28 天' }),
      h('div', { className: 'cal' }, ...days),
    ),
  );

  // 功能气泡：弱项红条（首次进统计页，只弹一次；有弱项行就锚定红条）
  const coachTimer = window.setTimeout(() => {
    showCoachOnce(ctx, 'coach.weakbar', {
      target: root.querySelector('.keybar.is-weak') ?? keybarCard,
      title: '弱项红条',
      body: '红条是弱项（正确率 <70%），可以点『专练』直接开练。',
    });
  }, 300);

  return {
    root,
    destroy(): void {
      window.clearTimeout(coachTimer);
    },
  };
}
