/**
 * 主题：深色玻璃（默认）/ 浅色玻璃。
 * 写到 html[data-theme]，由 app.css 的 token 覆盖表生效。
 */

export type Theme = 'dark' | 'light';

/** 应用主题（main.ts 启动 / 设置切换 / 导入数据后调用） */
export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
}
