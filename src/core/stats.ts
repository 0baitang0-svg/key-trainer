/**
 * 统计层：单条目（train|type|n|clef|ask）学习状态 + 全局聚合报表。
 * 全部纯函数：统计从 records（答题记录）推导或增量更新，不做任何 I/O。
 */

import type { Ask, Clef, SigType } from './music-theory';
import type { TrainMode } from './question-generator';

/** EMA 平滑系数 */
export const EMA_ALPHA = 0.3;
/** 反应样本滑动窗口长度（最近 30 次） */
export const REACTION_WINDOW = 30;
/** 「快速答对」阈值：≤1.5 秒 */
export const FAST_MS = 1500;

/** 单条目学习状态 */
export interface ItemStat {
  /** 累计作答次数 */
  attempts: number;
  /** 累计答对次数 */
  correct: number;
  /** 指数滑动平均正确率（α=0.3） */
  emaAccuracy: number;
  /** 反应中位数（毫秒，按滑动窗口样本） */
  medianReactionMs: number;
  /** 反应 p90（毫秒） */
  p90ReactionMs: number;
  /** 最近 30 次反应样本（毫秒） */
  reactionSamples: number[];
  /** 当前连对数 */
  consecCorrect: number;
  /** 最近一次作答时间戳（毫秒） */
  lastSeenAt: number;
}

/** 一条答题记录 */
export interface AttemptRecord {
  /** 条目 key = train|type|n|clef|ask */
  key: string;
  ok: boolean;
  /** 反应耗时（毫秒） */
  reactionMs: number;
  /** 作答时间戳（毫秒） */
  at: number;
}

/** 统计状态：条目表 + 原始记录（聚合 / 迁移都从 records 出发） */
export interface StatsState {
  items: Record<string, ItemStat>;
  records: AttemptRecord[];
}

/** 条目 key：train|type|n|clef|ask（和弦题用 extra 追加第 6 段 qkind） */
export function itemKey(train: TrainMode, type: SigType, n: number, clef: Clef, ask: Ask, extra = ''): string {
  const base = `${train}|${type}|${n}|${clef}|${ask}`;
  return extra === '' ? base : `${base}|${extra}`;
}

export function emptyItemStat(): ItemStat {
  return {
    attempts: 0,
    correct: 0,
    emaAccuracy: 0,
    medianReactionMs: 0,
    p90ReactionMs: 0,
    reactionSamples: [],
    consecCorrect: 0,
    lastSeenAt: 0,
  };
}

export function emptyStats(): StatsState {
  return { items: {}, records: [] };
}

/** EMA 更新：ema' = ema*(1-α) + 结果*α */
export function updateEma(prev: number, ok: boolean, alpha: number = EMA_ALPHA): number {
  return prev * (1 - alpha) + (ok ? 1 : 0) * alpha;
}

/** 中位数（空数组返回 null） */
export function median(values: ReadonlyArray<number>): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 百分位数（p 取 0..1，空数组返回 null） */
export function percentile(values: ReadonlyArray<number>, p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1));
  return s[idx];
}

/** 由反应样本重算中位数 / p90 */
function reactionSummary(samples: ReadonlyArray<number>): { med: number; p90: number } {
  return {
    med: median(samples) ?? 0,
    p90: percentile(samples, 0.9) ?? 0,
  };
}

/**
 * 增量应用一条答题记录（纯函数，返回新 state）。
 * - emaAccuracy 用 α=0.3 平滑
 * - reactionSamples 只留最近 30 次
 * - consecCorrect 答错归 0
 */
export function applyAttempt(state: StatsState, rec: AttemptRecord): StatsState {
  const prev = state.items[rec.key] ?? emptyItemStat();
  const samples = [...prev.reactionSamples, rec.reactionMs].slice(-REACTION_WINDOW);
  const { med, p90 } = reactionSummary(samples);
  const isFirst = prev.attempts === 0;
  const next: ItemStat = {
    attempts: prev.attempts + 1,
    correct: prev.correct + (rec.ok ? 1 : 0),
    emaAccuracy: isFirst ? (rec.ok ? 1 : 0) : updateEma(prev.emaAccuracy, rec.ok),
    medianReactionMs: med,
    p90ReactionMs: p90,
    reactionSamples: samples,
    consecCorrect: rec.ok ? prev.consecCorrect + 1 : 0,
    lastSeenAt: Math.max(prev.lastSeenAt, rec.at),
  };
  return {
    items: { ...state.items, [rec.key]: next },
    records: [...state.records, rec],
  };
}

/** 批量应用记录 */
export function applyAttempts(state: StatsState, records: ReadonlyArray<AttemptRecord>): StatsState {
  return records.reduce((s, r) => applyAttempt(s, r), state);
}

/** 由记录全量重建统计（导入 / 迁移用） */
export function buildStats(records: ReadonlyArray<AttemptRecord>): StatsState {
  return applyAttempts(emptyStats(), records);
}

/** 全体样本数（抽题偏置判断用） */
export function totalSamples(state: StatsState): number {
  return state.records.length;
}

/* ---------- 聚合报表 ---------- */

/** 每日序列（本地日期 YYYY-MM-DD） */
export interface DailySeries {
  date: string;
  /** 当日题数 */
  count: number;
  /** 当日答对数 */
  correct: number;
  /** 当日正确率（0 题为 null） */
  accuracy: number | null;
}

/** 按调号分组的条形数据（统计页） */
export interface KeyBar {
  type: SigType;
  n: number;
  count: number;
  correct: number;
  accuracy: number | null;
}

/** 按训练模式分组的条形数据（统计页「模式表现」，7 种模式全覆盖） */
export interface ModeBar {
  train: string;
  count: number;
  correct: number;
  accuracy: number;
}

/** 全部训练模式（modeBars 固定顺序） */
export const TRAIN_MODES: readonly TrainMode[] = ['sig', 'note', 'piece', 'func', 'diatonic', 'degrees', 'build'];

/** keyBars 只统计旧键训练（和弦题不按调号分组，防止污染旧键条形） */
const KEY_BAR_TRAINS: ReadonlySet<string> = new Set<string>(['sig', 'note', 'piece']);

export interface Aggregates {
  totalAttempts: number;
  totalCorrect: number;
  /** 总正确率（无记录为 null） */
  accuracy: number | null;
  /** 全体反应中位数（毫秒） */
  medianReactionMs: number | null;
  /** ≤1.5s 占比 */
  fastRatio: number | null;
  /** 当前连击（最近连续答对数） */
  currentStreak: number;
  /** 最长连击 */
  bestStreak: number;
  /** 最近 7 日每日题数与正确率（升序，含今天） */
  daily: DailySeries[];
  /** 按调号分组条形数据（升号在前、降号在后，n 升序；只含 sig/note/piece） */
  keyBars: KeyBar[];
  /** 按训练模式分组条形数据（7 种模式全量，按 TRAIN_MODES 顺序） */
  modeBars: ModeBar[];
}

/** 时间戳 → 本地 YYYY-MM-DD */
export function dateKey(at: number): string {
  const d = new Date(at);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function ratio(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

/**
 * 聚合报表（纯函数，接受 records 输入）。
 * @param records 答题记录
 * @param now     「今天」的参考时间戳（7 日窗口截止日），便于测试
 */
export function aggregate(records: ReadonlyArray<AttemptRecord>, now: number = Date.now()): Aggregates {
  let correct = 0;
  let fast = 0;
  let currentStreak = 0;
  let bestStreak = 0;
  const allReactions: number[] = [];
  const byDay = new Map<string, { count: number; correct: number }>();
  const byKey = new Map<string, { type: SigType; n: number; count: number; correct: number }>();
  const byMode = new Map<string, { count: number; correct: number }>();

  for (const r of records) {
    if (r.ok) {
      correct++;
      currentStreak++;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
    allReactions.push(r.reactionMs);
    if (r.reactionMs <= FAST_MS) fast++;

    const day = dateKey(r.at);
    const d = byDay.get(day) ?? { count: 0, correct: 0 };
    d.count++;
    d.correct += r.ok ? 1 : 0;
    byDay.set(day, d);

    const parts = r.key.split('|');
    const train = parts[0];
    const m = byMode.get(train) ?? { count: 0, correct: 0 };
    m.count++;
    m.correct += r.ok ? 1 : 0;
    byMode.set(train, m);

    if (KEY_BAR_TRAINS.has(train)) {
      const type = (parts[1] === 'fl' ? 'fl' : 'sh') as SigType;
      const n = Number(parts[2]) || 0;
      const kk = `${type}|${n}`;
      const k = byKey.get(kk) ?? { type, n, count: 0, correct: 0 };
      k.count++;
      k.correct += r.ok ? 1 : 0;
      byKey.set(kk, k);
    }
  }

  // 最近 7 日（含今天），升序
  const daily: DailySeries[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = dateKey(now - i * 24 * 60 * 60 * 1000);
    const d = byDay.get(date) ?? { count: 0, correct: 0 };
    daily.push({ date, count: d.count, correct: d.correct, accuracy: ratio(d.correct, d.count) });
  }

  const keyBars: KeyBar[] = [...byKey.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'sh' ? -1 : 1;
    return a.n - b.n;
  }).map((k) => ({ ...k, accuracy: ratio(k.correct, k.count) }));

  const modeBars: ModeBar[] = TRAIN_MODES.map((train) => {
    const m = byMode.get(train) ?? { count: 0, correct: 0 };
    return { train, count: m.count, correct: m.correct, accuracy: ratio(m.correct, m.count) ?? 0 };
  });

  return {
    totalAttempts: records.length,
    totalCorrect: correct,
    accuracy: ratio(correct, records.length),
    medianReactionMs: median(allReactions),
    fastRatio: ratio(fast, records.length),
    currentStreak,
    bestStreak,
    daily,
    keyBars,
    modeBars,
  };
}
