/**
 * 谱面 step 基准锁死测试：坐标系 step 0 = 高音谱 E4 / 低音谱 G2。
 * 曾出 bug：基准误写成 C4/E2，导致所有和弦音整体偏高 2 step。
 */

import { describe, expect, it } from 'vitest';
import { staffOptionsFor } from '../src/ui/components/staff-view';
import type { Question } from '../src/core/question-generator';
import type { ChordSpec } from '../src/core/chord-theory';

function chordQuestion(chord: ChordSpec, clef: 'treble' | 'bass'): Question {
  return {
    id: 't',
    train: 'func',
    type: 'sh',
    n: 1,
    clef,
    ask: 'maj',
    cq: { kind: 'dom-key', chord },
    options: [],
  };
}

describe('staffStepOf 基准（经 staffOptionsFor 锁死）', () => {
  it('G7 高音谱 = G4(2) B4(4) D5(6) F5(8)', () => {
    const opts = staffOptionsFor(chordQuestion({ root: { letter: 'G', acc: 0 }, quality: '7' }, 'treble'));
    expect(opts.notes?.map((n) => n.step)).toEqual([2, 4, 6, 8]);
  });

  it('G7 低音谱 = G3(7) B3(9) D4(11) F4(13)', () => {
    const opts = staffOptionsFor(chordQuestion({ root: { letter: 'G', acc: 0 }, quality: '7' }, 'bass'));
    expect(opts.notes?.map((n) => n.step)).toEqual([7, 9, 11, 13]);
  });

  it('C 大三高音谱 = C4(-2) E4(0) G4(2)', () => {
    const opts = staffOptionsFor(chordQuestion({ root: { letter: 'C', acc: 0 }, quality: 'maj' }, 'treble'));
    expect(opts.notes?.map((n) => n.step)).toEqual([-2, 0, 2]);
  });

  it('基准断言：E4 = step 0（高音谱第 1 线）', () => {
    const opts = staffOptionsFor({
      id: 't', train: 'degrees', type: 'sh', n: 0, clef: 'treble', ask: 'maj',
      cq: { kind: 'deg2note', tonic: { letter: 'E', acc: 0 }, scale: 'maj' },
      options: [],
    });
    expect(opts.notes?.[0]?.step).toBe(0);
  });

  it('升降号拼写不改变 step（F♯7 = F♯4(1) A♯4(3) C♯5(5) E5(7)）', () => {
    const opts = staffOptionsFor(chordQuestion({ root: { letter: 'F', acc: 1 }, quality: '7' }, 'treble'));
    expect(opts.notes?.map((n) => n.step)).toEqual([1, 3, 5, 7]);
  });
});
