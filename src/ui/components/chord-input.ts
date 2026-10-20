/**
 * 拼和弦作答器：3 八度可点选钢琴键盘 + 已选音名列表 + 「清空」「确认」。
 * 确认把选中 midi 数组交给 onSubmit（空选不提交）。
 */

import { h } from '../dom';
import { keyDefName, midiToKeyDef, pianoKeyboard, type KeyMark } from './piano-keyboard';

export interface ChordInput {
  root: HTMLElement;
  getSelected(): number[];
  setSelected(midis: number[]): void;
  setMarks(marks: KeyMark[]): void;
  setDisabled(b: boolean): void;
  destroy(): void;
}

export function chordInput(onSubmit: (midis: number[]) => void): ChordInput {
  const notes = h('div', { className: 'chord-input__notes', text: '—' });

  const refresh = (): void => {
    const midis = kb.getSelected();
    notes.textContent = midis.length
      ? midis.map((m) => keyDefName(midiToKeyDef(m), true)).join(' · ')
      : '—';
  };

  const kb = pianoKeyboard({
    octaves: 3,
    interactive: true,
    labels: 'noteName',
    onToggle: refresh,
  });

  const clearBtn = h('button', {
    className: 'btn btn--ghost chord-input__clear',
    attrs: { type: 'button' },
    text: '清空',
    on: {
      click: () => {
        kb.setSelected([]);
        refresh();
      },
    },
  });

  const submitBtn = h('button', {
    className: 'btn btn--primary chord-input__submit',
    attrs: { type: 'button' },
    text: '确认',
    on: {
      click: () => {
        const midis = kb.getSelected();
        if (midis.length > 0) onSubmit(midis);
      },
    },
  });

  const root = h(
    'div',
    { className: 'chord-input' },
    kb.root,
    notes,
    h('div', { className: 'chord-input__actions' }, clearBtn, submitBtn),
  );

  return {
    root,
    getSelected: () => kb.getSelected(),
    setSelected(midis: number[]): void {
      kb.setSelected(midis);
      refresh();
    },
    setMarks(marks: KeyMark[]): void {
      kb.setMarks(marks);
    },
    setDisabled(b: boolean): void {
      kb.setDisabled(b);
      clearBtn.disabled = b;
      submitBtn.disabled = b;
    },
    destroy(): void {
      kb.destroy();
      root.remove();
    },
  };
}
