/**
 * 设置页：音量 / 静音、大字模式、导出导入 JSON、重置数据（二次确认）。
 */

import { createInitialState, exportJSON, importJSON } from '../../core/store';
import { setMuted, setVolume } from '../../audio/sfx';
import { h, icon } from '../dom';
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

  /* ---------- 重置（二次确认） ---------- */

  let armed = false;
  let armTimer = 0;
  const resetBtn = h('button', {
    className: 'btn btn--danger btn--wide',
    text: '重置数据',
    attrs: { type: 'button' },
    on: {
      click: () => {
        if (!armed) {
          armed = true;
          resetBtn.textContent = '再点一次确认清空';
          resetBtn.classList.add('is-armed');
          armTimer = window.setTimeout(() => {
            armed = false;
            resetBtn.textContent = '重置数据';
            resetBtn.classList.remove('is-armed');
          }, 4000);
          return;
        }
        window.clearTimeout(armTimer);
        ctx.update(() => createInitialState());
        applyFontClass(false);
        setVolume(0.8);
        setMuted(false);
        ctx.reset({ name: 'home' });
      },
    },
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
    h('section', { className: 'card' }, resetBtn),
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
      window.clearTimeout(armTimer);
    },
  };
}

/** 大字模式根 class（main.ts 启动时也会调用） */
export function applyFontClass(on: boolean): void {
  document.documentElement.classList.toggle('font-big', on);
}
