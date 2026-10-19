import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  QUEUE_LIMIT,
  SESSION_END,
  dueItems,
  enqueueWrong,
  isDue,
  markAnswer,
  type ReviewItem,
  type ReviewQueue,
} from '../src/core/scheduler';

const NOW = 1_700_000_000_000;
const KEY = 'sig|sh|3|treble|maj';

describe('Leitner 错题队列', () => {
  it('答错入队：box=0、wrongCount=1、以本节题数为锚点', () => {
    const q0: ReviewQueue = [];
    const q1 = enqueueWrong(q0, KEY, NOW, 10);
    expect(q0).toHaveLength(0); // 纯函数，不改入参
    expect(q1).toHaveLength(1);
    expect(q1[0]).toMatchObject({ questionKey: KEY, box: 0, wrongCount: 1, rightCount: 0, baseCount: 10 });
  });

  it('重复答错：归 0 档且 wrongCount 累加', () => {
    let q = enqueueWrong([], KEY, NOW, 5);
    q = markAnswer(q, KEY, true, NOW + 1, 6);
    expect(q[0].box).toBe(1);
    q = markAnswer(q, KEY, false, NOW + 2, 7);
    expect(q[0].box).toBe(0);
    expect(q[0].wrongCount).toBe(2);
    expect(q[0].rightCount).toBe(1);
  });

  it('答对升档、封顶 6 档', () => {
    let q = enqueueWrong([], KEY, NOW, 0);
    for (let i = 1; i <= 8; i++) {
      q = markAnswer(q, KEY, true, NOW + i, i);
    }
    expect(q[0].box).toBe(6);
    expect(q[0].rightCount).toBe(8);
  });

  it('到期计算：0 档（1 题间隔）按本节题数到期', () => {
    const q = enqueueWrong([], KEY, NOW, 5);
    expect(dueItems(q, NOW, 5)).toHaveLength(0);
    expect(dueItems(q, NOW, 6)).toHaveLength(1);
  });

  it('到期计算：1 档（3 题间隔）', () => {
    let q = enqueueWrong([], KEY, NOW, 5);
    q = markAnswer(q, KEY, true, NOW, 6); // 升到 1 档，锚点 6，间隔 3
    expect(dueItems(q, NOW, 8)).toHaveLength(0);
    expect(dueItems(q, NOW, 9)).toHaveLength(1);
  });

  it('到期计算：题数回绕（新一节）视为到期', () => {
    const q = enqueueWrong([], KEY, NOW, 20);
    expect(dueItems(q, NOW, 3)).toHaveLength(1);
  });

  it('到期计算：3 档 sessionEnd 在本节结束时到期', () => {
    let q = enqueueWrong([], KEY, NOW, 0);
    for (let i = 1; i <= 3; i++) q = markAnswer(q, KEY, true, NOW, i);
    expect(q[0].box).toBe(3);
    expect(dueItems(q, NOW, 50)).toHaveLength(0); // 本节内不打扰
    expect(dueItems(q, NOW, SESSION_END)).toHaveLength(1); // 本节结束统一复习
  });

  it('到期计算：4 档 nextDay 按天到期', () => {
    let q = enqueueWrong([], KEY, NOW, 0);
    for (let i = 1; i <= 4; i++) q = markAnswer(q, KEY, true, NOW, i);
    expect(q[0].box).toBe(4);
    expect(q[0].dueAt).toBe(NOW + DAY_MS);
    expect(dueItems(q, NOW + DAY_MS - 1, 100)).toHaveLength(0);
    expect(dueItems(q, NOW + DAY_MS, 100)).toHaveLength(1);
  });

  it('到期计算：5/6 档按 3 天 / 7 天', () => {
    let q = enqueueWrong([], KEY, NOW, 0);
    for (let i = 1; i <= 5; i++) q = markAnswer(q, KEY, true, NOW, i);
    expect(q[0].box).toBe(5);
    expect(isDue(q[0], NOW + 3 * DAY_MS - 1, 100)).toBe(false);
    expect(isDue(q[0], NOW + 3 * DAY_MS, 100)).toBe(true);

    q = markAnswer(q, KEY, true, NOW, 6);
    expect(q[0].box).toBe(6);
    expect(isDue(q[0], NOW + 7 * DAY_MS - 1, 100)).toBe(false);
    expect(isDue(q[0], NOW + 7 * DAY_MS, 100)).toBe(true);
  });

  it('队列上限 50：溢出淘汰最旧且档位最高者', () => {
    let q: ReviewQueue = [];
    for (let i = 0; i < QUEUE_LIMIT; i++) {
      q = enqueueWrong(q, `sig|sh|${i % 8}|treble|maj|id${i}`, NOW + i, 0);
    }
    expect(q).toHaveLength(QUEUE_LIMIT);
    // 把最早入队的条目推到最高档
    const oldest = q[0];
    for (let i = 1; i <= 6; i++) q = markAnswer(q, oldest.questionKey, true, NOW + 1000 + i, i);
    expect(q.find((i) => i.questionKey === oldest.questionKey)?.box).toBe(6);

    q = enqueueWrong(q, 'sig|fl|7|bass|min|new', NOW + 2000, 20);
    expect(q).toHaveLength(QUEUE_LIMIT);
    expect(q.find((i) => i.questionKey === oldest.questionKey)).toBeUndefined();
    expect(q.find((i) => i.questionKey === 'sig|fl|7|bass|min|new')).toBeDefined();
  });

  it('作答反馈：不在队中的答错会入队、答对不动队列', () => {
    const q = markAnswer([], KEY, true, NOW, 0);
    expect(q).toHaveLength(0);
    const q2 = markAnswer([], KEY, false, NOW, 0);
    expect(q2).toHaveLength(1);
    expect(q2[0].box).toBe(0);
  });

  it('isDue 对天数档缺少 dueAt 时判为未到期', () => {
    const item: ReviewItem = {
      questionKey: KEY,
      box: 6,
      enqueuedAt: NOW,
      updatedAt: NOW,
      wrongCount: 1,
      rightCount: 6,
      baseCount: null,
      dueAt: null,
    };
    expect(isDue(item, NOW + 99 * DAY_MS, 100)).toBe(false);
  });
});
