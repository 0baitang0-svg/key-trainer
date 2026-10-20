/**
 * 首页动线：顶栏问候 + 谱谱 → 今日训练大卡（第一视觉焦点）→ 快速开始三 chip
 * → 我的进度紧凑条 → 折叠的自定义练习配置。
 */

import { streakDays } from '../../core/store';
import { findWeakest } from '../../core/stats';
import { h, icon, todayKey } from '../dom';
import type { AppContext, ScreenInstance } from '../router';
import { mascot } from '../components/mascot';
import { streakBadge } from '../components/streak';
import { xpBar } from '../components/xp-bar';
import {
  planFromDaily,
  planFromFree,
  planFromWeak,
  weakTargetOf,
  type FreeConfig,
  type SessionPlan,
} from '../session-controller';

interface SegOption<T extends string> {
  value: T;
  label: string;
}

function seg<T extends string>(
  title: string,
  options: ReadonlyArray<SegOption<T>>,
  value: T,
  onChange: (v: T) => void,
): HTMLElement {
  const wrap = h('div', { className: 'field' }, h('span', { className: 'field__label', text: title }));
  const group = h('div', { className: 'seg', attrs: { role: 'group', 'aria-label': title } });
  for (const o of options) {
    const btn = h('button', {
      className: `seg__btn${o.value === value ? ' is-active' : ''}`,
      text: o.label,
      attrs: { type: 'button' },
      on: {
        click: () => {
          for (const b of Array.from(group.children)) b.classList.remove('is-active');
          btn.classList.add('is-active');
          onChange(o.value);
        },
      },
    });
    group.append(btn);
  }
  wrap.append(group);
  return wrap;
}

/** 时段问候 */
function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
}

/** 块编排胶囊文案（今日训练大卡） */
const BLOCK_LABELS: Record<string, string> = {
  warmup: '热身',
  main: '主练',
  level: '曲目关',
  chord: '和弦',
  sprint: '冲刺',
  free: '自由',
  weak: '弱项专练',
};

export function homeScreen(ctx: AppContext): ScreenInstance {
  const state = ctx.getState();
  const free: FreeConfig = { train: 'mix', clef: 'mix', ask: 'mix', minutes: 5 };
  const dailyPlan = planFromDaily(state);
  const minutes = dailyPlan.blocks.reduce((s, b) => s + b.minutes, 0);
  const doneToday = state.streak.dates.includes(todayKey());
  const weakest = findWeakest(state.stats);

  const face = mascot({ mood: 'neutral', size: 48, className: 'topbar__mascot' });
  const cheer = doneToday ? mascot({ mood: 'cheer', size: 56, className: 'daily-card__cheer' }) : null;

  const startDaily = (): void => {
    ctx.navigate({ name: 'session', params: { plan: planFromDaily(ctx.getState()) } });
  };

  /* ---------- 今日训练大卡 ---------- */

  const chips: HTMLElement[] = [];
  dailyPlan.blocks.forEach((b, i) => {
    if (i > 0) chips.push(h('span', { className: 'plan-chips__arrow', text: '→' }));
    chips.push(h('span', { className: 'plan-chip', text: BLOCK_LABELS[b.kind] ?? b.kind }));
  });

  const dailyCard = h(
    'section',
    { className: `card daily-card${doneToday ? ' is-done' : ''}` },
    h('h2', { className: 'card__title', text: '今日训练' }),
    h('div', { className: 'plan-chips' }, ...chips),
    h('p', { className: 'card__note', text: `预计 ${minutes} 分钟` }),
    doneToday && cheer !== null
      ? h(
          'div',
          { className: 'daily-card__done' },
          cheer.root,
          h('p', { className: 'daily-card__done-text', text: '今天达标了，再来一节？' }),
        )
      : null,
    h('button', {
      className: 'btn btn--primary btn--big',
      text: doneToday ? `再来一节 · ${minutes} 分钟` : `开始 · ${minutes} 分钟`,
      attrs: { type: 'button' },
      on: { click: startDaily },
    }),
  );

  /* ---------- 快速开始行 ---------- */

  const quickChip = (label: string, makePlan: () => SessionPlan): HTMLElement =>
    h('button', {
      className: 'quick-chip',
      text: label,
      attrs: { type: 'button' },
      on: {
        click: () => ctx.navigate({ name: 'session', params: { plan: makePlan() } }),
      },
    });

  const quickRow = h(
    'div',
    { className: 'quick-row' },
    quickChip('3 分钟速练', () => planFromFree({ train: 'mix', clef: 'mix', ask: 'mix', minutes: 3 })),
    quickChip('弱项专练', () =>
      planFromWeak(weakest !== null ? weakTargetOf(weakest) : { train: 'sig', label: '综合认调' }, 3),
    ),
    h('button', {
      className: 'quick-chip',
      text: '闯关',
      attrs: { type: 'button' },
      on: { click: () => ctx.navigate({ name: 'level-map' }) },
    }),
  );

  /* ---------- 我的进度（streak + XP 合并一行） ---------- */

  const progressStrip = h(
    'div',
    { className: 'progress-strip' },
    streakBadge(streakDays(state.streak, todayKey())),
    xpBar(state.xp),
    h('button', {
      className: 'progress-strip__more',
      text: '统计 ›',
      attrs: { type: 'button' },
      on: { click: () => ctx.navigate({ name: 'profile' }) },
    }),
  );

  /* ---------- 自定义练习（折叠，默认收起） ---------- */

  const foldBody = h('div', { className: 'fold__body' }, seg('题型', [
    { value: 'sig', label: '认调' },
    { value: 'note', label: '认音' },
    { value: 'mix', label: '混合' },
    { value: 'func', label: '和弦归属' },
    { value: 'diatonic', label: '顺阶和弦' },
    { value: 'degrees', label: '键盘音级' },
    { value: 'build', label: '和弦构建' },
  ], free.train, (v) => (free.train = v)), seg('谱号', [
    { value: 'treble', label: '高音' },
    { value: 'bass', label: '低音' },
    { value: 'mix', label: '混合' },
  ], free.clef, (v) => (free.clef = v)), seg('提问', [
    { value: 'maj', label: '大调' },
    { value: 'min', label: '小调' },
    { value: 'mix', label: '混合' },
  ], free.ask, (v) => (free.ask = v)), seg('时长', [
    { value: '3', label: '3 分钟' },
    { value: '5', label: '5 分钟' },
    { value: '10', label: '10 分钟' },
  ], String(free.minutes), (v) => (free.minutes = Number(v))), h('button', {
    className: 'btn btn--ghost btn--wide',
    text: '开始自由练习',
    attrs: { type: 'button' },
    on: {
      click: () => ctx.navigate({ name: 'session', params: { plan: planFromFree(free) } }),
    },
  }));
  foldBody.hidden = true;

  const foldCaret = h('span', { className: 'fold__caret', text: '›' });
  const foldHead = h(
    'button',
    {
      className: 'fold__head',
      attrs: { type: 'button', 'aria-expanded': 'false' },
      on: {
        click: () => {
          foldBody.hidden = !foldBody.hidden;
          foldCaret.classList.toggle('is-open', !foldBody.hidden);
          foldHead.setAttribute('aria-expanded', String(!foldBody.hidden));
        },
      },
    },
    h('span', { text: '自定义练习' }),
    foldCaret,
  );

  const root = h(
    'section',
    { className: 'screen screen--home' },
    h(
      'header',
      { className: 'topbar' },
      h(
        'h1',
        { className: 'app-title' },
        greeting(),
        h('span', { className: 'app-title__sub', text: '调号反应训练 · 五线谱直读' }),
      ),
      face.root,
      h('button', {
        className: 'icon-btn',
        attrs: { type: 'button', 'aria-label': '设置' },
        on: { click: () => ctx.navigate({ name: 'settings' }) },
        html: icon('gear', 22).outerHTML,
      }),
    ),
    h('div', { className: 'screen__body' }, dailyCard, quickRow, progressStrip, h('section', { className: 'card fold' }, foldHead, foldBody)),
  );

  return {
    root,
    destroy(): void {
      face.destroy();
      cheer?.destroy();
    },
  };
}
