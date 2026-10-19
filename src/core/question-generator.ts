/**
 * 出题引擎：自适应抽题（权重 = 正确率 + 反应 + 陈旧度 + 降号偏置）、
 * 选项生成（易混干扰项）、判题与直读锚点解析。
 * 随机逻辑全部接受可注入 rng，便于测试复现。
 */

import {
  anchorText,
  keyInfo,
  noteInfo,
  MAJ_GRID,
  MIN_GRID,
  WORD,
  type Ask,
  type Clef,
  type SigType,
} from './music-theory';
import { itemKey, type ItemStat, type StatsState, totalSamples } from './stats';
import { findPiece } from '../content/repertoire';

export type TrainMode = 'sig' | 'note' | 'piece';
export type PieceKind = 'listen' | 'read' | 'context';

/** 题目 */
export interface Question {
  id: string;
  train: TrainMode;
  /** 调号类型 */
  type: SigType;
  /** 升/降号个数 0..7 */
  n: number;
  clef: Clef;
  /** 问大调还是小调 */
  ask: Ask;
  /** note 模式目标音位置 0..8（0=第1线 … 8=第5线） */
  step?: number;
  /** piece 模式曲目 id */
  pieceId?: string;
  /** piece 模式玩法：听辨认调 / 看谱认调 / 情境认音 */
  pieceKind?: PieceKind;
  /** 是否来自错题队列 */
  fromReview?: boolean;
  /** 打乱后的作答选项（认调=调名，note 模式=原位/升/降） */
  options: string[];
}

/* ---------- 随机数 ---------- */

/** 随机数发生器（[0,1)），可注入以便测试 */
export type Rng = () => number;

/** mulberry32 固定种子随机数（测试用） */
export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- key 编解码（错题队列用） ---------- */

/** 题目 key：train|type|n|clef|ask|step|pieceId|pieceKind（缺省段留空） */
export function questionKey(q: Question): string {
  return [q.train, q.type, q.n, q.clef, q.ask, q.step ?? '', q.pieceId ?? '', q.pieceKind ?? ''].join('|');
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `q${seq}`;
}

/** 从错题 key 还原题目（fromReview=true，options 重新生成） */
export function questionFromKey(key: string, rng: Rng = Math.random): Question {
  const [train, type, n, clef, ask, step, pieceId, pieceKind] = key.split('|');
  const q: Question = {
    id: nextId(),
    train: train as TrainMode,
    type: type as SigType,
    n: Number(n),
    clef: clef as Clef,
    ask: ask as Ask,
    fromReview: true,
    options: [],
  };
  if (step !== '') q.step = Number(step);
  if (pieceId !== '') q.pieceId = pieceId;
  if (pieceKind !== '') q.pieceKind = pieceKind as PieceKind;
  q.options = buildOptions(q, rng);
  return q;
}

/* ---------- 选项生成 ---------- */

/** note 模式固定选项（判定用 noteInfo().acc） */
export interface NoteChoice {
  /** 调号带来的实际记号 */
  a: 1 | 0 | -1;
  /** 记号字形 */
  g: '♮' | '♯' | '♭';
  /** 文字 */
  t: string;
}

export const NOTE_OPTIONS: readonly NoteChoice[] = [
  { a: 0, g: '♮', t: '原位' },
  { a: 1, g: '♯', t: '升' },
  { a: -1, g: '♭', t: '降' },
];

/** note 模式选项文案（固定顺序） */
export const NOTE_LABELS: readonly string[] = NOTE_OPTIONS.map((o) => o.g + o.t);

/** 认调题正确答案文案（大调 / 小调名） */
export function correctLabelOf(q: Question): string {
  if (q.train === 'note') {
    const want = q.step === undefined ? 0 : noteInfo(q.step, q.type, q.n, q.clef).acc;
    return NOTE_LABELS[NOTE_OPTIONS.findIndex((o) => o.a === want)];
  }
  const info = keyInfo(q.type, q.n);
  return q.ask === 'maj' ? info.maj : info.min;
}

interface ParsedName {
  letter: string;
  /** 1=♯ / -1=♭ / 0=原位 */
  acc: 1 | 0 | -1;
}

function parseName(name: string): ParsedName {
  const letter = name[0].toUpperCase();
  const acc: 1 | 0 | -1 = name.includes('♯') || name.includes('#') ? 1 : name.includes('♭') || name.includes('b') ? -1 : 0;
  return { letter, acc };
}

/** 半音数（用于等音判断） */
function pitchClass(name: string): number {
  const semi: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const p = parseName(name);
  return (((semi[p.letter] ?? 0) + p.acc) % 12 + 12) % 12;
}

/**
 * 易混度：
 * - 同字母且记号相反（C♯↔C♭、A♯↔A♭）→ 4
 * - 同字母一原位一带号（C↔C♯、G↔G♭）→ 3
 * - 等音异名（F♯↔G♭、D♯↔E♭）→ 2
 */
function confusionScore(a: string, b: string): number {
  const pa = parseName(a);
  const pb = parseName(b);
  if (pa.letter === pb.letter) {
    if (pa.acc !== 0 && pb.acc !== 0 && pa.acc !== pb.acc) return 4;
    return 3;
  }
  return pitchClass(a) === pitchClass(b) ? 2 : 0;
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 生成作答选项：
 * - note 模式：固定「原位 / 升 / 降」
 * - 认调（sig/piece）：正确答案 + 3 个干扰项（同为大调或同为小调，优先易混对），打乱返回
 */
export function buildOptions(q: Question, rng: Rng = Math.random): string[] {
  if (q.train === 'note') return [...NOTE_LABELS];
  const correct = correctLabelOf(q);
  const pool = (q.ask === 'maj' ? MAJ_GRID : MIN_GRID).filter((l) => l !== correct);
  const scored = pool
    .map((l) => ({ l, s: confusionScore(correct, l) }))
    .sort((a, b) => b.s - a.s || a.l.localeCompare(b.l));
  const confused = scored.filter((x) => x.s > 0);
  const rest = scored.filter((x) => x.s === 0);
  const picked: string[] = [];
  // 先吃掉易混项，不足 3 个再从其余池随机补齐
  for (const c of confused.slice(0, 3)) picked.push(c.l);
  if (picked.length < 3) {
    picked.push(...shuffle(rest.map((x) => x.l), rng).slice(0, 3 - picked.length));
  }
  return shuffle([correct, ...picked], rng);
}

/* ---------- 判题 ---------- */

export interface CheckResult {
  ok: boolean;
  /** 正确答案文案 */
  correctLabel: string;
  /** 直读锚点解析 */
  explain: string;
}

function normalize(s: string): string {
  return s.trim().replace(/#/g, '♯').replace(/b/g, '♭').toLowerCase();
}

/**
 * 直读锚点解析：
 * - 认调题：直读口诀（anchorText）
 * - 认音题：「第2线 = G，7 个升号里有它 → G♯（C♯ 大调第 5 级）」
 */
export function explainAnswer(q: Question): string {
  if (q.train !== 'note') return anchorText(q.type, q.n, q.ask);
  const info = noteInfo(q.step ?? 0, q.type, q.n, q.clef);
  const sign = info.acc === 1 ? '♯' : info.acc === -1 ? '♭' : '';
  const heard = `${info.letter}${sign}`;
  const where =
    q.n === 0
      ? `无升降号`
      : `${q.n} 个${WORD[q.type]}号里${info.acc === 0 ? '没它' : '有它'}`;
  return `${info.posName} = ${info.letter}，${where} → ${heard}（${keyInfo(q.type, q.n).maj} 大调第 ${info.deg} 级）`;
}

/**
 * 判题。
 * @param answer 认调：选项下标或选项文案；note：选项下标或「♮/♯/♭/原位/升/降」文案
 */
export function checkAnswer(q: Question, answer: number | string): CheckResult {
  const correctLabel = correctLabelOf(q);
  let picked: string | undefined;
  if (typeof answer === 'number') {
    picked = q.options[answer];
  } else {
    const key = normalize(answer);
    picked =
      q.options.find((o) => normalize(o) === key) ??
      (q.train === 'note'
        ? NOTE_LABELS.find((l) => normalize(l) === key || normalize(l.slice(1)) === key)
        : undefined);
  }
  return {
    ok: picked !== undefined && normalize(picked) === normalize(correctLabel),
    correctLabel,
    explain: explainAnswer(q),
  };
}

/* ---------- 自适应抽题 ---------- */

export interface PickConfig {
  /** 训练模式 */
  train: TrainMode;
  /** 谱号池 */
  clefs: Clef[];
  /** 问法池（sig 模式用） */
  asks: Ask[];
  /** 调号类型池，默认 ['sh','fl'] */
  types?: SigType[];
  /** 升降号个数范围，默认 0..7 */
  nMin?: number;
  nMax?: number;
  /** 精确调号池（给了就忽略 types/nMin/nMax，关卡分布用） */
  keys?: ReadonlyArray<{ type: SigType; n: number }>;
  /** note 模式位置池，默认 0..8 */
  steps?: number[];
  /** piece 模式候选曲目 */
  pieceIds?: string[];
  /** piece 模式玩法池，默认全部 */
  pieceKinds?: PieceKind[];
  /** 错题回炉占比，默认 0.27（要求 25%~30%） */
  reviewRatio?: number;
}

export interface PickOptions {
  rng?: Rng;
  /** 「现在」时间戳（陈旧度计算），默认 Date.now() */
  now?: number;
}

/** 陈旧度满分时长：3 天未见按 1 计 */
export const STALE_MS = 3 * 24 * 60 * 60 * 1000;
/** 反应惩罚起点：中位反应 >2s 后线性上升 */
export const REACT_PENALTY_START_MS = 2000;
/** 反应惩罚满分时长（中位反应 5s 封顶） */
export const REACT_PENALTY_SPAN_MS = 3000;
/** 未见过条目的默认 EMA（中性略乐观） */
export const UNSEEN_EMA = 0.65;
/** 降号偏置移除阈值：全体样本 ≥20 后不再加权 */
export const FLAT_BIAS_MIN_SAMPLES = 20;

interface Candidate {
  train: TrainMode;
  type: SigType;
  n: number;
  clef: Clef;
  ask: Ask;
  pieceId?: string;
}

function candidates(cfg: PickConfig): Candidate[] {
  const out: Candidate[] = [];
  if (cfg.train === 'piece') {
    for (const id of cfg.pieceIds ?? []) {
      const p = findPiece(id);
      if (!p) continue;
      for (const clef of cfg.clefs) {
        out.push({ train: 'piece', type: p.type, n: p.n, clef, ask: p.ask, pieceId: p.id });
      }
    }
    return out;
  }
  const sigKeys: Array<{ type: SigType; n: number }> = cfg.keys
    ? cfg.keys.map((k) => ({ type: k.type, n: k.n }))
    : (cfg.types ?? ['sh', 'fl']).flatMap((type) => {
        const nMin = cfg.nMin ?? 0;
        const nMax = cfg.nMax ?? 7;
        return Array.from({ length: nMax - nMin + 1 }, (_, i) => ({ type, n: nMin + i }));
      });
  for (const k of sigKeys) {
    for (const clef of cfg.clefs) {
      for (const ask of cfg.asks) {
        out.push({ train: cfg.train, type: k.type, n: k.n, clef, ask });
      }
    }
  }
  return out;
}

/**
 * 抽题权重：
 * w = 1 + 2.0*(1-emaAcc) + 1.0*reactionPenalty + 1.0*staleness + 0.5*flatBias
 */
export function pickWeight(
  stat: ItemStat | undefined,
  type: SigType,
  samples: number,
  now: number,
): number {
  const ema = stat ? stat.emaAccuracy : UNSEEN_EMA;
  const med = stat ? stat.medianReactionMs : 0;
  const reactionPenalty =
    med > REACT_PENALTY_START_MS
      ? Math.min(1, (med - REACT_PENALTY_START_MS) / REACT_PENALTY_SPAN_MS)
      : 0;
  const staleness = stat
    ? Math.min(1, Math.max(0, now - stat.lastSeenAt) / STALE_MS)
    : 1;
  const flatBias = type === 'fl' && samples < FLAT_BIAS_MIN_SAMPLES ? 1 : 0;
  return 1 + 2.0 * (1 - ema) + 1.0 * reactionPenalty + 1.0 * staleness + 0.5 * flatBias;
}

function weightedPick<T>(items: T[], weights: number[], rng: Rng): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function sameSig(a: { type: SigType; n: number }, b: { type: SigType; n: number }): boolean {
  return a.type === b.type && a.n === b.n;
}

/**
 * 自适应抽题：
 * - 每节 25%~30% 的题从 reviewDue（到期错题）里取，还原时保留原 train/type/n/clef/ask/step
 * - 同一调号与上一题间隔 ≥2 题（无可用候选时放开约束）
 * - 权重见 pickWeight
 */
export function pickQuestion(
  cfg: PickConfig,
  stats: StatsState,
  recent: ReadonlyArray<Question>,
  reviewDue: ReadonlyArray<string>,
  opts: PickOptions = {},
): Question {
  const rng = opts.rng ?? Math.random;
  const now = opts.now ?? Date.now();
  const ratio = Math.min(0.3, Math.max(0.25, cfg.reviewRatio ?? 0.27));

  // 1) 错题回炉
  if (reviewDue.length > 0 && rng() < ratio) {
    const key = reviewDue[Math.floor(rng() * reviewDue.length)];
    return questionFromKey(key, rng);
  }

  // 2) 常规抽题
  const pool = candidates(cfg);
  const lastTwo = recent.slice(-2);
  const spaced = pool.filter((c) => !lastTwo.some((r) => sameSig(c, r)));
  const usable = spaced.length > 0 ? spaced : pool;
  const weights = usable.map((c) => {
    const stat = stats.items[itemKey(c.train, c.type, c.n, c.clef, c.ask)];
    return pickWeight(stat, c.type, totalSamples(stats), now);
  });
  const c = weightedPick(usable, weights, rng);

  const q: Question = {
    id: nextId(),
    train: c.train,
    type: c.type,
    n: c.n,
    clef: c.clef,
    ask: c.ask,
    options: [],
  };
  if (c.train === 'note') {
    const steps = cfg.steps ?? [0, 1, 2, 3, 4, 5, 6, 7, 8];
    q.step = steps[Math.floor(rng() * steps.length)];
  }
  if (c.train === 'piece') {
    q.pieceId = c.pieceId;
    const kinds = cfg.pieceKinds ?? ['listen', 'read', 'context'];
    q.pieceKind = kinds[Math.floor(rng() * kinds.length)];
  }
  q.options = buildOptions(q, rng);
  return q;
}
