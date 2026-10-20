/**
 * 轻量底部提示条：复用 app.css 的 .toast 样式，2 秒自动消失。
 * 返回键提示、设置页反馈共用。
 */

import { h } from '../dom';

export function showToast(text: string, ms = 2000): void {
  const el = h('div', { className: 'toast', text });
  document.body.append(el);
  window.setTimeout(() => el.remove(), ms);
}
