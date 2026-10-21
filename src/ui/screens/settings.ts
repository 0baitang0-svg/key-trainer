/**
 * 设置页：音量 / 静音、大字模式、主题、提示卡、导出导入 JSON、重置数据（二次确认）。
 */

import { createInitialState, exportJSON, importJSON } from '../../core/store';
import { setMuted, setVolume } from '../../audio/sfx';
import { h, icon } from '../dom';
import { showToast } from '../components/toast';
import { applyTheme, type Theme } from '../theme';
import { getLesson, LESSON_ORDER, type MicroLesson } from '../../content/micro-lessons';
import { lessonSheet } from '../components/lesson-card';
import type { AppContext, ScreenInstance } from '../router';

function row(title: string, note: string, control: HTMLElement): HTMLElement {
  return h(
    'div',
    { className: 'setting-row' },
    h('div', { className: 'setting-row__text' }, h('span', { className: 'setting-row__title', text: title }), h('span', { className: 'setting-row__note', text: note })),
    control,
  );
}

function toggle(on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const btn = h('button', {
    className: `toggle${on ? ' is-on' : ''}`,
    attrs: { type: 'button', role: 'switch', 'aria-checked': String(on) },
    on: {
      click: () => {
        const next = !btn.classList.contains('is-on');
        btn.classList.toggle('is-on', next);
        btn.setAttribute('aria-checked', String(next));
        onChange(next);
      },
    },
  }, h('span', { className: 'toggle__knob' }));
  return btn;
}

/** 主题分段切换（深色玻璃 / 浅色玻璃） */
function themeSeg(value: Theme, onChange: (v: Theme) => void): HTMLElement {
  const group = h('div', { className: 'seg', attrs: { role: 'group', 'aria-label': '主题' } });
  const options: Array<{ value: Theme; label: string }> = [
    { value: 'dark', label: '深色玻璃' },
    { value: 'light', label: '浅色玻璃' },
  ];
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
  return group;
}

/** armed 二次确认按钮（4 秒超时还原），返回按钮元素与取消计时方法 */
function armedButton(
  label: string,
  confirmLabel: string,
  onConfirm: () => void,
): { root: HTMLElement; cancelArm(): void } {
  let armed = false;
  let armTimer = 0;
  const btn = h('button', {
    className: 'btn btn--danger btn--wide',
    text: label,
    attrs: { type: 'button' },
    on: {
      click: () => {
        if (!armed) {
          armed = true;
          btn.textContent = confirmLabel;
          btn.classList.add('is-armed');
          armTimer = window.setTimeout(() => {
            armed = false;
            btn.textContent = label;
            btn.classList.remove('is-armed');
          }, 4000);
          return;
        }
        window.clearTimeout(armTimer);
        armed = false;
        btn.textContent = label;
        btn.classList.remove('is-armed');
        onConfirm();
      },
    },
  });
  return { root: btn, cancelArm: () => window.clearTimeout(armTimer) };
}

export function settingsScreen(ctx: AppContext): ScreenInstance {
  const state = ctx.getState();
  const body = h('div', { className: 'screen__body' });

  // 音量
  const volumeValue = h('span', { className: 'setting-row__note', text: `${Math.round(state.config.volume * 100)}%` });
  const slider = h('input', {
    className: 'slider',
    attrs: {
      type: 'range',
      min: '0',
      max: '100',
      value: String(Math.round(state.config.volume * 100)),
      'aria-label': '音量',
    },
    on: {
      input: () => {
        const v = Number(slider.value) / 100;
        volumeValue.textContent = `${Math.round(v * 100)}%`;
        setVolume(v);
        ctx.update((s) => ({ ...s, config: { ...s.config, volume: v } }));
      },
    },
  });

  const soundToggle = toggle(state.config.sound, (on) => {
    setMuted(!on);
    ctx.update((s) => ({ ...s, config: { ...s.config, sound: on } }));
  });

  const fontToggle = toggle(state.config.bigFont, (on) => {
    document.documentElement.classList.toggle('font-big', on);
    ctx.update((s) => ({ ...s, config: { ...s.config, bigFont: on } }));
  });

  const themeControl = themeSeg(state.config.theme, (v) => {
    applyTheme(v);
    ctx.update((s) => ({ ...s, config: { ...s.config, theme: v } }));
  });

  /* ---------- 导出 / 导入弹层 ---------- */

  const overlay = h('div', { className: 'session__overlay' });
  let sheet: HTMLElement | null = null;

  function openDataSheet(): void {
    const textarea = h('textarea', {
      className: 'data-text',
      attrs: { spellcheck: 'false', 'aria-label': '数据 JSON' },
    });
    const note = h('p', { className: 'data-note', text: '导出后可粘贴保存；导入会整体替换当前数据。' });
    const close = (): void => {
      sheet?.remove();
      sheet = null;
      overlay.replaceChildren();
    };
    sheet = h(
      'div',
      { className: 'sheet-wrap' },
      h(
        'div',
        { className: 'sheet data-sheet' },
        h('h2', { className: 'sheet__title', text: '导出 / 导入数据' }),
        textarea,
        note,
        h(
          'div',
          { className: 'data-actions' },
          h('button', {
            className: 'btn btn--ghost',
            text: '填入导出数据',
            attrs: { type: 'button' },
            on: {
              click: () => {
                textarea.value = exportJSON(ctx.getState());
                note.textContent = '已填入当前数据，复制保存即可。';
              },
            },
          }),
          h('button', {
            className: 'btn btn--ghost',
            text: '从文本导入',
            attrs: { type: 'button' },
            on: {
              click: () => {
                try {
                  const next = importJSON(textarea.value);
                  ctx.update(() => next);
                  applyFontClass(next.config.bigFont);
                  applyTheme(next.config.theme);
                  setVolume(next.config.volume);
                  setMuted(!next.config.sound);
                  note.textContent = '导入成功。';
                } catch {
                  note.textContent = '导入失败：不是合法的 JSON。';
                }
              },
            },
          }),
          h('button', {
            className: 'btn btn--primary',
            text: '关闭',
            attrs: { type: 'button' },
            on: { click: close },
          }),
        ),
      ),
    );
    overlay.replaceChildren(sheet);
  }

  /* ---------- 提示卡 ---------- */

  const ruleCardToggle = toggle(state.config.showRuleCards, (on) => {
    ctx.update((s) => ({ ...s, config: { ...s.config, showRuleCards: on } }));
  });

  const resetCardsBtn = armedButton('重置微课卡记录', '再点一次确认清空', () => {
    ctx.update((s) => ({ ...s, seenKeys: [] }));
    showToast('已清空，下次训练每个类目会重新弹一次');
    refreshLessonDots();
  });

  /* ---------- 微课回顾（逐类目手动打开完整微课） ---------- */

  const lessonDotEls = new Map<string, HTMLElement>();
  function refreshLessonDots(): void {
    const seen = ctx.getState().seenKeys;
    for (const [id, el] of lessonDotEls) el.classList.toggle('is-read', seen.includes(id));
  }

  let lessonSheetInst: { root: HTMLElement; destroy(): void } | null = null;
  function openLessonCard(lesson: MicroLesson): void {
    if (lessonSheetInst !== null) return;
    const close = (): void => {
      lessonSheetInst?.destroy();
      lessonSheetInst = null;
      overlay.replaceChildren();
    };
    lessonSheetInst = lessonSheet(lesson, { mode: 'manual', onDismiss: close });
    overlay.replaceChildren(lessonSheetInst.root);
  }

  const lessonReview = h(
    'div',
    { className: 'lesson-review' },
    ...LESSON_ORDER.flatMap((id) => {
      const lesson = getLesson(id);
      if (lesson === undefined) return [];
      const dot = h('span', { className: 'lesson-dot' });
      lessonDotEls.set(id, dot);
      return [
        h(
          'button',
          {
            className: 'lesson-review__row',
            attrs: { type: 'button' },
            on: { click: () => openLessonCard(lesson) },
          },
          h('span', { className: 'lesson-review__no', text: String(lesson.no) }),
          h('span', { className: 'lesson-review__title', text: lesson.title }),
          dot,
        ),
      ];
    }),
  );
  refreshLessonDots();

  /* ---------- 引导（二次确认） ---------- */

  const replayOnboardingBtn = armedButton('重看新手引导', '再点一次确认重看', () => {
    ctx.update((s) => ({ ...s, onboarded: false }));
    ctx.reset({ name: 'onboarding' });
  });

  const resetCoachBtn = armedButton('重置提示', '再点一次确认清空', () => {
    ctx.update((s) => ({ ...s, seenFlags: [] }));
    showToast('已重置，提示气泡会重新弹');
  });

  /* ---------- 重置（二次确认） ---------- */

  const resetBtn = armedButton('重置数据', '再点一次确认清空', () => {
    ctx.update(() => createInitialState());
    applyFontClass(false);
    applyTheme('dark');
    setVolume(0.8);
    setMuted(false);
    ctx.reset({ name: 'home' });
  });

  body.append(
    h(
      'section',
      { className: 'card' },
      h('h2', { className: 'card__title', text: '声音' }),
      row('音量', '合成音效的主音量', slider),
      row('音效', '关闭后不再有反馈音', soundToggle),
    ),
    h(
      'section',
      { className: 'card' },
      h('h2', { className: 'card__title', text: '显示' }),
      row('大字模式', '整体放大字号，谱面同步缩放', fontToggle),
      row('主题', '深色玻璃 / 浅色玻璃，即点即换', themeControl),
    ),
    h(
      'section',
      { className: 'card' },
      h('h2', { className: 'card__title', text: '引导' }),
      replayOnboardingBtn.root,
      h('p', { className: 'card__note', text: '重新看一遍四屏新手引导。' }),
      resetCoachBtn.root,
      h('p', { className: 'card__note', text: '清空提示气泡的「已看过」标记，气泡会重新弹。' }),
    ),
    h(
      'section',
      { className: 'card' },
      h('h2', { className: 'card__title', text: '微课' }),
      row('自动弹微课', '每个类目首遇弹一次；关闭不影响手动查看', ruleCardToggle),
      resetCardsBtn.root,
      h('p', { className: 'card__note', text: '只清空「已看过」记录，不影响训练数据。' }),
      h('h3', { className: 'card__sub', text: '微课回顾' }),
      lessonReview,
    ),
    h(
      'section',
      { className: 'card' },
      h('h2', { className: 'card__title', text: '数据' }),
      h('button', {
        className: 'btn btn--ghost btn--wide',
        text: '导出 / 导入 JSON',
        attrs: { type: 'button' },
        on: { click: openDataSheet },
      }),
      h('p', { className: 'card__note', text: '数据保存在本机；导出可迁移或备份。' }),
    ),
    h('section', { className: 'card' }, resetBtn.root),
  );

  const root = h(
    'section',
    { className: 'screen screen--settings' },
    h(
      'header',
      { className: 'topbar' },
      h('button', {
        className: 'icon-btn',
        attrs: { type: 'button', 'aria-label': '返回' },
        html: icon('back', 22).outerHTML,
        on: { click: () => ctx.back() },
      }),
      h('h1', { className: 'app-title' }, '设置'),
    ),
    body,
    overlay,
  );
  return {
    root,
    destroy(): void {
      resetBtn.cancelArm();
      resetCardsBtn.cancelArm();
      replayOnboardingBtn.cancelArm();
      resetCoachBtn.cancelArm();
    },
  };
}

/** 大字模式根 class（main.ts 启动时也会调用） */
export function applyFontClass(on: boolean): void {
  document.documentElement.classList.toggle('font-big', on);
}
