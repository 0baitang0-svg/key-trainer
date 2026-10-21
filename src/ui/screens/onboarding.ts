/**
 * 首启引导：4 屏横滑（swipe / 按钮均可翻页）+ 页点指示 + 右上「跳过」。
 * 完成 / 跳过 → onboarded: true 并 reset 回首页；由 main 按 !state.onboarded 送进来。
 * 玻璃卡 stagger 上浮进入（prefers-reduced-motion 自动降级为直接显示）。
 */

import { h } from '../dom';
import { mascot, type Mascot } from '../components/mascot';
import type { AppContext, ScreenInstance } from '../router';

/** 上浮入场元素：stagger 序号写进 --i */
function rise(className: string, i: number): HTMLElement {
  return h('div', { className: `onboard__rise ${className}`, attrs: { style: `--i:${i}` } });
}

/** 玻璃小卡（三大训练 / 今日任务两屏） */
function glassChip(title: string, note: string, i: number): HTMLElement {
  return h(
    'div',
    { className: 'card onboard__card', attrs: { style: `--i:${i}` } },
    h('p', { className: 'onboard__card-title', text: title }),
    h('p', { className: 'onboard__card-note', text: note }),
  );
}

interface SlideDef {
  title: string;
  body: string;
  /** 底部主按钮文案 */
  cta: string;
  /** 吉祥物表情（无则不出吉祥物） */
  mood?: 'welcome' | 'cheer';
  chips?: ReadonlyArray<readonly [string, string]>;
}

const SLIDES: readonly SlideDef[] = [
  {
    title: '欢迎来到五线谱练习室！',
    body: '我是谱谱～ 每天几分钟，让看谱像看字一样快。',
    cta: '开始了解',
    mood: 'welcome',
  },
  {
    title: '三大训练',
    body: '自适应出题，越练越准，错了的题会自动回来找你。',
    cta: '下一步',
    chips: [
      ['认调', '调号一眼认出来'],
      ['视奏', '跟谱弹真音'],
      ['和弦反应', '功能与拼和弦秒判'],
    ],
  },
  {
    title: '今日任务',
    body: '首页『今日训练』已经排好课表：主练 + 弱项专练 + 冲刺。点一下，5 分钟完成一次闭环。',
    cta: '下一步',
    chips: [
      ['主练', '今天的重点调号'],
      ['弱项专练', '最差的自动回来找你'],
      ['冲刺', '限时连击收尾'],
    ],
  },
  {
    title: '陪伴与成就',
    body: '答对我会欢呼，答错我们看解析。连击、经验、徽章、打卡，都在等你解锁。',
    cta: '开始练习',
    mood: 'cheer',
  },
];

export function onboardingScreen(ctx: AppContext): ScreenInstance {
  const mascots: Mascot[] = [];

  const slides: HTMLElement[] = SLIDES.map((def) => {
    const inner = h('div', { className: 'onboard__slide-inner' });
    if (def.mood) {
      const host = rise('onboard__mascot', 0);
      const m = mascot({ mood: def.mood, size: 168 });
      mascots.push(m);
      host.append(m.root);
      inner.append(host);
    } else if (def.chips) {
      inner.append(
        h('div', { className: 'onboard__cards' }, ...def.chips.map(([t, n], i) => glassChip(t, n, i))),
      );
    }
    return h(
      'div',
      { className: 'onboard__slide' },
      h('h2', { className: 'onboard__title', text: def.title }),
      inner,
      h('p', { className: 'onboard__body', text: def.body }),
    );
  });

  const track = h('div', { className: 'onboard__track' }, ...slides);
  const viewport = h('div', { className: 'onboard' }, track);

  const dots = h(
    'div',
    { className: 'onboard__dots', attrs: { role: 'tablist', 'aria-label': '引导进度' } },
    ...SLIDES.map((_, i) =>
      h('button', {
        className: 'onboard__dot',
        attrs: { type: 'button', 'aria-label': `第 ${i + 1} 页` },
        on: { click: () => go(i) },
      }),
    ),
  );

  const backBtn = h('button', {
    className: 'btn btn--ghost onboard__nav-btn',
    text: '上一步',
    attrs: { type: 'button' },
    on: { click: () => go(index - 1) },
  });
  const mainBtn = h('button', {
    className: 'btn onboard__nav-btn onboard__cta',
    text: SLIDES[0].cta,
    attrs: { type: 'button' },
    on: { click: () => (index >= SLIDES.length - 1 ? finish() : go(index + 1)) },
  });

  const root = h(
    'section',
    { className: 'screen screen--onboarding' },
    h(
      'header',
      { className: 'topbar' },
      h('h1', { className: 'app-title' }, '五线谱练习室', h('span', { className: 'app-title__sub', text: '新手引导' })),
      h('button', {
        className: 'btn btn--ghost onboard__skip',
        text: '跳过',
        attrs: { type: 'button' },
        on: { click: finish },
      }),
    ),
    viewport,
    dots,
    h('div', { className: 'onboard__nav' }, backBtn, mainBtn),
  );

  let index = 0;

  function finish(): void {
    ctx.update((s) => ({ ...s, onboarded: true }));
    ctx.reset({ name: 'home' });
  }

  function go(next: number): void {
    const i = Math.min(Math.max(0, next), SLIDES.length - 1);
    if (i === index) return;
    index = i;
    track.style.transform = `translateX(-${index * 100}%)`;
    slides.forEach((s, n) => {
      // 切换到的屏重放入场动画（stagger 上浮）
      s.classList.remove('is-active');
      if (n === index) void s.offsetWidth;
      s.classList.toggle('is-active', n === index);
    });
    for (const [n, d] of Array.from(dots.children).entries()) d.classList.toggle('is-active', n === index);
    backBtn.hidden = index === 0;
    mainBtn.textContent = SLIDES[index].cta;
    mainBtn.classList.toggle('btn--primary', index === SLIDES.length - 1);
  }

  /* ---------- 横滑翻页 ---------- */

  let downX: number | null = null;
  const onDown = (e: PointerEvent): void => {
    downX = e.clientX;
  };
  const onUp = (e: PointerEvent): void => {
    if (downX === null) return;
    const dx = e.clientX - downX;
    downX = null;
    if (dx <= -45) go(index + 1);
    else if (dx >= 45) go(index - 1);
  };
  const onCancel = (): void => {
    downX = null;
  };
  viewport.addEventListener('pointerdown', onDown);
  viewport.addEventListener('pointerup', onUp);
  viewport.addEventListener('pointercancel', onCancel);

  // 初始：第 1 屏动画 + 页点 + 按钮态
  slides[0]?.classList.add('is-active');
  dots.children[0]?.classList.add('is-active');
  backBtn.hidden = true;

  return {
    root,
    destroy(): void {
      viewport.removeEventListener('pointerdown', onDown);
      viewport.removeEventListener('pointerup', onUp);
      viewport.removeEventListener('pointercancel', onCancel);
      for (const m of mascots) m.destroy();
    },
  };
}
