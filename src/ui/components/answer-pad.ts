/**
 * 答题键盘：认调 6 选（2×3 六宫格）/ 认音 3 选（三列）/ 和弦题 4 选（2×2）。
 * 全部落在屏幕下半的拇指区，触高 ≥56px。
 */

import { h } from '../dom';

export interface AnswerPadOptions {
  /** 展示选项（顺序即键盘顺序） */
  options: string[];
  /** 认音 = 三列一行；认调 = 三列两行；和弦题 = 两列两行 */
  layout: 'row3' | 'grid6' | 'grid4';
  onPick: (label: string, index: number) => void;
}

export interface AnswerPad {
  root: HTMLElement;
  setDisabled(disabled: boolean): void;
  /** 标注某个选项：correct 绿描边 / wrong 朱红描边 */
  mark(label: string, state: 'correct' | 'wrong'): void;
  /** 键盘 / 编程触发第 i 个选项 */
  pickAt(index: number): void;
  destroy(): void;
}

export function answerPad(opts: AnswerPadOptions): AnswerPad {
  const buttons: HTMLButtonElement[] = [];
  const root = h('div', {
    className: `answer-pad answer-pad--${opts.layout}`,
    attrs: { role: 'group', 'aria-label': '作答选项' },
  });

  opts.options.forEach((label, i) => {
    const btn = h(
      'button',
      {
        className: 'opt',
        attrs: { type: 'button' },
        dataset: { index: String(i) },
        on: {
          click: () => {
            if (btn.disabled) return;
            opts.onPick(label, i);
          },
        },
      },
      h('span', { className: 'opt__key', text: `${i + 1}` }),
      h('span', { className: 'opt__label', text: label }),
    );
    buttons.push(btn);
    root.append(btn);
  });

  return {
    root,
    setDisabled(disabled: boolean): void {
      for (const b of buttons) b.disabled = disabled;
    },
    mark(label: string, state: 'correct' | 'wrong'): void {
      const idx = opts.options.indexOf(label);
      if (idx >= 0) buttons[idx].classList.add(state === 'correct' ? 'opt--correct' : 'opt--wrong');
    },
    pickAt(index: number): void {
      buttons[index]?.click();
    },
    destroy(): void {
      root.remove();
    },
  };
}
