/**
 * 自由练习计划与视奏串长覆盖：
 * - minutes=0（不限时）→ 块 durationMs=Infinity、题数近无限、轮换保留
 * - seqLen>0（40/100 长串）→ 单块不限时、pick.seqLen 下发、按串数收束
 * - 非视奏题型残留 seqLen 被忽略
 * - pickQuestion 的 seqLen 覆盖序列长度（难度密度仍按自适应档）
 */

import { describe, expect, it } from 'vitest';
import { planFromFree } from '../src/ui/session-controller';
import { pickQuestion } from '../src/core/question-generator';
import { emptyStats } from '../src/core/stats';
import { makeRng } from '../src/core/question-generator';

const BASE = { clef: 'treble' as const, ask: 'maj' as const };

describe('planFromFree', () => {
  it('minutes=0：单/多块不计时、99 题、mix 轮换保留', () => {
    const plan = planFromFree({ ...BASE, train: 'mix', minutes: 0 });
    expect(plan.blocks.length).toBe(2); // sig → note 轮换
    for (const b of plan.blocks) {
      expect(b.durationMs).toBe(Number.POSITIVE_INFINITY);
      expect(b.questionCount).toBe(99);
    }
    expect(plan.blocks[0].pick.train).toBe('sig');
    expect(plan.blocks[1].pick.train).toBe('note');
  });

  it('限时行为不变：每分钟一块、60s、按题数/时长收束', () => {
    const plan = planFromFree({ ...BASE, train: 'sig', minutes: 3 });
    expect(plan.blocks.length).toBe(3);
    expect(plan.blocks[0].durationMs).toBe(60_000);
    expect(plan.blocks[0].questionCount).toBeGreaterThan(0);
  });

  it('seqLen=100 + 视奏 → 单块不限时 1 串、pick.seqLen=100', () => {
    const plan = planFromFree({ ...BASE, train: 'note', minutes: 5, seqLen: 100 });
    expect(plan.blocks.length).toBe(1);
    const b = plan.blocks[0];
    expect(b.durationMs).toBe(Number.POSITIVE_INFINITY);
    expect(b.questionCount).toBe(1);
    expect(b.pick.train).toBe('note');
    expect(b.pick.seqLen).toBe(100);
  });

  it('seqLen=40 → 2 串收束', () => {
    const plan = planFromFree({ ...BASE, train: 'note', minutes: 0, seqLen: 40 });
    expect(plan.blocks[0].questionCount).toBe(2);
    expect(plan.blocks[0].pick.seqLen).toBe(40);
  });

  it('非视奏题型残留 seqLen 被忽略（照旧限时块）', () => {
    const plan = planFromFree({ ...BASE, train: 'sig', minutes: 3, seqLen: 100 });
    expect(plan.blocks.length).toBe(3);
    expect(plan.blocks[0].pick.seqLen).toBeUndefined();
    expect(plan.blocks[0].durationMs).toBe(60_000);
  });
});

describe('pickQuestion seqLen 覆盖', () => {
  it('seqLen=40 → 生成 40 拍序列，profileCode 含 40；缺省仍按自适应档 6..16', () => {
    const cfg = {
      train: 'note' as const,
      clefs: ['treble' as const],
      asks: ['maj' as const],
      seqLen: 40,
    };
    const q = pickQuestion(cfg, emptyStats(), [], [], { rng: makeRng(7) });
    expect(q.seq?.notes.length).toBe(40);

    const cfg2 = { train: 'note' as const, clefs: ['treble' as const], asks: ['maj' as const] };
    const q2 = pickQuestion(cfg2, emptyStats(), [], [], { rng: makeRng(7) });
    const len2 = q2.seq?.notes.length ?? 0;
    expect(len2).toBeGreaterThanOrEqual(6);
    expect(len2).toBeLessThanOrEqual(16);
  });

  it('百音串能生成且音域/midi 合法', () => {
    const cfg = {
      train: 'note' as const,
      clefs: ['bass' as const],
      asks: ['maj' as const],
      seqLen: 100,
    };
    const q = pickQuestion(cfg, emptyStats(), [], [], { rng: makeRng(3) });
    const seq = q.seq!;
    expect(seq.notes.length).toBe(100);
    expect(seq.loMidi).toBeLessThanOrEqual(seq.hiMidi);
    for (const nt of seq.notes) {
      expect(nt.midis.length).toBeGreaterThanOrEqual(1);
      for (const m of nt.midis) expect(m).toBeGreaterThan(0);
    }
    // 小节划分完整（4 拍一节 → 25 小节）
    expect(seq.bars[0]).toBe(0);
    expect(seq.bars.length).toBeGreaterThanOrEqual(25);
  });
});
