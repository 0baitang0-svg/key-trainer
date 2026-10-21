/**
 * 谱面 step 基准锁死测试：坐标系 step 0 = 高音谱 E4 / 低音谱 G2。
 * 历史 bug：
 * 1) 基准误写 C4/E2 → 和弦整体偏高 2 step（已修）
 * 2) 'ABCDEFG' 表使 A/B 根音起始差一个八度（A7 画到 step -4，已改绝对音级坐标）
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

function steps(chord: ChordSpec, clef: 'treble' | 'bass'): number[] {
  return staffOptionsFor(chordQuestion(chord, clef)).notes?.map((n) => n.step) ?? [];
}

describe('staffStepOf 基准（经 staffOptionsFor 锁死）', () => {
  it('G7 高音谱 = G4(2) B4(4) D5(6) F5(8)', () => {
    expect(steps({ root: { letter: 'G', acc: 0 }, quality: '7' }, 'treble')).toEqual([2, 4, 6, 8]);
  });

  it('G7 低音谱 = G3(7) B3(9) D4(11) F4(13)', () => {
    expect(steps({ root: { letter: 'G', acc: 0 }, quality: '7' }, 'bass')).toEqual([7, 9, 11, 13]);
  });

  it('C 大三高音谱 = C4(-2) E4(0) G4(2)', () => {
    expect(steps({ root: { letter: 'C', acc: 0 }, quality: 'maj' }, 'treble')).toEqual([-2, 0, 2]);
  });

  it('基准断言：E4 = step 0（高音谱第 1 线）', () => {
    const opts = staffOptionsFor({
      id: 't', train: 'degrees', type: 'sh', n: 0, clef: 'treble', ask: 'maj',
      cq: { kind: 'deg2note', tonic: { letter: 'E', acc: 0 }, scale: 'maj' },
      options: [],
    });
    expect(opts.notes?.[0]?.step).toBe(0);
  });

  it('F♯7 = F♯4(1) A♯4(3) C♯5(5) E5(7)', () => {
    expect(steps({ root: { letter: 'F', acc: 1 }, quality: '7' }, 'treble')).toEqual([1, 3, 5, 7]);
  });

  // A/B 根音回归（曾差一个八度：A7 画成 [-4,-2,0,2]）
  it('A7 高音谱 = A4(3) C♯5(5) E5(7) G5(9)', () => {
    expect(steps({ root: { letter: 'A', acc: 0 }, quality: '7' }, 'treble')).toEqual([3, 5, 7, 9]);
  });

  it('Am 高音谱 = A4(3) C5(5) E5(7)', () => {
    expect(steps({ root: { letter: 'A', acc: 0 }, quality: 'min' }, 'treble')).toEqual([3, 5, 7]);
  });

  it('B♭ 大三高音谱 = B♭4(4) D5(6) F5(8)', () => {
    expect(steps({ root: { letter: 'B', acc: -1 }, quality: 'maj' }, 'treble')).toEqual([4, 6, 8]);
  });

  it('B♭7 低音谱 = B♭3(9) D4(11) F4(13) A♭4(15)（根音 B 低音谱不差八度，旧公式给 2）', () => {
    expect(steps({ root: { letter: 'B', acc: -1 }, quality: '7' }, 'bass')).toEqual([9, 11, 13, 15]);
  });
});
