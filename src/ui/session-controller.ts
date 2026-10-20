/**
 * 会话编排与控制：把每日计划 / 自由练习 / 关卡翻成一串训练块（SessionBlock），
 * 再以状态机驱动「出题 → 作答 → 记录 → 下一题」，产出结课摘要。
 * 只调用 core 层纯函数与 AppContext，不直接碰 DOM。
 */

import type { AppState } from '../core/store';
import { addXp, checkIn } from '../core/store';
import type { Ask, Clef, SigType } from '../core/music-theory';
import { FL_ORDER, MAJ_GRID, MIN_GRID, SH_ORDER, noteInfo } from '../core/music-theory';
import {
  buildOptions,
  checkAnswer,
  chordItemExtra,
  correctLabelOf,
  explainAnswer,
  makeRng,
  pickQuestion,
  questionKey,
  CHORD_TRAIN_KINDS,
  type PickConfig,
  type QKind,
  type Question,
  type TrainMode,
} from '../core/question-generator';
import { applyAttempt, aggregate, itemKey, median, type AttemptRecord } from '../core/stats';
import { dueItems, enqueueWrong, markAnswer } from '../core/scheduler';
import {
  CHORD_MIX_WEIGHTS,
  LEVELS,
  buildDailyPlan,
  checkPass,
  findLevel,
  levelPickConfig,
  type Level,
  type PassOutcome,
  type PlanBlock,
} from '../core/levels';
import type { AppContext } from './router';
import { dateKeyOf } from './dom';

/** 训练块类型 */
export type BlockKind = PlanBlock['kind'] | 'free' | 'weak';
export type SessionMode = 'daily' | 'free' | 'level';

/** 每分钟预计题量（进度估算与限时上限） */
export const QUESTIONS_PER_MINUTE = 8;
/** 答对 / 答错经验 */
export const XP_CORRECT = 5;
export const XP_WRONG = 1;
/** 通关额外经验 */
export const XP_LEVEL_PASS = 20;
/** 满多少题触发打卡 */
export const CHECKIN_MIN_ANSWERS = 5;

export interface SessionBlock {
  kind: BlockKind;
  title: string;
  focus?: string;
  pick: PickConfig;
  /** 题量与限时先到先止 */
  questionCount: number;
  durationMs: number;
  /** 预计时长（分钟，首页汇总展示用） */
  minutes: number;
  /** 曲目关卡块关联关卡 */
  levelId?: string;
}

export interface SessionPlan {
  mode: SessionMode;
  title: string;
  blocks: SessionBlock[];
  /** 关卡模式的关卡 id */
  levelId?: string;
}

export interface QuestionRecord {
  question: Question;
  ok: boolean;
  /** 实际点击的选项；跳过为 null */
  picked: string | null;
  correctLabel: string;
  explain: string;
  reactionMs: number;
  skipped: boolean;
  favorite: boolean;
  boss: boolean;
}

export interface SessionSummary {
  mode: SessionMode;
  title: string;
  records: QuestionRecord[];
  correctCount: number;
  accuracy: number | null;
  medianMs: number | null;
  fastRatio: number | null;
  bestCombo: number;
  xpEarned: number;
  levelId?: string;
  /** 关卡模式的通关判定 */
  pass?: PassOutcome;
}

/** 一次出题的展示信息 */
export interface CurrentQuestion {
  question: Question;
  block: SessionBlock;
  /** 块内第几题（1 起） */
  indexInBlock: number;
  /** 块内总题数 */
  totalInBlock: number;
  /** 全程第几题（1 起） */
  indexTotal: number;
  isBoss: boolean;
}

/* ---------- 计划编排 ---------- */

function timedBlock(
  kind: BlockKind,
  title: string,
  pick: PickConfig,
  minutes: number,
  focus?: string,
): SessionBlock {
  return {
    kind,
    title,
    focus,
    pick,
    questionCount: Math.max(4, Math.round(minutes * QUESTIONS_PER_MINUTE)),
    durationMs: minutes * 60_000,
    minutes,
  };
}

/** 每日训练计划（热身 → 主节 → 曲目关卡 → 可选和弦块 → 可选冲刺） */
export function planFromDaily(state: AppState): SessionPlan {
  const agg = aggregate(state.stats.records);
  const plan = buildDailyPlan(
    { train: state.config.train === 'piece' ? 'piece' : state.config.train },
    {
      totalAttempts: agg.totalAttempts,
      accuracy: agg.accuracy,
      passedLevelIds: state.levelProgress.passed,
    },
  );
  const clefs: Clef[] = [state.config.clef];
  const asks: Ask[] = [state.config.ask];
  const mainTrain: TrainMode = state.config.train === 'note' ? 'note' : 'sig';
  const blocks: SessionBlock[] = [];
  for (const b of plan) {
    if (b.kind === 'warmup') {
      blocks.push(
        timedBlock(
          'warmup',
          '热身',
          { train: mainTrain, clefs, asks, nMin: 0, nMax: 2 },
          b.minutes,
          b.focus,
        ),
      );
    } else if (b.kind === 'main') {
      blocks.push(timedBlock('main', '主节', { train: mainTrain, clefs, asks }, b.minutes, b.focus));
    } else if (b.kind === 'level') {
      blocks.push(levelBlock(resolveDailyLevel(state, b.levelId)));
    } else if (b.kind === 'chord') {
      blocks.push(chordMixBlock(b.minutes, b.focus));
    } else {
      blocks.push(timedBlock('sprint', '冲刺', { train: mainTrain, clefs, asks: ['maj', 'min'] }, b.minutes, b.focus));
    }
  }
  return { mode: 'daily', title: '今日训练', blocks };
}

/** 和弦混编块：func:diatonic:degrees:build = 3:3:2:2（每 train 3 个题型，题型权重取 train 权重） */
export function chordMixBlock(minutes: number, focus?: string): SessionBlock {
  const kinds: QKind[] = Object.values(CHORD_TRAIN_KINDS).flat();
  const kindWeights: Partial<Record<QKind, number>> = {};
  for (const train of Object.keys(CHORD_TRAIN_KINDS) as Array<keyof typeof CHORD_TRAIN_KINDS>) {
    for (const k of CHORD_TRAIN_KINDS[train]) kindWeights[k] = CHORD_MIX_WEIGHTS[train];
  }
  return {
    kind: 'chord',
    title: '和弦块',
    focus,
    pick: { train: 'func', clefs: ['treble', 'bass'], asks: ['maj'], kinds, kindWeights },
    questionCount: Math.max(4, Math.round(minutes * QUESTIONS_PER_MINUTE)),
    durationMs: minutes * 60_000,
    minutes,
  };
}

/** 日计划里的曲目关卡：优先未通关的曲目关 */
function resolveDailyLevel(state: AppState, levelId?: string): Level {
  if (levelId) {
    const wanted = findLevel(levelId);
    if (wanted) return wanted;
  }
  const passed = new Set(state.levelProgress.passed);
  return (
    LEVELS.find((l) => l.pieceId !== undefined && !passed.has(l.id)) ??
    LEVELS.find((l) => l.pieceId !== undefined) ??
    LEVELS[0]
  );
}

/** 自由练习配置 */
export interface FreeConfig {
  /** 训练模式（sig / note / func / diatonic / degrees / build，mix = 认调 + 认音交替） */
  train: TrainMode | 'mix';
  clef: Clef | 'mix';
  ask: Ask | 'mix';
  minutes: number;
}

/** 各训练模式的自由练习标题与一句话焦点 */
const FREE_META: Record<TrainMode, { title: string; focus: string }> = {
  sig: { title: '自由练习 · 认调', focus: '看调号，直读主音' },
  note: { title: '自由练习 · 认音', focus: '看谱面音位，判断调号带来的升降' },
  piece: { title: '自由练习 · 曲目认调', focus: '跟着名曲认调号' },
  func: { title: '自由练习 · 和弦归属', focus: '看属七，直读它归属的调' },
  diatonic: { title: '自由练习 · 顺阶和弦', focus: '级数 ↔ 顺阶和弦 ↔ 功能' },
  degrees: { title: '自由练习 · 键盘音级', focus: '调内变化音与级数音名' },
  build: { title: '自由练习 · 和弦构建', focus: '按音程公式拼出和弦' },
};

/** 自由练习计划（混合题型按分钟交替出认调 / 认音块） */
export function planFromFree(cfg: FreeConfig): SessionPlan {
  const clefs: Clef[] = cfg.clef === 'mix' ? ['treble', 'bass'] : [cfg.clef];
  const asks: Ask[] = cfg.ask === 'mix' ? ['maj', 'min'] : [cfg.ask];
  const blocks: SessionBlock[] = [];
  const trains: TrainMode[] = cfg.train === 'mix' ? ['sig', 'note'] : [cfg.train];
  for (let i = 0; i < cfg.minutes; i++) {
    const train = trains[i % trains.length];
    const meta = FREE_META[train];
    blocks.push({
      kind: 'free',
      title: meta.title,
      focus: meta.focus,
      pick: {
        train,
        clefs,
        asks: train === 'note' ? ['maj'] : asks,
      },
      questionCount: QUESTIONS_PER_MINUTE,
      durationMs: 60_000,
      minutes: 1,
    });
  }
  return { mode: 'free', title: '自由练习', blocks };
}

/** 关卡训练块 */
export function levelBlock(level: Level): SessionBlock {
  const pick: PickConfig =
    level.pieceId !== undefined
      ? { train: 'piece', clefs: ['treble', 'bass'], asks: ['maj'], pieceIds: [level.pieceId] }
      : levelPickConfig(level, 'sig', ['treble', 'bass']);
  return {
    kind: 'level',
    title: level.title,
    focus: level.theme,
    pick,
    questionCount: level.questionCount,
    durationMs: Number.POSITIVE_INFINITY,
    minutes: 2,
    levelId: level.id,
  };
}

/** 关卡计划（5-8 题，末题为 Boss） */
export function planFromLevel(level: Level): SessionPlan {
  return {
    mode: 'level',
    title: level.title,
    levelId: level.id,
    blocks: [levelBlock(level)],
  };
}

/* ---------- 弱项专练 ---------- */

/** 弱项专练目标（findWeakest / 统计条形行共用） */
export interface WeakTarget {
  train: TrainMode;
  /** 焦点调号池（缺省 = 全范围） */
  keys?: Array<{ type: SigType; n: number }>;
  /** 和弦题型聚焦（缺省 = 该模式全题型） */
  kinds?: QKind[];
  /** 调号 / 模式描述 */
  label: string;
}

/** 弱项来源（WeakSpot 可直接传入；统计条形行给部分字段即可） */
export interface WeakTargetSource {
  train: TrainMode;
  label: string;
  type?: SigType;
  n?: number;
  qkind?: string;
}

/** 弱项来源 → 专练目标（曲目认调退回认调直读） */
export function weakTargetOf(src: WeakTargetSource): WeakTarget {
  const train: TrainMode = src.train === 'piece' ? 'sig' : src.train;
  const target: WeakTarget = { train, label: src.label };
  if (train === 'sig' || train === 'note') {
    if (src.type !== undefined && src.n !== undefined) {
      target.keys = [{ type: src.type, n: src.n }];
    }
  } else if (src.qkind !== undefined) {
    const pool = CHORD_TRAIN_KINDS[train as 'func' | 'diatonic' | 'degrees' | 'build'];
    const qkind = pool.includes(src.qkind as QKind) ? (src.qkind as QKind) : undefined;
    if (qkind !== undefined) {
      // 弱项题型为主 + 同模式少量变式
      target.kinds = [qkind, ...pool.filter((k) => k !== qkind).slice(0, 2)];
    }
  }
  return target;
}

/** 焦点调号池：弱项调号 ×2 为主 + 邻近升降号数变式（0..7 内） */
function focusKeyPool(keys: ReadonlyArray<{ type: SigType; n: number }>): Array<{ type: SigType; n: number }> {
  const out: Array<{ type: SigType; n: number }> = [];
  for (const k of keys) {
    out.push({ type: k.type, n: k.n }, { type: k.type, n: k.n });
    for (const d of [-1, 1]) {
      const n = k.n + d;
      if (n >= 0 && n <= 7) out.push({ type: k.type, n });
    }
  }
  return out;
}

/** 弱项专练计划：只出弱项题目（train/type/n 或题型聚焦 + 少量变式） */
export function planFromWeak(target: WeakTarget, minutes = 3): SessionPlan {
  const pick: PickConfig = {
    train: target.train,
    clefs: ['treble', 'bass'],
    asks: target.train === 'note' ? ['maj'] : ['maj', 'min'],
  };
  if (target.keys !== undefined && target.keys.length > 0) pick.keys = focusKeyPool(target.keys);
  if (target.kinds !== undefined && target.kinds.length > 0) {
    pick.kinds = target.kinds;
    const kindWeights: Partial<Record<QKind, number>> = {};
    target.kinds.forEach((k, i) => {
      kindWeights[k] = i === 0 ? 3 : 1;
    });
    pick.kindWeights = kindWeights;
  }
  return {
    mode: 'free',
    title: `弱项专练 · ${target.label}`,
    blocks: [timedBlock('weak', '弱项专练', pick, minutes, target.label)],
  };
}

/* ---------- 锚点高亮 ---------- */

/**
 * 错题锚点卡里要描红的第 k 个升降号：
 * - 认调：升号看最右、降号看倒二（1♭ 特例看 B♭）
 * - 认音：看该音名在调号里的那一个
 */
export function anchorAccent(q: Question): number | undefined {
  if (q.cq !== undefined) return undefined;
  if (q.n === 0) return undefined;
  if (q.train === 'note') {
    const info = noteInfo(q.step ?? 0, q.type, q.n, q.clef);
    if (info.acc === 0) return undefined;
    const order = q.type === 'sh' ? SH_ORDER : FL_ORDER;
    const idx = order.slice(0, q.n).indexOf(info.letter);
    return idx >= 0 ? idx : undefined;
  }
  if (q.type === 'sh') return q.n - 1;
  return q.n === 1 ? 0 : q.n - 2;
}

/**
 * 生成作答展示选项：
 * - 和弦题：核心层已给出 4 选（或功能 3 选），原样展示
 * - 认音：固定「♮原位 / ♯升 / ♭降」3 项
 * - 认调：核心层 4 项（正确 + 3 易混）再补 2 个随机干扰，凑成 2×3 六宫格
 */
export function displayOptions(q: Question): string[] {
  if (q.cq !== undefined) return [...q.options];
  const base = buildOptions(q);
  if (q.train === 'note') return base;
  const grid = q.ask === 'maj' ? MAJ_GRID : MIN_GRID;
  const extra = shuffle(grid.filter((l) => !base.includes(l))).slice(0, 2);
  return shuffle([...base, ...extra]);
}

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** midi → 音名（记录展示用，键盘拼和弦的作答转成音名串） */
const PC_NAME = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** 作答内容 → 记录用文案 */
function pickedLabelOf(answer: string | readonly number[]): string | null {
  if (typeof answer === 'string') return answer;
  return answer.map((m) => PC_NAME[((m % 12) + 12) % 12]).join(' ');
}

/* ---------- 会话状态机 ---------- */

export class SessionController {
  private blockIndex = 0;
  private askedInBlock = 0;
  private askedTotal = 0;
  private blockStart = 0;
  private questionStart = 0;
  private recent: Question[] = [];
  private records: QuestionRecord[] = [];
  private combo = 0;
  private bestCombo = 0;
  private xpEarned = 0;
  private finished = false;
  private lastPass: PassOutcome | undefined;
  private rng = makeRng(Math.floor(Math.random() * 0xffffffff));

  constructor(
    private ctx: AppContext,
    readonly plan: SessionPlan,
  ) {}

  get currentBlock(): SessionBlock | null {
    return this.blockIndex < this.plan.blocks.length ? this.plan.blocks[this.blockIndex] : null;
  }

  /** 块内进度（1 起） */
  get blockProgress(): { index: number; total: number } {
    return { index: this.askedInBlock + 1, total: this.currentBlock?.questionCount ?? 0 };
  }

  /** 是否已经答完（或超时） */
  get done(): boolean {
    return this.finished || this.currentBlock === null;
  }

  /** 已作答记录（块间小结 / 结果页用） */
  get allRecords(): QuestionRecord[] {
    return this.records;
  }

  /**
   * 取下一题；块结束时自动切到下一块。
   * @returns null 表示整节结束
   */
  next(): CurrentQuestion | null {
    if (this.finished) return null;
    while (this.currentBlock !== null) {
      const block = this.currentBlock;
      const now = Date.now();
      if (this.askedInBlock === 0) this.blockStart = now;
      const timeUp = now - this.blockStart >= block.durationMs;
      const countUp = this.askedInBlock >= block.questionCount;
      if (this.askedInBlock > 0 && (timeUp || countUp)) {
        this.blockIndex++;
        this.askedInBlock = 0;
        continue;
      }
      const question = this.drawQuestion(block);
      this.askedInBlock++;
      this.askedTotal++;
      this.questionStart = now;
      this.recent.push(question);
      if (this.recent.length > 12) this.recent = this.recent.slice(-12);
      const isBoss =
        block.kind === 'level' &&
        block.levelId !== undefined &&
        findLevel(block.levelId)?.bossQuestion === true &&
        this.askedInBlock === block.questionCount;
      return {
        question,
        block,
        indexInBlock: this.askedInBlock,
        totalInBlock: block.questionCount,
        indexTotal: this.askedTotal,
        isBoss,
      };
    }
    return null;
  }

  /** 题目真正展示给用户时重启计时（排除块间小结、首遇微课卡的停留时间） */
  markShown(): void {
    this.questionStart = Date.now();
  }

  private drawQuestion(block: SessionBlock): Question {
    const state = this.ctx.getState();
    const now = Date.now();
    const reviewDue = dueItems(state.review, now, this.askedTotal).map((i) => i.questionKey);
    return pickQuestion(block.pick, state.stats, this.recent, reviewDue, { rng: this.rng, now });
  }

  /**
   * 作答：判题 + 入统计 / 错题队列 + 加经验。
   * @param answer 选项文案 / 选项下标（number[] 时为键盘拼和弦选中的 midi）
   */
  submit(answer: string | readonly number[]): { ok: boolean; correctLabel: string; explain: string; reactionMs: number } {
    const question = this.recent[this.recent.length - 1];
    const reactionMs = Date.now() - this.questionStart;
    const res = checkAnswer(question, answer);
    const now = Date.now();
    const rec: AttemptRecord = {
      key: itemKey(
        question.train,
        question.type,
        question.n,
        question.clef,
        question.ask,
        question.cq ? chordItemExtra(question.cq.kind, question.cq.scale) : '',
      ),
      ok: res.ok,
      reactionMs,
      at: now,
    };
    this.ctx.update((s) => {
      const withStats: AppState = { ...s, stats: applyAttempt(s.stats, rec) };
      const withReview: AppState = {
        ...withStats,
        review: markAnswer(withStats.review, questionKey(question), res.ok, now, this.askedTotal),
      };
      return addXp(withReview, res.ok ? XP_CORRECT : XP_WRONG);
    });
    if (res.ok) {
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.xpEarned += XP_CORRECT;
    } else {
      this.combo = 0;
      this.xpEarned += XP_WRONG;
    }
    this.pushRecord(question, res.ok, pickedLabelOf(answer), res.correctLabel, res.explain, reactionMs, false);
    return { ...res, reactionMs };
  }

  /** 跳过（上滑）：进错题队列，不计作答 */
  skip(): void {
    const question = this.recent[this.recent.length - 1];
    const reactionMs = Date.now() - this.questionStart;
    const now = Date.now();
    this.ctx.update((s) => ({ ...s, review: enqueueWrong(s.review, questionKey(question), now, this.askedTotal) }));
    this.combo = 0;
    this.pushRecord(question, false, null, correctLabelOf(question), explainAnswer(question), reactionMs, true);
  }

  /** 收藏（下滑）：标记 / 取消标记最近一题 */
  favorite(): boolean {
    const last = this.records[this.records.length - 1];
    if (!last) return false;
    last.favorite = !last.favorite;
    return last.favorite;
  }

  private pushRecord(
    question: Question,
    ok: boolean,
    picked: string | null,
    correctLabel: string,
    explain: string,
    reactionMs: number,
    skipped: boolean,
  ): void {
    const block = this.plan.blocks[this.blockIndex];
    const isBoss =
      block?.kind === 'level' &&
      block.levelId !== undefined &&
      findLevel(block.levelId)?.bossQuestion === true &&
      this.askedInBlock === block.questionCount;
    this.records.push({ question, ok, picked, correctLabel, explain, reactionMs, skipped, favorite: false, boss: isBoss });
  }

  /** 结课：打卡 + 关卡结算，返回摘要 */
  finish(): SessionSummary {
    if (this.finished) return this.summarize();
    this.finished = true;
    const answered = this.records.filter((r) => !r.skipped).length;
    this.ctx.update((s) => (answered >= CHECKIN_MIN_ANSWERS ? checkIn(s, dateKeyOf(new Date())) : s));

    if (this.plan.mode === 'level' && this.plan.levelId) {
      const level = findLevel(this.plan.levelId);
      if (level) {
        const outcome = checkPass(
          level,
          this.records.map((r) => ({ ok: r.ok, reactionMs: r.reactionMs })),
        );
        this.lastPass = outcome;
        if (outcome.pass) {
          this.xpEarned += XP_LEVEL_PASS;
          this.ctx.update((s) => {
            const gained = addXp(s, XP_LEVEL_PASS);
            return {
              ...gained,
              levelProgress: {
                passed: gained.levelProgress.passed.includes(level.id)
                  ? gained.levelProgress.passed
                  : [...gained.levelProgress.passed, level.id],
                stars: {
                  ...gained.levelProgress.stars,
                  [level.id]: Math.max(gained.levelProgress.stars[level.id] ?? 0, outcome.stars),
                },
              },
            };
          });
        }
      }
    }
    return this.summarize();
  }

  private summarize(): SessionSummary {
    const answered = this.records.filter((r) => !r.skipped);
    const okCount = this.records.filter((r) => r.ok).length;
    const reactions = answered.map((r) => r.reactionMs);
    const fast = reactions.filter((ms) => ms <= 1500).length;
    return {
      mode: this.plan.mode,
      title: this.plan.title,
      records: this.records,
      correctCount: okCount,
      accuracy: this.records.length > 0 ? okCount / this.records.length : null,
      medianMs: median(reactions),
      fastRatio: reactions.length > 0 ? fast / reactions.length : null,
      bestCombo: this.bestCombo,
      xpEarned: this.xpEarned,
      levelId: this.plan.levelId,
      pass: this.lastPass,
    };
  }
}
