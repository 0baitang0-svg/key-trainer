/**
 * UI 基础工具：极简 DOM 构造、图标字典与格式化助手。
 * 不引入任何框架，全部手写元素树，方便与刻谱纸设计语言对齐。
 */

export type Child = Node | string | null | undefined;

/** 创建元素（className 支持空格分隔多类；dataset 通过 props.dataset 传入） */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: {
    className?: string;
    text?: string;
    html?: string;
    attrs?: Record<string, string>;
    dataset?: Record<string, string>;
    on?: Partial<{ [E in keyof HTMLElementEventMap]: (ev: HTMLElementEventMap[E]) => void }>;
  } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.className) el.className = props.className;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.html !== undefined) el.innerHTML = props.html;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  if (props.dataset) for (const [k, v] of Object.entries(props.dataset)) el.dataset[k] = v;
  if (props.on) {
    for (const [name, fn] of Object.entries(props.on)) {
      el.addEventListener(name, fn as EventListener);
    }
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** 内联 SVG 图标（描边风格，随 currentColor） */
export function icon(name: IconName, size = 22): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.classList.add('icon', `icon--${name}`);
  svg.innerHTML = ICON_PATHS[name];
  return svg;
}

export type IconName = 'gear' | 'flame' | 'star' | 'star-fill' | 'back' | 'play' | 'check' | 'close' | 'flag' | 'chart' | 'grid' | 'book';

const ICON_PATHS: Record<IconName, string> = {
  gear:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  flame:
    '<path d="M12 3.5c.6 2.7-1.2 3.8-2.3 5.2-1 1.3-1.4 2.4-1.4 3.7 0 2.9 1.9 5 3.9 5s3.7-2 3.7-4.7c0-1.6-.6-3-1.5-4.3-.2 1-.8 1.7-1.5 2 .3-2.7-.4-4.7-.9-5.6z"/><path d="M12 20.3c-1.1 0-2-.9-2-2 0-1 .7-1.7 1.3-2.5.2.9.7 1.4 1.3 1.4.8 0 1.4-.7 1.4-1.7.5.7.9 1.5.9 2.4 0 1.4-1 2.4-2.9 2.4z"/>',
  star: '<path d="M12 4.2l2.3 4.8 5.2.7-3.8 3.6.9 5.2-4.6-2.5-4.6 2.5.9-5.2L4.5 9.7l5.2-.7z"/>',
  'star-fill':
    '<path d="M12 4.2l2.3 4.8 5.2.7-3.8 3.6.9 5.2-4.6-2.5-4.6 2.5.9-5.2L4.5 9.7l5.2-.7z" fill="currentColor"/>',
  back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  play: '<path d="M9 6.5l9 5.5-9 5.5z"/>',
  check: '<path d="M5.5 12.5l4.2 4.2L18.5 8"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  flag: '<path d="M6.5 20V4.5M6.5 5.2h10.8l-2 3.6 2 3.6H6.5"/>',
  chart: '<path d="M4.5 19.5h15M7.5 16V9.5M12 16V5.5M16.5 16v-4"/>',
  grid: '<rect x="4.5" y="4.5" width="6" height="6"/><rect x="13.5" y="4.5" width="6" height="6"/><rect x="4.5" y="13.5" width="6" height="6"/><rect x="13.5" y="13.5" width="6" height="6"/>',
  book: '<path d="M4 5.2A2.2 2.2 0 0 1 6.2 3H11.5v16.5H6.2A2.2 2.2 0 0 0 4 21.7z"/><path d="M20 5.2A2.2 2.2 0 0 0 17.8 3H12.5v16.5h5.3A2.2 2.2 0 0 1 20 21.7z"/>',
};

/** 本地日期 YYYY-MM-DD */
export function dateKeyOf(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 今天（本地日期） */
export function todayKey(): string {
  return dateKeyOf(new Date());
}

/** 毫秒 → 「1.24s」 */
export function fmtSec(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

/** 比率 → 「85%」（null → 「—」） */
export function fmtPct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}

/** 数字 → 「1.2s」或「860ms」 */
export function fmtMs(ms: number | null): string {
  if (ms === null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}
