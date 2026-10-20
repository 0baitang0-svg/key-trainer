/**
 * 连续打卡组件：火苗 + 天数。
 */

import { h, icon } from '../dom';

/** 火苗 + 连续天数（0 天给鼓励文案；≥3 天 streak--hot 呼吸 glow） */
export function streakBadge(days: number): HTMLElement {
  return h(
    'div',
    { className: `streak${days > 0 ? ' streak--on' : ''}${days >= 3 ? ' streak--hot' : ''}` },
    icon('flame', 20),
    h(
      'div',
      { className: 'streak__text' },
      h('span', { className: 'streak__num', text: days > 0 ? `${days} 天` : '今天开始' }),
      h('span', { className: 'streak__label', text: '连续打卡' }),
    ),
  );
}
