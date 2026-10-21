/**
 * 状态层：应用状态（配置 / 统计 / 错题队列 / 经验 / 关卡进度 / 徽章 / 打卡 / 已读微课卡），
 * schemaVersion=2，兼容旧网页版 kst_v1 / kst_v1_cfg 的 localStorage JSON 导入迁移。
 * 持久化通过注入的 StorageAdapter（get/set 异步），不直接依赖 Capacitor。
 */

import type { Ask, Clef } from './music-theory';
import type { TrainMode } from './question-generator';
import {
  buildStats,
  emptyItemStat,
  type AttemptRecord,
  type ItemStat,
  type StatsState,
} from './stats';
import type { ReviewItem, ReviewQueue } from './scheduler';

export const SCHEMA_VERSION = 2;
/** 本地存储 key（旧版 kst_v1 / kst_v1_cfg 由此升级） */
export const STORAGE_KEY = 'kst_v2';

export interface AppConfig {
  clef: Clef;
  ask: Ask;
  train: TrainMode;
  /** 音效开关 */
  sound: boolean;
  /** 音量 0..1 */
  volume: number;
  /** 大字号模式 */
  bigFont: boolean;
  /** 首遇微课卡开关（关闭后不再弹任何微课卡） */
  showRuleCards: boolean;
  /** 主题：深色玻璃 / 浅色玻璃 */
  theme: 'dark' | 'light';
}

/** 关卡进度 */
export interface LevelProgress {
  /** 已通关关卡 id */
  passed: string[];
  /** 关卡 id → 星级 0..3 */
  stars: Record<string, number>;
}

/** 打卡（每周允许 1 次补卡） */
export interface StreakState {
  /** 普通打卡日期（YYYY-MM-DD） */
  dates: string[];
  /** 补卡日期（YYYY-MM-DD） */
  makeupDates: string[];
}

export interface AppState {
  schemaVersion: typeof SCHEMA_VERSION;
  config: AppConfig;
  stats: StatsState;
  review: ReviewQueue;
  /** 经验值 */
  xp: number;
  levelProgress: LevelProgress;
  /** 已解锁徽章 id */
  badges: string[];
  streak: StreakState;
  /** 首遇微课卡 id（见过即不再弹） */
  seenKeys: string[];
  /** 是否已完成新手引导 */
  onboarded: boolean;
  /** 已展示过的一次性引导 / 提示标记 */
  seenFlags: string[];
}

export function defaultConfig(): AppConfig {
  return {
    clef: 'treble',
    ask: 'maj',
    train: 'sig',
    sound: true,
    volume: 0.8,
    bigFont: false,
    showRuleCards: true,
    theme: 'dark',
  };
}

export function createInitialState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    config: defaultConfig(),
    stats: { items: {}, records: [] },
    review: [],
    xp: 0,
    levelProgress: { passed: [], stars: {} },
    badges: [],
    streak: { dates: [], makeupDates: [] },
    seenKeys: [],
    onboarded: false,
    seenFlags: [],
  };
}

/* ---------- 通用读取助手（v1 字段名兼容） ---------- */

type Dict = Record<string, unknown>;

function asDict(v: unknown): Dict {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Dict) : {};
}

function pick(o: Dict, keys: readonly string[]): unknown {
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null) return o[k];
  }
  return undefined;
}

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (/^(on|true|1|开)$/i.test(v)) return true;
    if (/^(off|false|0|关)$/i.test(v)) return false;
  }
  return fallback;
}

function asNum(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function asStr(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function asStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function normalizeClef(v: unknown): Clef {
  const s = asStr(v, '').toLowerCase();
  if (s === 'treble' || s === 'g' || s === '高音') return 'treble';
  if (s === 'bass' || s === 'f' || s === '低音') return 'bass';
  return 'treble';
}

function normalizeAsk(v: unknown): Ask {
  const s = asStr(v, '').toLowerCase();
  if (s === 'min' || s === 'minor' || s === '小调') return 'min';
  return 'maj';
}

function normalizeTrain(v: unknown): TrainMode {
  const s = asStr(v, '').toLowerCase();
  if (s === 'note' || s === '视奏' || s === '认音') return 'note';
  if (s === 'piece' || s === '曲目' || s === 'song') return 'piece';
  return 'sig';
}

function normalizeTheme(v: unknown): 'dark' | 'light' {
  const s = asStr(v, '').toLowerCase();
  if (s === 'light' || s === '浅' || s === '浅色') return 'light';
  return 'dark';
}

function normalizeConfig(o: Dict): AppConfig {
  const d = defaultConfig();
  const soundRaw = pick(o, ['sound', 'soundOn', 'audio']);
  const muteRaw = pick(o, ['mute', 'muted']);
  const volRaw = pick(o, ['volume', 'vol']);
  return {
    clef: normalizeClef(pick(o, ['clef'])),
    ask: normalizeAsk(pick(o, ['ask', 'mode', 'keyMode'])),
    train: normalizeTrain(pick(o, ['train', 'trainMode', 'drill'])),
    sound: soundRaw !== undefined ? asBool(soundRaw, d.sound) : !asBool(muteRaw, false),
    volume: clamp(asNum(volRaw, d.volume * 100) > 1 ? asNum(volRaw, d.volume * 100) / 100 : asNum(volRaw, d.volume), 0, 1),
    bigFont: asBool(pick(o, ['bigFont', 'big', 'largeFont']), d.bigFont),
    showRuleCards: asBool(pick(o, ['showRuleCards', 'ruleCards', 'showCards']), d.showRuleCards),
    theme: normalizeTheme(pick(o, ['theme', 'themeMode', 'appearance'])),
  };
}

function normalizeItem(o: Dict): ItemStat {
  const base = emptyItemStat();
  const samplesRaw = pick(o, ['reactionSamples', 'samples', 'recent', 'rts']);
  const samples = Array.isArray(samplesRaw) ? samplesRaw.map((x) => asNum(x, 0)) : base.reactionSamples;
  return {
    attempts: asNum(pick(o, ['attempts', 'a', 'tries', 'total']), base.attempts),
    correct: asNum(pick(o, ['correct', 'c', 'right', 'ok']), base.correct),
    emaAccuracy: asNum(pick(o, ['emaAccuracy', 'ema', 'acc']), base.emaAccuracy),
    medianReactionMs: asNum(pick(o, ['medianReactionMs', 'med', 'median']), base.medianReactionMs),
    p90ReactionMs: asNum(pick(o, ['p90ReactionMs', 'p90']), base.p90ReactionMs),
    reactionSamples: samples.slice(-30),
    consecCorrect: asNum(pick(o, ['consecCorrect', 'consec', 'streak']), base.consecCorrect),
    lastSeenAt: asNum(pick(o, ['lastSeenAt', 'last', 'seenAt', 'lastSeen']), base.lastSeenAt),
  };
}

function normalizeRecord(o: Dict): AttemptRecord | null {
  const key = asStr(pick(o, ['key', 'k']), '');
  if (key === '') return null;
  return {
    key,
    ok: asBool(pick(o, ['ok', 'right', 'correct']), false),
    reactionMs: asNum(pick(o, ['reactionMs', 'rt', 'ms', 'reaction']), 0),
    at: asNum(pick(o, ['at', 'time', 'ts', 'timestamp']), 0),
  };
}

function normalizeStats(o: Dict): StatsState {
  const recordsRaw = pick(o, ['records', 'history', 'log']);
  const records: AttemptRecord[] = [];
  if (Array.isArray(recordsRaw)) {
    for (const r of recordsRaw) {
      const rec = normalizeRecord(asDict(r));
      if (rec) records.push(rec);
    }
  }

  // 条目来源：items/stats/byKey 包装，或旧版「key → 条目」直接平铺
  let itemsRaw = asDict(pick(o, ['items', 'stats', 'byKey']));
  if (Object.keys(itemsRaw).length === 0) {
    const direct: Dict = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === 'records' || k === 'history' || k === 'log') continue;
      if (v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) direct[k] = v;
    }
    itemsRaw = direct;
  }

  if (Object.keys(itemsRaw).length === 0) {
    // 没有条目就从记录全量重建
    return buildStats(records);
  }
  const items: Record<string, ItemStat> = {};
  for (const [k, v] of Object.entries(itemsRaw)) items[k] = normalizeItem(asDict(v));
  return { items, records };
}

function normalizeReview(v: unknown): ReviewQueue {
  if (!Array.isArray(v)) return [];
  const out: ReviewQueue = [];
  for (const raw of v) {
    if (typeof raw === 'string') {
      out.push({
        questionKey: raw,
        box: 0,
        enqueuedAt: 0,
        updatedAt: 0,
        wrongCount: 1,
        rightCount: 0,
        baseCount: 0,
        dueAt: null,
      });
      continue;
    }
    const o = asDict(raw);
    const questionKey = asStr(pick(o, ['questionKey', 'key', 'q']), '');
    if (questionKey === '') continue;
    const item: ReviewItem = {
      questionKey,
      box: clamp(Math.round(asNum(pick(o, ['box']), 0)), 0, 6),
      enqueuedAt: asNum(pick(o, ['enqueuedAt', 'at']), 0),
      updatedAt: asNum(pick(o, ['updatedAt', 'updated']), 0),
      wrongCount: asNum(pick(o, ['wrongCount', 'wrongs']), 0),
      rightCount: asNum(pick(o, ['rightCount', 'rights']), 0),
      baseCount: pick(o, ['baseCount']) === undefined ? null : asNum(pick(o, ['baseCount']), 0),
      dueAt: pick(o, ['dueAt']) === undefined || pick(o, ['dueAt']) === null ? null : asNum(pick(o, ['dueAt']), 0),
    };
    out.push(item);
  }
  return out;
}

function normalizeLevelProgress(v: unknown): LevelProgress {
  const o = asDict(v);
  const starsRaw = asDict(pick(o, ['stars', 'levelStars']));
  const stars: Record<string, number> = {};
  for (const [k, val] of Object.entries(starsRaw)) stars[k] = clamp(Math.round(asNum(val, 0)), 0, 3);
  return {
    passed: asStrArray(pick(o, ['passed', 'passedLevels', 'cleared'])),
    stars,
  };
}

function normalizeStreak(v: unknown): StreakState {
  if (Array.isArray(v)) return { dates: asStrArray(v), makeupDates: [] };
  const o = asDict(v);
  return {
    dates: asStrArray(pick(o, ['dates', 'days', 'checkins'])),
    makeupDates: asStrArray(pick(o, ['makeupDates', 'makeups', 'patches'])),
  };
}

/* ---------- 迁移 ---------- */

/**
 * 迁移到 schemaVersion=2：
 * - 已是 v2：补齐缺省字段
 * - v1（旧网页版 kst_v1 / kst_v1_cfg，可整体或按 cfg/data 合并传入）：兼容旧字段名，缺的新字段给默认值
 */
export function migrate(raw: unknown): AppState {
  let obj: unknown = raw;
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      throw new Error('导入失败：不是合法的 JSON 字符串');
    }
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return createInitialState();

  const o = asDict(obj);
  const cfgSource = asDict(pick(o, ['cfg', 'config']) ?? o);
  const dataSource = asDict(pick(o, ['data', 'state']) ?? o);

  const statsSource = asDict(pick(dataSource, ['stats', 'stat', 'items']) ?? pick(o, ['stats', 'stat']) ?? {});
  const levelSource = pick(dataSource, ['levelProgress', 'levels', 'level']) ?? pick(o, ['levelProgress', 'levels']);

  // 记录可能平铺在 data 顶层（旧版），嵌套在 stats.records 时不覆盖
  const statsInput: Dict = { ...statsSource };
  const topRecords = pick(dataSource, ['records', 'history', 'log']) ?? pick(o, ['records']);
  if (topRecords !== undefined && statsInput.records === undefined) statsInput.records = topRecords;

  return {
    schemaVersion: SCHEMA_VERSION,
    config: normalizeConfig(cfgSource),
    stats: normalizeStats(statsInput),
    review: normalizeReview(pick(dataSource, ['review', 'queue', 'wrongQueue', 'wrong']) ?? pick(o, ['review'])),
    xp: asNum(pick(dataSource, ['xp', 'exp', 'score', 'points']) ?? pick(o, ['xp']), 0),
    levelProgress: normalizeLevelProgress(levelSource),
    badges: asStrArray(
      pick(dataSource, ['badges', 'medals', 'achievements']) ?? pick(o, ['badges']) ?? [],
    ),
    streak: normalizeStreak(pick(dataSource, ['streak', 'checkin', '打卡']) ?? pick(o, ['streak'])),
    seenKeys: asStrArray(pick(dataSource, ['seenKeys', 'seen', 'seenCards']) ?? pick(o, ['seenKeys'])),
    onboarded: asBool(pick(dataSource, ['onboarded', 'onboard']) ?? pick(o, ['onboarded']), false),
    seenFlags: asStrArray(pick(dataSource, ['seenFlags', 'flags']) ?? pick(o, ['seenFlags'])),
  };
}

/** 导出 JSON（与 importJSON 往返一致） */
export function exportJSON(state: AppState): string {
  return JSON.stringify(state);
}

/** 导入 JSON（v1 会自动迁移） */
export function importJSON(str: string): AppState {
  return migrate(str);
}

/* ---------- 持久化 ---------- */

export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/** web 用 localStorage 适配器（无 localStorage 环境退化为无操作） */
export const localStorageAdapter: StorageAdapter = {
  async get(key: string): Promise<string | null> {
    const ls = globalThis.localStorage;
    return ls ? ls.getItem(key) : null;
  },
  async set(key: string, value: string): Promise<void> {
    const ls = globalThis.localStorage;
    if (ls) ls.setItem(key, value);
  },
};

/** 旧网页版存储 key：数据 + 配置分开存 */
export const LEGACY_DATA_KEY = 'kst_v1';
export const LEGACY_CFG_KEY = 'kst_v1_cfg';

function parseMaybe(raw: string | null): unknown {
  if (raw === null) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * 读取（无数据 / 旧数据都走 migrate）：
 * 新 key 无内容时自动回退读取旧版 kst_v1_cfg + kst_v1 并合并迁移。
 */
export async function loadState(adapter: StorageAdapter, key: string = STORAGE_KEY): Promise<AppState> {
  const raw = await adapter.get(key);
  if (raw !== null) {
    try {
      return migrate(raw);
    } catch {
      return createInitialState();
    }
  }
  try {
    const cfg = await adapter.get(LEGACY_CFG_KEY);
    const data = await adapter.get(LEGACY_DATA_KEY);
    if (cfg === null && data === null) return createInitialState();
    return migrate({ cfg: parseMaybe(cfg), data: parseMaybe(data) });
  } catch {
    return createInitialState();
  }
}

/** 写入 */
export async function saveState(adapter: StorageAdapter, state: AppState, key: string = STORAGE_KEY): Promise<void> {
  await adapter.set(key, exportJSON(state));
}

/* ---------- 经验 / 等级 ---------- */

/** 每级所需经验 */
export const XP_PER_LEVEL = 100;

/** 由经验推等级（1 起） */
export function levelFromXp(xp: number): number {
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
}

/** 加经验（纯函数） */
export function addXp(state: AppState, amount: number): AppState {
  return { ...state, xp: Math.max(0, state.xp + Math.round(amount)) };
}

/* ---------- 打卡 ---------- */

/** 打卡（幂等） */
export function checkIn(state: AppState, date: string): AppState {
  if (state.streak.dates.includes(date)) return state;
  return {
    ...state,
    streak: { ...state.streak, dates: [...state.streak.dates, date].sort() },
  };
}

/** 该日期所在周（周一为起点）的周标识，如 2026-W42 */
function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const day = (d.getDay() + 6) % 7; // 周一=0
  const monday = new Date(d.getTime() - day * 24 * 60 * 60 * 1000);
  const year = monday.getFullYear();
  const first = new Date(year, 0, 1);
  const week = Math.floor((monday.getTime() - first.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${year}-W${week}`;
}

/** 补卡（每周限 1 次；已打卡或本周已补过返回 null） */
export function makeupCheckIn(state: AppState, date: string): AppState | null {
  if (state.streak.dates.includes(date) || state.streak.makeupDates.includes(date)) return null;
  const week = weekKey(date);
  const used = state.streak.makeupDates.filter((d) => weekKey(d) === week).length;
  if (used >= 1) return null;
  return {
    ...state,
    streak: { ...state.streak, makeupDates: [...state.streak.makeupDates, date].sort() },
  };
}

/**
 * 连续打卡天数（含补卡）：从今天（或昨天）往前数。
 * @param today 今天（YYYY-MM-DD），默认按系统时间
 */
export function streakDays(streak: StreakState, today: string): number {
  const days = new Set([...streak.dates, ...streak.makeupDates]);
  const toKey = (offset: number): string => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - offset);
    return dateKeyOf(d);
  };
  let start = days.has(toKey(0)) ? 0 : 1;
  if (!days.has(toKey(start))) return 0;
  let count = 0;
  while (days.has(toKey(start + count))) count++;
  return count;
}

function dateKeyOf(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/* ---------- 首遇微课卡 ---------- */

/** 标记微课卡已读（幂等） */
export function markSeen(state: AppState, cardId: string): AppState {
  if (state.seenKeys.includes(cardId)) return state;
  return { ...state, seenKeys: [...state.seenKeys, cardId] };
}

/* ---------- 一次性引导 / 提示标记 ---------- */

/** 该引导标记是否已展示过 */
export function hasSeenFlag(state: AppState, flag: string): boolean {
  return state.seenFlags.includes(flag);
}

/** 标记引导 / 提示已展示（幂等：重复标记返回原状态） */
export function markFlagSeen(state: AppState, flag: string): AppState {
  if (state.seenFlags.includes(flag)) return state;
  return { ...state, seenFlags: [...state.seenFlags, flag] };
}
