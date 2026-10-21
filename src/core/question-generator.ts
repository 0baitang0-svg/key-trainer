/**
 * 出题引擎：自适应抽题（权重 = 正确率 + 反应 + 陈旧度 + 降号偏置）、
 * 选项生成（易混干扰项）、判题与直读锚点解析。
 * 随机逻辑全部接受可注入 rng，便于测试复现。
 */

import {
  anchorText,
  keyInfo,
  FL_MAJ,
  FL_MIN,
  MAJ_GRID,
  MIN_GRID,
  SH_MAJ,
  SH_MIN,
  type Ask,
  type Clef,
  type SigType,
} from './music-theory';
import {
  CHORD_INTERVALS,
  CHORD_NAME_ZH,
  chordPcSet,
  chordSymbol,
  dominantKeys,
  dominantOf,
  noteAbove,
  parseChordSymbol,
  pitchNameToLower,
  pitchNameToString,
  spellChord,
  type ChordQuality,
  type ChordSpec,
  type PitchName,
} from './chord-theory';
import {
  FUNC_ZH,
  degreeNote,
  diatonicChords,
  keyAlterations,
  keyLabel,
  scaleNotes,
  type DiatonicChord,
  type ScaleKind,
} from './scale-theory';
import { itemKey, type ItemStat, type StatsState, totalSamples } from './stats';
import {
  generateSeq,
  seqProfileByCode,
  seqProfileCode,
  seqProfileOf,
  type PlaySeq,
  type SeqProfile,
} from './seq-generator';
import { findPiece } from '../content/repertoire';

export type TrainMode = 'sig' | 'note' | 'piece' | 'func' | 'diatonic' | 'degrees' | 'build';
export type PieceKind = 'listen' | 'read' | 'context';

/** 和弦反应题题型 */
export type QKind =
  | 'dom-key'
  | 'key-dom'
  | 'listen-func' // func
  | 'deg2chord'
  | 'chord2deg'
  | 'chord2func' // diatonic
  | 'key2acc'
  | 'deg2note'
  | 'acc2key' // degrees
  | 'build-notes'
  | 'build-mc'
  | 'notes2quality'; // build

/** 和弦题题目要素（判题与 key 编解码都只依赖它） */
export interface ChordQ {
  kind: QKind;
  tonic?: PitchName;
  scale?: ScaleKind;
  degree?: number;
  /** 目标和弦（build-notes 只给 root+quality 即 chord） */
  chord?: ChordSpec;
  root?: PitchName;
}

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
  /** note 模式目标音位置 0..8（0=第1线 … 8=第5线；三选时代遗留，视奏题回炉兼容用） */
  step?: number;
  /** piece 模式曲目 id */
  pieceId?: string;
  /** piece 模式玩法：听辨认调 / 看谱认调 / 情境认音 */
  pieceKind?: PieceKind;
  /** 视奏串（note 题专用：逐拍判题目标） */
  seq?: PlaySeq;
  /** 视奏串随机种子（进错题 key 第 9 段，同 seed 同 profile 确定性重建同串） */
  seqSeed?: number;
  /** 视奏难度档（进错题 key 第 9 段的 profileCode） */
  seqProfile?: SeqProfile;
  /** 和弦反应题（func / diatonic / degrees / build） */
  cq?: ChordQ;
  /** 作答交互：选项 / 键盘点选 / 键盘拼和弦 */
  answerInput?: 'options' | 'keyboard-tap' | 'keyboard-build';
  /** 是否来自错题队列 */
  fromReview?: boolean;
  /** 打乱后的作答选项（认调=调名；视奏 note 题无选项，返回 []） */
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

/** 和弦题第 9 段：`qkind~tonic~scale~degree~chordSymbol`（`~` 分隔，与现有 `|` 不冲突） */
function chordKeyPart(cq: ChordQ): string {
  return [
    cq.kind,
    cq.tonic ? pitchNameToString(cq.tonic) : '',
    cq.scale ?? '',
    cq.degree !== undefined ? String(cq.degree) : '',
    cq.chord ? chordSymbol(cq.chord) : '',
  ].join('~');
}

/** 音名显示串 → PitchName（'F♯' / 'B♭' / 'C𝄪'） */
function parsePitchName(s: string): PitchName {
  const letter = (s[0] ?? 'C').toUpperCase();
  let acc = 0;
  for (const ch of s.slice(1)) {
    if (ch === '♯') acc += 1;
    else if (ch === '♭') acc -= 1;
    else if (ch === '𝄪') acc += 2;
    else if (ch === '𝄫') acc -= 2;
  }
  return { letter, acc };
}

function parseChordKeyPart(part: string): ChordQ {
  const [kind, tonicStr, scaleStr, degreeStr, chordStr] = part.split('~');
  const cq: ChordQ = { kind: kind as QKind };
  if (tonicStr !== undefined && tonicStr !== '') cq.tonic = parsePitchName(tonicStr);
  if (scaleStr === 'maj' || scaleStr === 'harmMin' || scaleStr === 'melMin') cq.scale = scaleStr;
  if (degreeStr !== undefined && degreeStr !== '') cq.degree = Number(degreeStr);
  if (chordStr !== undefined && chordStr !== '') {
    const chord = parseChordSymbol(chordStr);
    if (chord) {
      cq.chord = chord;
      cq.root = { letter: chord.root.letter, acc: chord.root.acc };
    }
  }
  return cq;
}

/** 作答交互方式（由题型决定，便于 key 还原） */
export function answerInputOf(kind: QKind): 'options' | 'keyboard-tap' | 'keyboard-build' {
  return kind === 'build-notes' ? 'keyboard-build' : 'options';
}

/**
 * 统计条目 key 第 6 段（extra）：题型 + 可选调式（`deg2chord~harmMin`），
 * 带调式的题型记下调式，便于按调式聚合（三调巡游徽章）。
 */
export function chordItemExtra(kind: QKind, scale?: ScaleKind): string {
  return SCALE_KINDS.has(kind) && scale !== undefined ? `${kind}~${scale}` : kind;
}

/**
 * 题目 key：train|type|n|clef|ask|step|pieceId|pieceKind（缺省段留空）；
 * 和弦题追加第 9 段 `qkind~tonic~scale~degree~chordSymbol`；
 * 视奏（note）题追加第 9 段 `play~{seed}~{len}.{span}.{bar}.{acc}.{duo}`。
 */
export function questionKey(q: Question): string {
  const base = [q.train, q.type, q.n, q.clef, q.ask, q.step ?? '', q.pieceId ?? '', q.pieceKind ?? ''].join('|');
  if (q.cq) return `${base}|${chordKeyPart(q.cq)}`;
  const np = noteKeyPart(q);
  return np !== null ? `${base}|${np}` : base;
}

/** note 题第 9 段：`play~{seed}~{profileCode}`（无 seed 的旧题返回 null） */
function noteKeyPart(q: Question): string | null {
  if (q.seqSeed === undefined) return null;
  const code = seqProfileCode(q.seqProfile ?? seqProfileOf(undefined, 0));
  return `play~${q.seqSeed}~${code}`;
}

/** 生成视奏串挂到题目（seed → profile → 同 seed 同 profile 必然同串） */
function attachSeq(q: Question, profile: SeqProfile, seed: number): Question {
  q.seqSeed = seed >>> 0;
  q.seqProfile = profile;
  q.seq = generateSeq({ type: q.type, n: q.n, clef: q.clef, profile, rng: makeRng(q.seqSeed) });
  return q;
}

/** 旧 key 字符串 hash 成 seed（FNV-1a，错题回炉兼容三选时代的 note key） */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `q${seq}`;
}

/** 从错题 key 还原题目（fromReview=true，options 重新生成） */
export function questionFromKey(key: string, rng: Rng = Math.random): Question {
  const [train, type, n, clef, ask, step, pieceId, pieceKind, ninth] = key.split('|');
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
  if (step !== undefined && step !== '') q.step = Number(step);
  if (pieceId !== undefined && pieceId !== '') q.pieceId = pieceId;
  if (pieceKind !== undefined && pieceKind !== '') q.pieceKind = pieceKind as PieceKind;
  if (q.train === 'note') {
    // 视奏题：`play~` 段同 seed 同 profile 确定性重建；旧三选 key（step 段）忽略 step，
    // 用旧 key 字符串 hash 成 seed 重建为 play 题（错题回炉不炸）
    const part = ninth ?? '';
    if (part.startsWith('play~')) {
      const [, seedStr, code] = part.split('~');
      const seed = Number(seedStr);
      attachSeq(q, (code !== undefined ? seqProfileByCode(code) : null) ?? seqProfileOf(undefined, 0), Number.isFinite(seed) ? seed : hashSeed(key));
    } else {
      delete q.step;
      attachSeq(q, seqProfileOf(undefined, 0), hashSeed(key));
    }
  } else if (ninth !== undefined && ninth !== '') {
    q.cq = parseChordKeyPart(ninth);
    q.answerInput = answerInputOf(q.cq.kind);
  }
  q.options = buildOptions(q, rng);
  return q;
}

/* ---------- 选项生成 ---------- */

/** 认调题正确答案文案（大调 / 小调名；视奏题为「弹完即可」） */
export function correctLabelOf(q: Question): string {
  if (q.train === 'note') return '弹完即可';
  if (q.cq !== undefined) return chordCorrectLabel(q.cq);
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
 * - note（视奏）模式：无选项（键盘逐拍作答），返回 []
 * - 认调（sig/piece）：正确答案 + 3 个干扰项（同为大调或同为小调，优先易混对），打乱返回
 */
export function buildOptions(q: Question, rng: Rng = Math.random): string[] {
  if (q.cq !== undefined) return chordOptions(q.cq, rng);
  if (q.train === 'note') return [];
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
 * - 视奏（note）题：串级讲评（逐拍失误详情由 controller.submitSequence 走 seqExplain）
 */
export function explainAnswer(q: Question): string {
  if (q.cq !== undefined) return chordExplain(q.cq);
  if (q.train === 'note') {
    const len = q.seq?.notes.length ?? 0;
    return len > 0 ? `视奏串共 ${len} 拍 · 跟着谱子弹完即可` : '跟着谱子弹完即可';
  }
  return anchorText(q.type, q.n, q.ask);
}

/** 视奏整串作答（controller.submitSequence 产物）：0 错为对 */
export interface SeqAnswer {
  /** 错拍数 */
  errors: number;
}

/**
 * 判题。
 * @param answer 认调：选项下标或选项文案；视奏（note）：{errors} 结构（全串判题在
 *               controller.submitSequence 完成，这里只兜底）；
 *               键盘拼和弦（build-notes）：选中键的 midi 数组（按 pitch class 集合比对）
 */
export function checkAnswer(q: Question, answer: number | string | readonly number[] | SeqAnswer): CheckResult {
  const correctLabel = correctLabelOf(q);
  const explain = explainAnswer(q);
  if (q.train === 'note') {
    let ok = false;
    if (typeof answer === 'string') ok = normalize(answer) === normalize(correctLabel);
    else if (!Array.isArray(answer)) ok = (answer as SeqAnswer).errors === 0;
    return { ok, correctLabel, explain };
  }
  if (typeof answer !== 'string' && typeof answer !== 'number') {
    // 键盘拼和弦：midi 数组按 pitch class 集合比对（SeqAnswer 已在 note 分支消费，此处兜底转数组）
    const want = q.cq?.chord ? chordPcSet(q.cq.chord) : [];
    const midis = Array.isArray(answer) ? answer : [];
    return { ok: want.length > 0 && samePcSet(midis, want), correctLabel, explain };
  }
  if (q.cq !== undefined) {
    let picked: string | undefined;
    if (typeof answer === 'number') {
      picked = q.options[answer];
    } else {
      const key = normalize(answer);
      picked = q.options.find((o) => normalize(o) === key) ?? (normalize(correctLabel) === key ? correctLabel : undefined);
    }
    return { ok: picked !== undefined && normalize(picked) === normalize(correctLabel), correctLabel, explain };
  }
  let picked: string | undefined;
  if (typeof answer === 'number') {
    picked = q.options[answer];
  } else {
    const key = normalize(answer);
    picked = q.options.find((o) => normalize(o) === key);
  }
  return {
    ok: picked !== undefined && normalize(picked) === normalize(correctLabel),
    correctLabel,
    explain,
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
  /** piece 模式候选曲目 */
  pieceIds?: string[];
  /** piece 模式玩法池，默认全部 */
  pieceKinds?: PieceKind[];
  /** chord 模式题型池，默认按 train 取全量 */
  kinds?: QKind[];
  /** chord 模式题型权重（先按权重选题型、再在题型内自适应抽候选），默认等权 */
  kindWeights?: Partial<Record<QKind, number>>;
  /** chord 模式主音 / 根音池，默认常用大调主音集合 */
  tonics?: PitchName[];
  /** chord 模式调式池，默认 ['maj','harmMin','melMin'] */
  scales?: ScaleKind[];
  /** chord 模式级数池（1..7），默认全部 */
  degrees?: number[];
  /** chord 模式目标性质池（build 类用），默认 BUILD_QUALITIES */
  qualities?: ChordQuality[];
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
 * w = 1 + 2.0*(1-emaAcc) + 1.0*reactionPenalty + 1.0*staleness + 0.5*flatBias + 0.3*rareQuality
 * - flatBias 只对 'sig' | 'note' | 'degrees' 生效（不传 train 按旧行为生效）
 * - dim7 / m7b5 冷门性质加 0.3
 */
export function pickWeight(
  stat: ItemStat | undefined,
  type: SigType,
  samples: number,
  now: number,
  train?: TrainMode,
  quality?: ChordQuality,
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
  const flatOk = train === undefined || train === 'sig' || train === 'note' || train === 'degrees';
  const flatBias = flatOk && type === 'fl' && samples < FLAT_BIAS_MIN_SAMPLES ? 1 : 0;
  const rareQuality = quality === 'dim7' || quality === 'm7b5' ? 0.3 : 0;
  return 1 + 2.0 * (1 - ema) + 1.0 * reactionPenalty + 1.0 * staleness + 0.5 * flatBias + rareQuality;
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
  if (isChordTrain(cfg.train)) {
    return pickChordQuestion(cfg, stats, recent, rng, now);
  }
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
    // 视奏串：难度档吃统计（ema/样本 → 5 档 profile），seed 进错题 key 保证回炉同串
    const stat = stats.items[itemKey(c.train, c.type, c.n, c.clef, c.ask)];
    const profile = seqProfileOf(stat?.emaAccuracy, stat?.attempts ?? 0);
    attachSeq(q, profile, Math.floor(rng() * 0xffffffff));
  }
  if (c.train === 'piece') {
    q.pieceId = c.pieceId;
    const kinds = cfg.pieceKinds ?? ['listen', 'read', 'context'];
    q.pieceKind = kinds[Math.floor(rng() * kinds.length)];
  }
  q.options = buildOptions(q, rng);
  return q;
}

/* ---------- 和弦反应题（func / diatonic / degrees / build） ---------- */

/** 各训练模式的题型池 */
export const CHORD_TRAIN_KINDS: Record<'func' | 'diatonic' | 'degrees' | 'build', QKind[]> = {
  func: ['dom-key', 'key-dom', 'listen-func'],
  diatonic: ['deg2chord', 'chord2deg', 'chord2func'],
  degrees: ['key2acc', 'deg2note', 'acc2key'],
  build: ['build-notes', 'build-mc', 'notes2quality'],
};

/** 题型 → 训练模式 */
const KIND_TRAIN: Record<QKind, TrainMode> = {
  'dom-key': 'func',
  'key-dom': 'func',
  'listen-func': 'func',
  deg2chord: 'diatonic',
  chord2deg: 'diatonic',
  chord2func: 'diatonic',
  key2acc: 'degrees',
  deg2note: 'degrees',
  acc2key: 'degrees',
  'build-notes': 'build',
  'build-mc': 'build',
  notes2quality: 'build',
};

/** 需要 tonic+scale 的题型；其余题型只用根音池 */
const SCALE_KINDS: ReadonlySet<QKind> = new Set<QKind>([
  'key-dom',
  'listen-func',
  'deg2chord',
  'chord2deg',
  'chord2func',
  'key2acc',
  'deg2note',
  'acc2key',
]);

/** 根音池：常用大调主音集合（避免重升重降拼写） */
export const CHORD_TONIC_POOL: readonly PitchName[] = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'F', 'B♭', 'E♭', 'A♭'].map(parsePitchName);

/** build / notes2quality 目标性质池（dim7 / m7b5 为冷门性质） */
export const BUILD_QUALITIES: readonly ChordQuality[] = ['maj', 'min', '7', 'm7', 'maj7', 'dim', 'aug', 'm7b5', 'dim7'];

/** 功能三选标签 */
const FUNC_LABELS: readonly string[] = [FUNC_ZH.T, FUNC_ZH.S, FUNC_ZH.D];

/** 音程中文（根音上方半音数 → 名称） */
const INTERVAL_ZH: Record<number, string> = {
  0: '根',
  3: '小三',
  4: '大三',
  6: '减五',
  7: '纯五',
  8: '增五',
  9: '减七',
  10: '小七',
  11: '大七',
};

/** 变化音候选名（key2acc 干扰项池） */
const ACC_UNIVERSE: readonly string[] = [
  'C♯', 'D♯', 'E♯', 'F♯', 'G♯', 'A♯', 'B♯',
  'C♭', 'D♭', 'E♭', 'F♭', 'G♭', 'A♭', 'B♭',
];

function isChordTrain(train: TrainMode): train is 'func' | 'diatonic' | 'degrees' | 'build' {
  return train === 'func' || train === 'diatonic' || train === 'degrees' || train === 'build';
}

function chordOf(cq: ChordQ): ChordSpec {
  if (!cq.chord) throw new RangeError(`题目缺少目标和弦（${cq.kind}）`);
  return cq.chord;
}

function tonicOf(cq: ChordQ): PitchName {
  if (!cq.tonic) throw new RangeError(`题目缺少主音（${cq.kind}）`);
  return cq.tonic;
}

function scaleOf(cq: ChordQ): ScaleKind {
  return cq.scale ?? 'maj';
}

function degreeOf(cq: ChordQ): number {
  return cq.degree ?? 1;
}

/** 该级顺阶三和弦 */
function diatonicAt(cq: ChordQ): DiatonicChord {
  return diatonicChords(tonicOf(cq), scaleOf(cq), 'triad')[degreeOf(cq) - 1];
}

/** 和弦拼名串：'G B D F' */
function chordNoteNames(spec: ChordSpec): string[] {
  return spellChord(spec).map(pitchNameToString);
}

/** 调内被升降的音名集合（按音级序） */
function alteredNamesOf(tonic: PitchName, scale: ScaleKind): string[] {
  return keyAlterations(tonic, scale)
    .filter((a) => a.altered)
    .map((a) => a.note);
}

/** 变化音集合 → 选项文案（空集 = 「无变化音」） */
function altLabel(names: readonly string[]): string {
  return names.length > 0 ? names.join(' ') : '无变化音';
}

/** 从候选里取 n 个不重复、不撞正确项的干扰项（保持候选优先级） */
function pickDistinct(cands: readonly string[], correct: string, n: number, fallback?: () => string | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>([normalize(correct)]);
  const push = (c: string): void => {
    const k = normalize(c);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };
  for (const c of cands) {
    if (out.length >= n) break;
    push(c);
  }
  while (out.length < n && fallback) {
    const c = fallback();
    if (c === undefined) break;
    push(c);
  }
  return out;
}

/** midi → pitch class */
function pcOfMidi(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/** 选中键的 pitch class 集合 == 正确集合（等音不同八度算对，多音/少音/半音错算错） */
function samePcSet(midis: readonly number[], want: readonly number[]): boolean {
  const a = new Set(midis.map(pcOfMidi));
  const b = new Set(want.map(pcOfMidi));
  return a.size === b.size && [...a].every((x) => b.has(x));
}

/* ---------- 正确答案文案 ---------- */

/** 和弦题正确答案文案 */
export function chordCorrectLabel(cq: ChordQ): string {
  switch (cq.kind) {
    case 'dom-key':
      return dominantKeys(chordOf(cq)).map((k) => k.label).join(' / ');
    case 'key-dom':
      return chordSymbol(dominantOf(tonicOf(cq), scaleOf(cq) === 'maj' ? 'maj' : 'min'));
    case 'listen-func':
    case 'chord2func':
      return diatonicAt(cq).funcZh;
    case 'deg2chord':
      return diatonicAt(cq).symbol;
    case 'chord2deg': {
      const d = diatonicAt(cq);
      return `${d.roman} · ${d.funcZh}`;
    }
    case 'key2acc':
      return altLabel(alteredNamesOf(tonicOf(cq), scaleOf(cq)));
    case 'deg2note':
      return pitchNameToString(degreeNote(tonicOf(cq), scaleOf(cq), degreeOf(cq)));
    case 'acc2key':
      return keyLabel(tonicOf(cq), scaleOf(cq));
    case 'build-notes':
    case 'build-mc':
      return chordNoteNames(chordOf(cq)).join(' ');
    case 'notes2quality':
      return CHORD_NAME_ZH[chordOf(cq).quality];
  }
}

/* ---------- 选项生成 ---------- */

function domKeyOptions(cq: ChordQ, rng: Rng): string[] {
  const chord = chordOf(cq);
  const correct = chordCorrectLabel(cq);
  const own = dominantKeys(chord)[0];
  const cands = shuffle(
    CHORD_TONIC_POOL.filter((p) => pitchNameToString(p) !== (own ? pitchNameToString(own.tonic) : '')),
    rng,
  ).map((p) => dominantKeys(dominantOf(p, 'maj')).map((k) => k.label).join(' / '));
  return shuffle([correct, ...pickDistinct(cands, correct, 3)], rng);
}

function keyDomOptions(cq: ChordQ, rng: Rng): string[] {
  const correct = chordCorrectLabel(cq);
  const dom = dominantOf(tonicOf(cq), scaleOf(cq) === 'maj' ? 'maj' : 'min');
  const cands: string[] = [];
  for (const q of ['maj7', 'm7', 'dim'] as ChordQuality[]) {
    cands.push(chordSymbol({ root: dom.root, quality: q }));
  }
  for (const steps of [
    { step: 4, semi: 7 },
    { step: 3, semi: 5 },
  ]) {
    const neighbor = noteAboveSafe(dom.root, steps.step, steps.semi);
    if (neighbor) cands.push(chordSymbol({ root: neighbor, quality: '7' }));
  }
  return shuffle([correct, ...pickDistinct(cands, correct, 3)], rng);
}

/** noteAbove 的安全版（无法拼写返回 null） */
function noteAboveSafe(root: PitchName, letterSteps: number, semi: number): PitchName | null {
  try {
    return noteAbove(root, letterSteps, semi);
  } catch {
    return null;
  }
}

function deg2chordOptions(cq: ChordQ, rng: Rng): string[] {
  const d = diatonicAt(cq);
  const correct = d.symbol;
  const all = diatonicChords(tonicOf(cq), scaleOf(cq), 'triad');
  const cands: string[] = [];
  for (const q of ['maj', 'min', 'dim', 'aug'] as ChordQuality[]) {
    if (q !== d.spec.quality) cands.push(chordSymbol({ root: d.spec.root, quality: q }));
  }
  for (const deg of [(degreeOf(cq) + 5) % 7 + 1, (degreeOf(cq) % 7) + 1]) {
    cands.push(chordSymbol({ root: all[deg - 1].spec.root, quality: d.spec.quality }));
  }
  return shuffle([correct, ...pickDistinct(cands, correct, 3)], rng);
}

function chord2degOptions(cq: ChordQ, rng: Rng): string[] {
  const all = diatonicChords(tonicOf(cq), scaleOf(cq), 'triad');
  const labels = all.map((d) => `${d.roman} · ${d.funcZh}`);
  const correct = labels[degreeOf(cq) - 1];
  // 优先 ii / iii / vi 易混级，再补其余级
  const prefer = [2, 3, 6].filter((deg) => deg !== degreeOf(cq));
  const rest = [1, 4, 5, 7].filter((deg) => deg !== degreeOf(cq));
  const picked = [...prefer, ...rest].slice(0, 3).map((deg) => labels[deg - 1]);
  return shuffle([correct, ...pickDistinct(picked, correct, 3)], rng);
}

function key2accOptions(cq: ChordQ, rng: Rng): string[] {
  const correctNames = alteredNamesOf(tonicOf(cq), scaleOf(cq));
  const correct = altLabel(correctNames);
  const k = correctNames.length;
  const correctLetters = new Set(correctNames.map((s) => s[0]));
  const distinct = ACC_UNIVERSE.filter((u) => !correctNames.includes(u));
  const otherLetters = distinct.filter((u) => !correctLetters.has(u[0]));
  const cands: string[] = [];
  if (k > 0) {
    // 少一个
    cands.push(altLabel(correctNames.slice(0, k - 1)), altLabel(correctNames.slice(1)));
    // 多一个
    for (const u of distinct) cands.push(altLabel([...correctNames, u]));
    // 同数量不同字母
    for (let i = 0; i < 6; i++) cands.push(altLabel(shuffle([...otherLetters], rng).slice(0, k)));
  } else {
    // 全空 → 干扰项取多一个 / 多两个
    for (const u of distinct) cands.push(altLabel([u]));
    for (let i = 0; i < 6; i++) cands.push(altLabel(shuffle([...distinct], rng).slice(0, 2)));
  }
  let round = 0;
  const fallback = (): string | undefined => {
    round++;
    if (round > 40) return undefined;
    return altLabel(shuffle([...ACC_UNIVERSE], rng).slice(0, 1 + (round % 3)));
  };
  return shuffle([correct, ...pickDistinct(cands, correct, 3, fallback)], rng);
}

function deg2noteOptions(cq: ChordQ, rng: Rng): string[] {
  const n = degreeNote(tonicOf(cq), scaleOf(cq), degreeOf(cq));
  const correct = pitchNameToString(n);
  const cands: string[] = [];
  for (const d of [1, -1]) {
    if (Math.abs(n.acc + d) <= 2) cands.push(pitchNameToString({ letter: n.letter, acc: n.acc + d }));
  }
  if (n.acc !== 0) cands.push(pitchNameToString({ letter: n.letter, acc: 0 }));
  const notes = scaleNotes(tonicOf(cq), scaleOf(cq));
  for (const deg of [(degreeOf(cq) + 5) % 7 + 1, (degreeOf(cq) % 7) + 1]) {
    cands.push(pitchNameToString(notes[deg - 1]));
  }
  let round = 0;
  const fallback = (): string | undefined => {
    round++;
    return round > 30 ? undefined : shuffle([...ACC_UNIVERSE], rng)[0];
  };
  return shuffle([correct, ...pickDistinct(cands, correct, 3, fallback)], rng);
}

function acc2keyOptions(cq: ChordQ, rng: Rng): string[] {
  const correct = chordCorrectLabel(cq);
  const count = alteredNamesOf(tonicOf(cq), scaleOf(cq)).length;
  const keys: Array<{ tonic: PitchName; scale: ScaleKind }> = [];
  for (const p of CHORD_TONIC_POOL) for (const s of ['harmMin', 'melMin'] as ScaleKind[]) keys.push({ tonic: p, scale: s });
  const labels = keys.map((k) => keyLabel(k.tonic, k.scale));
  const sameCount = shuffle(
    keys.filter((k) => alteredNamesOf(k.tonic, k.scale).length === count).map((k) => keyLabel(k.tonic, k.scale)),
    rng,
  );
  const cands = [...sameCount, ...labels];
  return shuffle([correct, ...pickDistinct(cands, correct, 3)], rng);
}

function buildMcOptions(cq: ChordQ, rng: Rng): string[] {
  const spec = chordOf(cq);
  const parts = spellChord(spec);
  const names = chordNoteNames(spec);
  const correct = names.join(' ');
  const cands: string[] = [];
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  for (let i = 0; i < parts.length; i++) {
    for (const d of [1, -1]) {
      if (Math.abs(parts[i].acc + d) > 2) continue;
      const shifted = [...names];
      shifted[i] = pitchNameToString({ letter: parts[i].letter, acc: parts[i].acc + d });
      cands.push(shifted.join(' '));
    }
    const li = letters.indexOf(parts[i].letter);
    const swapped = [...names];
    swapped[i] = pitchNameToString({ letter: letters[(li + 1) % 7], acc: parts[i].acc });
    cands.push(swapped.join(' '));
  }
  return shuffle([correct, ...pickDistinct(cands, correct, 3)], rng);
}

function notesQualityOptions(cq: ChordQ, rng: Rng): string[] {
  const correct = chordCorrectLabel(cq);
  const cands = BUILD_QUALITIES.filter((q) => q !== chordOf(cq).quality).map((q) => CHORD_NAME_ZH[q]);
  return shuffle([correct, ...pickDistinct(cands, correct, 3)], rng);
}

function chordOptions(cq: ChordQ, rng: Rng): string[] {
  switch (cq.kind) {
    case 'dom-key':
      return domKeyOptions(cq, rng);
    case 'key-dom':
      return keyDomOptions(cq, rng);
    case 'listen-func':
    case 'chord2func':
      return shuffle([...FUNC_LABELS], rng);
    case 'deg2chord':
      return deg2chordOptions(cq, rng);
    case 'chord2deg':
      return chord2degOptions(cq, rng);
    case 'key2acc':
      return key2accOptions(cq, rng);
    case 'deg2note':
      return deg2noteOptions(cq, rng);
    case 'acc2key':
      return acc2keyOptions(cq, rng);
    case 'build-notes':
      return [];
    case 'build-mc':
      return buildMcOptions(cq, rng);
    case 'notes2quality':
      return notesQualityOptions(cq, rng);
  }
}

/* ---------- 直读锚点 ---------- */

/** 和弦题直读锚点（结合 tonic / scale / degree / chord 具体值，一句话直读） */
export function chordExplain(cq: ChordQ): string {
  switch (cq.kind) {
    case 'dom-key': {
      const chord = chordOf(cq);
      const keys = dominantKeys(chord);
      return `${chordSymbol(chord)} = ${chordNoteNames(chord).join(' ')}；属七根音 = 主音上方纯五度 → ${keys
        .map((k) => k.label)
        .join('与 ')}的 V7（同名大小调共用属七）`;
    }
    case 'key-dom': {
      const dom = dominantOf(tonicOf(cq), scaleOf(cq) === 'maj' ? 'maj' : 'min');
      return `${keyLabel(tonicOf(cq), scaleOf(cq))}的属七 = 主音上行纯五度 ${pitchNameToString(dom.root)} 为根 → ${chordSymbol(dom)}`;
    }
    case 'listen-func': {
      const d = diatonicAt(cq);
      return `${d.symbol} = ${keyLabel(tonicOf(cq), scaleOf(cq))}第 ${degreeOf(cq)} 级顺阶和弦 → ${d.funcZh}`;
    }
    case 'deg2chord': {
      const d = diatonicAt(cq);
      return `${keyLabel(tonicOf(cq), scaleOf(cq))}第 ${degreeOf(cq)} 级顺阶和弦 = 根 ${pitchNameToString(d.spec.root)} → ${d.symbol}`;
    }
    case 'chord2deg':
    case 'chord2func': {
      const d = diatonicAt(cq);
      return `${d.symbol} = ${keyLabel(tonicOf(cq), scaleOf(cq))}第 ${degreeOf(cq)} 级（${d.roman}）→ ${d.funcZh}`;
    }
    case 'key2acc': {
      const alts = keyAlterations(tonicOf(cq), scaleOf(cq)).filter((a) => a.altered);
      return alts.length === 0
        ? `${keyLabel(tonicOf(cq), scaleOf(cq))}：与${scaleOf(cq) === 'maj' ? '自然大调' : '自然小调'}逐音一致 → 无变化音`
        : `${keyLabel(tonicOf(cq), scaleOf(cq))}：第 ${alts.map((a) => a.degree).join('、')} 级变化 → 变化音 ${alts
            .map((a) => a.note)
            .join(' ')}`;
    }
    case 'deg2note':
      return `${keyLabel(tonicOf(cq), scaleOf(cq))}第 ${degreeOf(cq)} 级 = ${pitchNameToString(
        degreeNote(tonicOf(cq), scaleOf(cq), degreeOf(cq)),
      )}（音阶 ${scaleNotes(tonicOf(cq), scaleOf(cq))
        .map((s) => pitchNameToString(s))
        .join(' ')}）`;
    case 'acc2key': {
      const names = alteredNamesOf(tonicOf(cq), scaleOf(cq));
      return `变化音 ${names.join(' ')} → ${keyLabel(tonicOf(cq), scaleOf(cq))}（${names.length} 个变化音）`;
    }
    case 'build-notes':
    case 'build-mc': {
      const chord = chordOf(cq);
      const names = chordNoteNames(chord);
      const chain = CHORD_INTERVALS[chord.quality]
        .map((iv, i) => `${i === 0 ? '根' : INTERVAL_ZH[iv.semi] ?? '音'} ${names[i]}`)
        .join(' → ');
      return `${chordSymbol(chord)}：${chain}`;
    }
    case 'notes2quality': {
      const chord = chordOf(cq);
      return `${chordNoteNames(chord).join(' ')} = ${chordSymbol(chord)} 的组成音 → ${CHORD_NAME_ZH[chord.quality]}`;
    }
  }
}

/* ---------- 和弦题出题 ---------- */

interface ChordCand {
  kind: QKind;
  tonic: PitchName;
  scale: ScaleKind;
  /** build 类目标性质 */
  quality?: ChordQuality;
}

function chordCandidates(cfg: PickConfig): ChordCand[] {
  const kinds = cfg.kinds ?? (isChordTrain(cfg.train) ? CHORD_TRAIN_KINDS[cfg.train] : []);
  const tonics = cfg.tonics ?? CHORD_TONIC_POOL;
  const scalesAll = cfg.scales ?? (['maj', 'harmMin', 'melMin'] as ScaleKind[]);
  const out: ChordCand[] = [];
  for (const kind of kinds) {
    const scales: ScaleKind[] = !SCALE_KINDS.has(kind)
      ? ['maj']
      : kind === 'acc2key'
        ? scalesAll.filter((s) => s !== 'maj')
        : [...scalesAll];
    const useScales = scales.length > 0 ? scales : (['harmMin', 'melMin'] as ScaleKind[]);
    for (const tonic of tonics) {
      for (const scale of useScales) {
        if (kind === 'build-notes' || kind === 'build-mc' || kind === 'notes2quality') {
          for (const quality of cfg.qualities ?? BUILD_QUALITIES) out.push({ kind, tonic, scale, quality });
        } else {
          out.push({ kind, tonic, scale });
        }
      }
    }
  }
  return out;
}

/** 和弦拼写是否不出现重升重降（|acc| ≤ 1） */
function spellableChord(spec: ChordSpec): boolean {
  try {
    return spellChord(spec).every((p) => Math.abs(p.acc) <= 1);
  } catch {
    return false;
  }
}

/** build / func 涉及拼写可能出重升重降的候选直接排除（重抽根音） */
function candSpellable(c: ChordCand): boolean {
  switch (c.kind) {
    case 'dom-key':
      return spellableChord({ root: c.tonic, quality: '7' });
    case 'build-notes':
    case 'build-mc':
    case 'notes2quality':
      return spellableChord({ root: c.tonic, quality: c.quality ?? 'maj' });
    case 'key-dom':
      return spellableChord(dominantOf(c.tonic, c.scale === 'maj' ? 'maj' : 'min'));
    case 'listen-func':
      return diatonicChords(c.tonic, c.scale, 'triad').every((d) => spellableChord(d.spec));
    default:
      return true;
  }
}

/** 主音 + 调式 → 调号（查常用调号表，查不到按 0♯♭） */
function keySigOf(tonic: PitchName, scale: ScaleKind): { type: SigType; n: number } {
  const maj = scale === 'maj';
  const name = maj ? pitchNameToString(tonic) : pitchNameToLower(tonic);
  const sh = (maj ? SH_MAJ : SH_MIN).indexOf(name);
  if (sh >= 0) return { type: 'sh', n: sh };
  const fl = (maj ? FL_MAJ : FL_MIN).indexOf(name);
  if (fl >= 0) return { type: 'fl', n: fl };
  return { type: 'sh', n: 0 };
}

function sigOfCand(c: ChordCand): { type: SigType; n: number; ask: Ask } {
  if (!SCALE_KINDS.has(c.kind)) {
    const tonic = c.kind === 'dom-key' ? dominantKeys({ root: c.tonic, quality: '7' })[0].tonic : c.tonic;
    return { ...keySigOf(tonic, 'maj'), ask: 'maj' };
  }
  return { ...keySigOf(c.tonic, c.scale), ask: c.scale === 'maj' ? 'maj' : 'min' };
}

/** 间距前缀：train|kind|主音 */
function chordPrefix(train: TrainMode, c: ChordCand): string {
  return `${train}|${c.kind}|${pitchNameToString(c.tonic)}`;
}

function chordPrefixOf(q: Question): string | null {
  if (!q.cq) return null;
  const t = q.cq.tonic ?? q.cq.root ?? q.cq.chord?.root;
  return t ? `${q.train}|${q.cq.kind}|${pitchNameToString(t)}` : null;
}

/** 候选 → 和弦题（级数随机，选项由 cq 纯函数重建） */
function buildChordQuestion(cfg: PickConfig, cand: ChordCand, rng: Rng): Question {
  const degrees = cfg.degrees ?? [1, 2, 3, 4, 5, 6, 7];
  const cq: ChordQ = { kind: cand.kind };
  if (SCALE_KINDS.has(cand.kind)) {
    cq.tonic = { letter: cand.tonic.letter, acc: cand.tonic.acc };
    cq.scale = cand.scale;
  }
  const pickDegree = (pool: number[]): number => pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  switch (cand.kind) {
    case 'dom-key':
    case 'build-notes':
    case 'build-mc':
    case 'notes2quality': {
      const quality: ChordQuality = cand.kind === 'dom-key' ? '7' : cand.quality ?? 'maj';
      cq.chord = { root: { letter: cand.tonic.letter, acc: cand.tonic.acc }, quality };
      cq.root = { letter: cand.tonic.letter, acc: cand.tonic.acc };
      break;
    }
    case 'listen-func': {
      const okDegs = degrees.filter((d) => spellableChord(diatonicChords(cand.tonic, cand.scale, 'triad')[d - 1].spec));
      cq.degree = pickDegree(okDegs.length > 0 ? okDegs : degrees);
      cq.chord = diatonicChords(cand.tonic, cand.scale, 'triad')[cq.degree - 1].spec;
      cq.root = { letter: cq.chord.root.letter, acc: cq.chord.root.acc };
      break;
    }
    case 'deg2chord':
    case 'chord2deg':
    case 'chord2func': {
      cq.degree = pickDegree(degrees);
      cq.chord = diatonicChords(cand.tonic, cand.scale, 'triad')[cq.degree - 1].spec;
      cq.root = { letter: cq.chord.root.letter, acc: cq.chord.root.acc };
      break;
    }
    case 'deg2note': {
      cq.degree = pickDegree(degrees);
      break;
    }
    default:
      break; // key-dom / key2acc / acc2key 只用 tonic+scale
  }
  const { type, n, ask } = sigOfCand(cand);
  const q: Question = {
    id: nextId(),
    train: KIND_TRAIN[cand.kind],
    type,
    n,
    clef: cfg.clefs[0] ?? 'treble',
    ask,
    cq,
    answerInput: answerInputOf(cand.kind),
    options: [],
  };
  q.options = buildOptions(q, rng);
  return q;
}

/** 和弦题自适应抽题：先按题型权重选题型（默认等权），再在题型内自适应抽候选；
 *  同 train|kind|主音 前缀间隔 ≥2 题 */
function pickChordQuestion(
  cfg: PickConfig,
  stats: StatsState,
  recent: ReadonlyArray<Question>,
  rng: Rng,
  now: number,
): Question {
  const all = chordCandidates(cfg);
  const spellable = all.filter(candSpellable);
  const base = spellable.length > 0 ? spellable : all;
  const recentPrefixes = recent.slice(-2).map(chordPrefixOf);
  const spaced = base.filter((c) => !recentPrefixes.includes(chordPrefix(KIND_TRAIN[c.kind], c)));
  const usable = spaced.length > 0 ? spaced : base;
  const clef = cfg.clefs[0] ?? 'treble';
  const byKind = new Map<QKind, ChordCand[]>();
  for (const c of usable) {
    const group = byKind.get(c.kind);
    if (group) group.push(c);
    else byKind.set(c.kind, [c]);
  }
  const kinds = [...byKind.keys()];
  const kind = weightedPick(
    kinds,
    kinds.map((k) => cfg.kindWeights?.[k] ?? 1),
    rng,
  );
  const group = byKind.get(kind) ?? usable;
  const weights = group.map((c) => {
    const train = KIND_TRAIN[c.kind];
    const { type, n, ask } = sigOfCand(c);
    const stat = stats.items[itemKey(train, type, n, clef, ask, chordItemExtra(c.kind, c.scale))];
    return pickWeight(stat, type, totalSamples(stats), now, train, c.quality);
  });
  return buildChordQuestion(cfg, weightedPick(group, weights, rng), rng);
}
