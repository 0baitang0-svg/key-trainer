/**
 * 滚动引擎纯逻辑测试：offsetFor(i, visW, scale, len) 的 35% 锚点、
 * 上下限 clamp（第 0 拍 x≥0 / 末拍不越界）、单调性与中间拍公式。
 * DOM 行为（平移/上色/冻结/进度）不在 node 环境单测。
 */

import { describe, expect, it } from 'vitest';
import { SEQ_ANCHOR, offsetFor } from '../src/ui/components/seq-stage';
import { seqNoteX, seqStaffWidth } from '../src/engraving/seq-staff';

const LEN = 16;
const VIS = 360;
const SCALE = 0.9;
const W = seqStaffWidth(LEN);
const MAX = W * SCALE - VIS;

describe('offsetFor（谱面平移纯函数）', () => {
  it('常量：锚点 35%；总宽 = seqStaffWidth(len) * scale', () => {
    expect(SEQ_ANCHOR).toBe(0.35);
    expect(W).toBe(seqStaffWidth(LEN));
    expect(MAX).toBeGreaterThan(0); // 夹具内容宽于视窗（可滚）
  });

  it('第 0 拍 x ≥ 0（负值 clamp 到 0）', () => {
    expect(offsetFor(0, VIS, SCALE, LEN)).toBeGreaterThanOrEqual(0);
    // 锚点算出 -226 时被 clamp
    expect(offsetFor(0, 1000, 0.5, LEN)).toBe(0);
  });

  it('末拍不越界：≤ 渲染总宽 - 视窗宽（顶到右界）', () => {
    const last = offsetFor(LEN - 1, VIS, SCALE, LEN);
    expect(last).toBeLessThanOrEqual(MAX);
    expect(last).toBe(MAX);
    for (let i = 0; i < LEN; i++) {
      expect(offsetFor(i, VIS, SCALE, LEN)).toBeLessThanOrEqual(MAX);
      expect(offsetFor(i, VIS, SCALE, LEN)).toBeGreaterThanOrEqual(0);
    }
  });

  it('随 i 单调不减；未触界区间（i≤11）严格递增', () => {
    let prev = -1;
    for (let i = 0; i < LEN; i++) {
      const x = offsetFor(i, VIS, SCALE, LEN);
      expect(x).toBeGreaterThanOrEqual(prev);
      prev = x;
    }
    for (let i = 1; i <= 11; i++) {
      expect(offsetFor(i, VIS, SCALE, LEN)).toBeGreaterThan(offsetFor(i - 1, VIS, SCALE, LEN));
    }
  });

  it('中间拍 = seqNoteX(i) * scale - visW * 0.35（当前音落在视窗 35%）', () => {
    for (const i of [0, 3, 5, 8, 11]) {
      expect(offsetFor(i, VIS, SCALE, LEN)).toBeCloseTo(seqNoteX(i) * SCALE - VIS * SEQ_ANCHOR, 6);
    }
  });

  it('内容窄于视窗（总宽 ≤ 视窗宽）恒 0', () => {
    for (let i = 0; i < LEN; i++) {
      expect(offsetFor(i, 2000, 0.5, LEN)).toBe(0);
    }
  });

  it('末拍在视窗内（内容刚够宽）不越界且 ≥ 0', () => {
    const scale = 0.3; // 1160 * 0.3 = 348 < 360 → 不可滚
    expect(offsetFor(LEN - 1, VIS, scale, LEN)).toBe(0);
  });
});
