import { describe, expect, it } from 'vitest';
import { keyDefName, midiToKeyDef, pianoKeyDefs } from '../src/ui/components/piano-keyboard';

/** 与 audio/melody-synth.ts 的 noteToMidi 一致（C4=60） */
const LETTER_SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteToMidi(letter: string, oct: number, acc: number): number {
  return (oct + 1) * 12 + LETTER_SEMI[letter] + acc;
}

describe('pianoKeyDefs（纯函数，可单测）', () => {
  it('pianoKeyDefs(48, 2) 生成 24 键（14 白 10 黑），midi 48..71 连续', () => {
    const defs = pianoKeyDefs(48, 2);
    expect(defs).toHaveLength(24);
    expect(defs.filter((d) => !d.isBlack)).toHaveLength(14);
    expect(defs.filter((d) => d.isBlack)).toHaveLength(10);
    expect(defs.map((d) => d.midi)).toEqual(Array.from({ length: 24 }, (_, i) => 48 + i));
    expect(defs[0].midi).toBe(48);
    expect(defs[23].midi).toBe(71);
  });

  it('midi ↔ letter/acc/oct：60→C4、61→C♯4、59→B3、48→C3、71→B4', () => {
    const defs = pianoKeyDefs(48, 2);
    const by = (midi: number) => defs.find((d) => d.midi === midi)!;

    expect(by(60)).toMatchObject({ letter: 'C', acc: 0, oct: 4, isBlack: false });
    expect(by(61)).toMatchObject({ letter: 'C', acc: 1, oct: 4, isBlack: true });
    expect(by(59)).toMatchObject({ letter: 'B', acc: 0, oct: 3, isBlack: false });
    expect(by(48)).toMatchObject({ letter: 'C', acc: 0, oct: 3, isBlack: false });
    expect(by(71)).toMatchObject({ letter: 'B', acc: 0, oct: 4, isBlack: false });
    expect(by(66)).toMatchObject({ letter: 'F', acc: 1, oct: 4, isBlack: true });

    // 显示名与 noteToMidi 换算闭环
    expect(keyDefName(by(60), true)).toBe('C4');
    expect(keyDefName(by(61), true)).toBe('C♯4');
    for (const d of defs) {
      expect(noteToMidi(d.letter, d.oct, d.acc)).toBe(d.midi);
    }
    expect(midiToKeyDef(61)).toMatchObject({ letter: 'C', acc: 1, oct: 4 });
  });

  it('黑键判定：半音 1/3/6/8/10 为黑键，其余白键', () => {
    const blackPcs = new Set([1, 3, 6, 8, 10]);
    for (const d of pianoKeyDefs(48, 2)) {
      expect(d.isBlack).toBe(blackPcs.has(((d.midi % 12) + 12) % 12));
    }
    expect(pianoKeyDefs(48, 2).filter((d) => d.isBlack).map((d) => d.midi)).toEqual([49, 51, 54, 56, 58, 61, 63, 66, 68, 70]);
  });

  it('3 八度：36 键（21 白 15 黑）', () => {
    const defs = pianoKeyDefs(48, 3);
    expect(defs).toHaveLength(36);
    expect(defs.filter((d) => !d.isBlack)).toHaveLength(21);
    expect(defs.filter((d) => d.isBlack)).toHaveLength(15);
    expect(defs[35].midi).toBe(83);
  });
});
