/**
 * Leitner 错题队列：答错入队、答对升档、按混合间隔（题数 / 天数）到期。
 * 全部纯函数：不修改入参，时间与题数都由调用方注入，便于测试。
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** 间隔档：0-3 档按「本节题数」计，4-6 档按「天」计 */
export type IntervalSpec = number | 'sessionEnd' | 'nextDay';

/**
 * 7 档间隔表（索引 = box）：
 * - box 0 → 1 题后复查
 * - box 1 → 3 题后复查
 * - box 2 → 10 题后复查
 * - box 3 → 本节结束时复查
 * - box 4 → 次日复查
 * - box 5 → 3 天后复查
 * - box 6 → 7 天后复查
 */
export const INTERVALS: readonly IntervalSpec[] = [1, 3, 10, 'sessionEnd', 'nextDay', 3, 7];

/** 队列上限，超出后淘汰「最旧且档位最高」的条目 */
export const QUEUE_LIMIT = 50;

/** sessionCount 哨兵值：表示「本节已结束」 */
export const SESSION_END = -1;

export interface ReviewItem {
  /** 题目 key（保留 train/type/n/clef/ask/step/piece 信息） */
  questionKey: string;
  /** Leitner 档位 0..6 */
  box: number;
  /** 首次入队时间戳 */
  enqueuedAt: number;
  /** 最近一次作答（升档/归零）时间戳 */
  updatedAt: number;
  /** 累计答错次数 */
  wrongCount: number;
  /** 累计答对次数 */
  rightCount: number;
  /** 0-3 档：题数锚点（本节已出题数），到期条件 sessionCount - baseCount >= 间隔 */
  baseCount: number | null;
  /** 4-6 档：到期时间戳（毫秒） */
  dueAt: number | null;
}

export type ReviewQueue = ReviewItem[];

function schedule(box: number, now: number, sessionCount: number): { baseCount: number | null; dueAt: number | null } {
  const iv = INTERVALS[box];
  if (iv === 'sessionEnd') return { baseCount: sessionCount, dueAt: null };
  if (iv === 'nextDay') return { baseCount: null, dueAt: now + DAY_MS };
  if (typeof iv === 'number') {
    return box <= 3 ? { baseCount: sessionCount, dueAt: null } : { baseCount: null, dueAt: now + iv * DAY_MS };
  }
  return { baseCount: null, dueAt: null };
}

/** 队列超限时淘汰最旧且档位最高者（新条目 box=0，不会被淘汰） */
export function dropOverflow(queue: ReviewQueue): ReviewQueue {
  if (queue.length <= QUEUE_LIMIT) return queue;
  const sorted = [...queue].sort((a, b) => (b.box - a.box) || (a.enqueuedAt - b.enqueuedAt));
  const drop = new Set(sorted.slice(0, queue.length - QUEUE_LIMIT).map((i) => i.questionKey));
  return queue.filter((i) => !drop.has(i.questionKey));
}

/**
 * 答错入队：box=0（已在队中则视为再次答错，归 0 档并累加 wrongCount）。
 * @param sessionCount 本节已出题数（题数档锚点），默认 0
 */
export function enqueueWrong(
  queue: ReviewQueue,
  questionKey: string,
  now: number,
  sessionCount = 0,
): ReviewQueue {
  const hit = queue.find((i) => i.questionKey === questionKey);
  const { baseCount, dueAt } = schedule(0, now, sessionCount);
  const item: ReviewItem = hit
    ? {
        ...hit,
        box: 0,
        updatedAt: now,
        wrongCount: hit.wrongCount + 1,
        baseCount,
        dueAt,
      }
    : {
        questionKey,
        box: 0,
        enqueuedAt: now,
        updatedAt: now,
        wrongCount: 1,
        rightCount: 0,
        baseCount,
        dueAt,
      };
  const next = hit ? queue.map((i) => (i.questionKey === questionKey ? item : i)) : [...queue, item];
  return dropOverflow(next);
}

/**
 * 作答反馈：答对升一档（封顶 6），答错归 0。
 * @param sessionCount 本节已出题数（题数档锚点），默认 0
 */
export function markAnswer(
  queue: ReviewQueue,
  questionKey: string,
  ok: boolean,
  now: number,
  sessionCount = 0,
): ReviewQueue {
  const hit = queue.find((i) => i.questionKey === questionKey);
  if (!hit) return ok ? queue : enqueueWrong(queue, questionKey, now, sessionCount);
  const box = ok ? Math.min(hit.box + 1, INTERVALS.length - 1) : 0;
  const { baseCount, dueAt } = schedule(box, now, sessionCount);
  return queue.map((i) =>
    i.questionKey === questionKey
      ? {
          ...i,
          box,
          updatedAt: now,
          wrongCount: i.wrongCount + (ok ? 0 : 1),
          rightCount: i.rightCount + (ok ? 1 : 0),
          baseCount,
          dueAt,
        }
      : i,
  );
}

/**
 * 到期判定：
 * - 0-2 档（题数档）：本节题数达到锚点 + 间隔即到期；题数回绕（新一节开始）视为到期
 * - 3 档（sessionEnd）：本节结束（sessionCount === SESSION_END）或新一节开始时到期
 * - 4-6 档（天数档）：now 达到 dueAt 到期
 */
export function isDue(item: ReviewItem, now: number, sessionCount: number): boolean {
  const iv = INTERVALS[item.box];
  if (iv === 'sessionEnd') {
    return sessionCount === SESSION_END || (item.baseCount !== null && sessionCount < item.baseCount);
  }
  if (typeof iv === 'number' && item.box <= 3) {
    if (item.baseCount === null) return true;
    return sessionCount < item.baseCount || sessionCount - item.baseCount >= iv;
  }
  return item.dueAt !== null && now >= item.dueAt;
}

/** 返回到期题（保持队列顺序） */
export function dueItems(queue: ReviewQueue, now: number, sessionCount: number): ReviewItem[] {
  return queue.filter((i) => isDue(i, now, sessionCount));
}

/** 队列中尚未到期的题数 */
export function pendingCount(queue: ReviewQueue, now: number, sessionCount: number): number {
  return queue.length - dueItems(queue, now, sessionCount).length;
}
