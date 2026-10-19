/**
 * 关卡层：4 章（0–1♯♭ / 2–3♯♭ / 4–5♯♭ / 6–7♯♭）共 27 关，
 * 通关判定 + 星级 + 每日编排（热身/主节/曲目关卡/冲刺）。
 */

import type { Clef, SigType } from './music-theory';
import { median } from './stats';
import type { PickConfig, TrainMode } from './question-generator';

/** 调号分布池：本关抽到的调号组合（type + 升降号个数） */
export interface SigKey {
  type: SigType;
  n: number;
}

export interface Level {
  id: string;
  /** 章 1..4 */
  chapter: number;
  title: string;
  /** 曲目关卡关联的曲目 id */
  pieceId?: string;
  /** 一句主题（UI 展示） */
  theme: string;
  /** n/type 分布配置 */
  dist: SigKey[];
  /** 题数 5-8 */
  questionCount: number;
  /** 是否含 boss 题（约定：最后一题为 boss） */
  bossQuestion: boolean;
  /** 通关正确率门槛 */
  passAcc: number;
  /** 通关反应中位数门槛（毫秒） */
  passMedianMs: number;
}

/** 各章反应门槛：章1 2500ms / 章2 2000ms / 章3 1500ms / 章4 1200ms */
export const CHAPTER_PASS_MS = [2500, 2000, 1500, 1200] as const;

export interface Chapter {
  id: number;
  title: string;
  range: string;
  passMedianMs: number;
}

export const CHAPTERS: readonly Chapter[] = [
  { id: 1, title: '起点 · 认识调号', range: '0–1♯♭', passMedianMs: CHAPTER_PASS_MS[0] },
  { id: 2, title: '进阶 · 二三号', range: '2–3♯♭', passMedianMs: CHAPTER_PASS_MS[1] },
  { id: 3, title: '熟练 · 四五号', range: '4–5♯♭', passMedianMs: CHAPTER_PASS_MS[2] },
  { id: 4, title: '极限 · 六七号', range: '6–7♯♭', passMedianMs: CHAPTER_PASS_MS[3] },
];

function lv(
  id: string,
  chapter: number,
  title: string,
  theme: string,
  dist: SigKey[],
  questionCount: number,
  bossQuestion = false,
  pieceId?: string,
): Level {
  return {
    id,
    chapter,
    title,
    theme,
    dist,
    questionCount,
    bossQuestion,
    pieceId,
    passAcc: 0.8,
    passMedianMs: CHAPTER_PASS_MS[chapter - 1],
  };
}

/** 全部关卡（按章序、关序排列） */
export const LEVELS: readonly Level[] = [
  // 第 1 章：0–1♯♭
  lv('c1-01', 1, '零号调号', '无升降号 = C 大调 / a 小调，一切的起点', [{ type: 'sh', n: 0 }, { type: 'fl', n: 0 }], 5),
  lv('c1-02', 1, '一个升号', '最右升号再升半音 → G 大调 / e 小调', [{ type: 'sh', n: 0 }, { type: 'sh', n: 1 }], 6),
  lv('c1-03', 1, '一个降号', '1♭ 特例：只有 B♭ → F 大调 / d 小调', [{ type: 'fl', n: 0 }, { type: 'fl', n: 1 }], 6),
  lv('c1-04', 1, '升降对照室', '一个升号和一个降号放在一起还认得吗', [{ type: 'sh', n: 0 }, { type: 'sh', n: 1 }, { type: 'fl', n: 0 }, { type: 'fl', n: 1 }], 7),
  lv('c1-05', 1, '曲目关卡：致爱丽丝', '贝多芬写给学生的 a 小调小品', [{ type: 'sh', n: 0 }], 5, false, 'fur-elise'),
  lv('c1-06', 1, '章末 Boss：一升一降大混战', '守住 0–1♯♭，别被换位击倒', [{ type: 'sh', n: 0 }, { type: 'sh', n: 1 }, { type: 'fl', n: 0 }, { type: 'fl', n: 1 }], 8, true),

  // 第 2 章：2–3♯♭
  lv('c2-01', 2, '两个升号', '倒数第二个升号再升半音？不，看最右 → D 大调 / b 小调', [{ type: 'sh', n: 1 }, { type: 'sh', n: 2 }], 6),
  lv('c2-02', 2, '两个降号', '倒二降 = B♭ 大调 / g 小调', [{ type: 'fl', n: 1 }, { type: 'fl', n: 2 }], 6),
  lv('c2-03', 2, '三个升号', '最右升 A♯+半音 → B？不，是 A 大调 / f♯ 小调', [{ type: 'sh', n: 2 }, { type: 'sh', n: 3 }], 6),
  lv('c2-04', 2, '三个降号', '倒二降 E♭ → E♭ 大调 / c 小调（命运的调号）', [{ type: 'fl', n: 2 }, { type: 'fl', n: 3 }], 6),
  lv('c2-05', 2, '曲目关卡：欢乐颂', '贝多芬第九交响曲主题，D 大调的合唱之光', [{ type: 'sh', n: 2 }], 5, false, 'ode-to-joy'),
  lv('c2-06', 2, '曲目关卡：莫扎特第 40', 'g 小调的叹息主题，两个降号的忧郁', [{ type: 'fl', n: 2 }], 5, false, 'mozart-40'),
  lv('c2-07', 2, '降号巩固关', '♭ 队列拉练：从 B♭ 到 E♭ 反复横跳', [{ type: 'fl', n: 0 }, { type: 'fl', n: 1 }, { type: 'fl', n: 2 }, { type: 'fl', n: 3 }], 7),
  lv('c2-08', 2, '章末 Boss：二三号大乱斗', '2–3♯♭ 全混，考验直读速度', [{ type: 'sh', n: 2 }, { type: 'sh', n: 3 }, { type: 'fl', n: 2 }, { type: 'fl', n: 3 }], 8, true),

  // 第 3 章：4–5♯♭
  lv('c3-01', 3, '四个升号', 'E 大调 / c♯ 小调，月光的调号', [{ type: 'sh', n: 3 }, { type: 'sh', n: 4 }], 6),
  lv('c3-02', 3, '四个降号', 'A♭ 大调 / f 小调，悲怆慢板的调号', [{ type: 'fl', n: 3 }, { type: 'fl', n: 4 }], 6),
  lv('c3-03', 3, '五个升号', 'B 大调 / g♯ 小调，开始进入「多♯区」', [{ type: 'sh', n: 4 }, { type: 'sh', n: 5 }], 6),
  lv('c3-04', 3, '五个降号', 'D♭ 大调 / b♭ 小调，钢琴家最爱的调', [{ type: 'fl', n: 4 }, { type: 'fl', n: 5 }], 6),
  lv('c3-05', 3, '曲目关卡：四季·春', '维瓦尔第把 4♯ 写成了鸟鸣', [{ type: 'sh', n: 4 }], 5, false, 'vivaldi-spring'),
  lv('c3-06', 3, '曲目关卡：月光奏鸣曲', '贝多芬 c♯ 小调的分解和弦水波', [{ type: 'sh', n: 4 }], 5, false, 'moonlight'),
  lv('c3-07', 3, '章末 Boss：四五号对决', '4–5♯♭ 对攻，反应要跟上直读', [{ type: 'sh', n: 4 }, { type: 'sh', n: 5 }, { type: 'fl', n: 4 }, { type: 'fl', n: 5 }], 8, true),

  // 第 4 章：6–7♯♭
  lv('c4-01', 4, '六个升号', 'F♯ 大调 / d♯ 小调，等音世界的入口', [{ type: 'sh', n: 5 }, { type: 'sh', n: 6 }], 6),
  lv('c4-02', 4, '六个降号', 'G♭ 大调 / e♭ 小调，与 6♯ 是同一把钥匙', [{ type: 'fl', n: 5 }, { type: 'fl', n: 6 }], 6),
  lv('c4-03', 4, '七个升号', 'C♯ 大调 / a♯ 小调，升号走到了尽头', [{ type: 'sh', n: 6 }, { type: 'sh', n: 7 }], 6),
  lv('c4-04', 4, '七个降号', 'C♭ 大调 / a♭ 小调，降号走到了尽头', [{ type: 'fl', n: 6 }, { type: 'fl', n: 7 }], 6),
  lv('c4-05', 4, '等音对决', 'F♯ ↔ G♭：同音异名的调号怎么记', [{ type: 'sh', n: 6 }, { type: 'fl', n: 6 }, { type: 'sh', n: 7 }, { type: 'fl', n: 7 }], 7),
  lv('c4-06', 4, '理论极值挑战', '6–7♯♭ 全混 Boss：把口诀练成条件反射', [{ type: 'sh', n: 6 }, { type: 'sh', n: 7 }, { type: 'fl', n: 6 }, { type: 'fl', n: 7 }], 8, true),
];

/** 按 id 查关卡 */
export function findLevel(id: string): Level | undefined {
  return LEVELS.find((l) => l.id === id);
}

/** 某一章的关卡列表 */
export function chapterLevels(chapter: number): Level[] {
  return LEVELS.filter((l) => l.chapter === chapter);
}

/** 关卡 → 抽题配置（train 由上层决定，认音关把 ask 收敛为 maj） */
export function levelPickConfig(level: Level, train: TrainMode = 'sig', clefs: Clef[] = ['treble', 'bass']): PickConfig {
  return {
    train,
    clefs,
    asks: train === 'sig' ? ['maj', 'min'] : ['maj'],
    keys: level.dist.map((k) => ({ type: k.type, n: k.n })),
  };
}

/* ---------- 通关判定 ---------- */

export interface LevelAttempt {
  ok: boolean;
  /** 反应耗时（毫秒） */
  reactionMs: number;
}

export interface PassOutcome {
  pass: boolean;
  /** 0 = 未通关，1..3 星 */
  stars: 0 | 1 | 2 | 3;
  /** 正确率 */
  acc: number;
  /** 反应中位数（毫秒） */
  medianMs: number;
  /** boss 题（最后一题）是否答对 */
  bossOk: boolean;
}

/**
 * 通关判定：
 * - 须答满 questionCount 题；正确率 ≥ passAcc 且反应中位数 ≤ passMedianMs
 * - 含 boss 题的关卡要求最后一题答对
 * - 星级：通关 1 星；正确率 ≥95% +1 星；反应中位数 ≤ 门槛 75% 再 +1 星
 */
export function checkPass(level: Level, results: ReadonlyArray<LevelAttempt>): PassOutcome {
  const total = results.length;
  const okCount = results.filter((r) => r.ok).length;
  const acc = total > 0 ? okCount / total : 0;
  const med = median(results.map((r) => r.reactionMs));
  const medianMs = med ?? Number.POSITIVE_INFINITY;
  const bossOk = level.bossQuestion ? (total > 0 ? results[total - 1].ok : false) : true;
  const pass =
    total >= level.questionCount &&
    acc >= level.passAcc &&
    medianMs <= level.passMedianMs &&
    bossOk;

  let stars: 0 | 1 | 2 | 3 = 0;
  if (pass) {
    stars = 1;
    if (acc >= 0.95) stars = (stars + 1) as 2 | 3;
    if (medianMs <= level.passMedianMs * 0.75) stars = (stars + 1) as 2 | 3;
  }
  return { pass, stars, acc, medianMs, bossOk };
}

/* ---------- 每日编排 ---------- */

export interface PlanBlock {
  kind: 'warmup' | 'main' | 'level' | 'sprint';
  /** 预计时长（分钟） */
  minutes: number;
  /** level 块指定关卡 */
  levelId?: string;
  /** 一句说明（UI 展示） */
  focus?: string;
}

/** 编排所需统计摘要（Aggregates 可直接传入） */
export interface PlanStats {
  totalAttempts: number;
  accuracy: number | null;
}

export interface DailyPlanConfig {
  /** 主训练模式，默认 sig */
  train?: TrainMode;
  /** 是否安排曲目关卡，默认安排 */
  hasLevel?: boolean;
  /** 曲目关卡 id（可选） */
  levelId?: string;
  /** 强制安排冲刺（默认按统计表现决定） */
  sprint?: boolean;
}

/** 冲刺开启门槛：样本 ≥20 且正确率 ≥85% */
export const SPRINT_MIN_ATTEMPTS = 20;
export const SPRINT_MIN_ACC = 0.85;

/**
 * 每日编排：热身 1 分 + 主节 2–3 分 + 曲目关卡 2 分 + 可选冲刺 1 分。
 * 主节时长自适应：正确率 <80% 给 3 分钟，否则 2 分钟。
 */
export function buildDailyPlan(cfg: DailyPlanConfig = {}, stats?: PlanStats): PlanBlock[] {
  const train = cfg.train ?? 'sig';
  const weak = stats !== undefined && stats.accuracy !== null && stats.accuracy < 0.8;
  const plan: PlanBlock[] = [
    { kind: 'warmup', minutes: 1, focus: '热身：最近练过的调号快问快答' },
    { kind: 'main', minutes: weak ? 3 : 2, focus: `主节：${train === 'note' ? '认音' : train === 'piece' ? '曲目认调' : '认调'}自适应抽题` },
  ];
  if (cfg.hasLevel !== false) {
    plan.push({ kind: 'level', minutes: 2, levelId: cfg.levelId, focus: '曲目关卡：跟着名曲巩固调号' });
  }
  const earned =
    cfg.sprint === true ||
    (stats !== undefined && stats.totalAttempts >= SPRINT_MIN_ATTEMPTS && (stats.accuracy ?? 0) >= SPRINT_MIN_ACC);
  if (earned) {
    plan.push({ kind: 'sprint', minutes: 1, focus: '冲刺：限时连击，冲一波反应速度' });
  }
  return plan;
}
