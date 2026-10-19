/**
 * 经验进度条：等级 + 当前级内进度。
 */

import { XP_PER_LEVEL, levelFromXp } from '../../core/store';
import { h } from '../dom';

/** 经验进度（含等级徽标） */
export function xpBar(xp: number): HTMLElement {
  const level = levelFromXp(xp);
  const inLevel = ((Math.max(0, xp) % XP_PER_LEVEL) + XP_PER_LEVEL) % XP_PER_LEVEL;
  const ratio = inLevel / XP_PER_LEVEL;
  return h(
    'div',
    { className: 'xp' },
    h(
      'div',
      { className: 'xp__head' },
      h('span', { className: 'xp__level', text: `等级 ${level}` }),
      h('span', { className: 'xp__num', text: `${inLevel} / ${XP_PER_LEVEL}` }),
    ),
    h(
      'div',
      {
        className: 'xp__track',
        attrs: { role: 'progressbar', 'aria-valuenow': String(inLevel), 'aria-valuemin': '0', 'aria-valuemax': String(XP_PER_LEVEL) },
      },
      h('div', { className: 'xp__fill', attrs: { style: `--xp:${(ratio * 100).toFixed(1)}%` } }),
    ),
  );
}
