/**
 * 首页：今日训练（每日编排）+ 自由练习配置 + 闯关 / 统计入口。
 */

import { streakDays } from '../../core/store';
import { h, icon, todayKey } from '../dom';
import type { AppContext, ScreenInstance } from '../router';
import { streakBadge } from '../components/streak';
import { xpBar } from '../components/xp-bar';
import { planFromDaily, planFromFree, type FreeConfig } from '../session-controller';

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

export function homeScreen(ctx: AppContext): ScreenInstance {
  const state = ctx.getState();
  const free: FreeConfig = { train: 'mix', clef: 'mix', ask: 'mix', minutes: 5 };
  const dailyPlan = planFromDaily(state);

  const root = h(
    'section',
    { className: 'screen screen--home' },
    h(
      'header',
      { className: 'topbar' },
      h(
        'h1',
        { className: 'app-title' },
        '调号反应训练',
        h('span', { className: 'app-title__sub', text: '五线谱直读 · 练习室' }),
      ),
      h('button', {
        className: 'icon-btn',
        attrs: { type: 'button', 'aria-label': '设置' },
        on: { click: () => ctx.navigate({ name: 'settings' }) },
        html: icon('gear', 22).outerHTML,
      }),
    ),
    h('div', { className: 'home__status' }, streakBadge(streakDays(state.streak, todayKey())), xpBar(state.xp)),
    h(
      'div',
      { className: 'screen__body' },
      h(
        'section',
        { className: 'card daily-card' },
        h('h2', { className: 'card__title', text: '今日训练' }),
        h('p', {
          className: 'card__note',
          text: dailyPlan.blocks.map((b) => b.title).join(' → '),
        }),
        h('button', {
          className: 'btn btn--primary btn--big',
          text: '今日训练',
          attrs: { type: 'button' },
          on: {
            click: () => ctx.navigate({ name: 'session', params: { plan: planFromDaily(ctx.getState()) } }),
          },
        }),
      ),
      h(
        'section',
        { className: 'card' },
        h('h2', { className: 'card__title', text: '自由练习' }),
        seg('题型', [
          { value: 'sig', label: '认调' },
          { value: 'note', label: '认音' },
          { value: 'mix', label: '混合' },
          { value: 'func', label: '和弦归属' },
          { value: 'diatonic', label: '顺阶和弦' },
          { value: 'degrees', label: '键盘音级' },
          { value: 'build', label: '和弦构建' },
        ], free.train, (v) => (free.train = v)),
        seg('谱号', [
          { value: 'treble', label: '高音' },
          { value: 'bass', label: '低音' },
          { value: 'mix', label: '混合' },
        ], free.clef, (v) => (free.clef = v)),
        seg('提问', [
          { value: 'maj', label: '大调' },
          { value: 'min', label: '小调' },
          { value: 'mix', label: '混合' },
        ], free.ask, (v) => (free.ask = v)),
        seg('时长', [
          { value: '3', label: '3 分钟' },
          { value: '5', label: '5 分钟' },
          { value: '10', label: '10 分钟' },
        ], String(free.minutes), (v) => (free.minutes = Number(v))),
        h('button', {
          className: 'btn btn--ghost btn--wide',
          text: '开始自由练习',
          attrs: { type: 'button' },
          on: {
            click: () => ctx.navigate({ name: 'session', params: { plan: planFromFree(free) } }),
          },
        }),
      ),
      h(
        'div',
        { className: 'home__entries' },
        h(
          'button',
          {
            className: 'entry',
            attrs: { type: 'button' },
            on: { click: () => ctx.navigate({ name: 'level-map' }) },
          },
          icon('flag', 20),
          h('span', { text: '闯关' }),
        ),
        h(
          'button',
          {
            className: 'entry',
            attrs: { type: 'button' },
            on: { click: () => ctx.navigate({ name: 'profile' }) },
          },
          icon('chart', 20),
          h('span', { text: '统计' }),
        ),
      ),
    ),
  );
  return { root };
}
