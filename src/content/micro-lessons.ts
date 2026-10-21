/**
 * 微课内容层（v0.1.5 第 1 批）：5 节微课的结构化文案、题目 → 课归属、
 * 旧规则卡 seenKeys（`rc|` / `rcq|`）→ 新微课 id（`mc|`）重映射。
 * 纯数据 / 纯函数：只 import 题目类型（type-only），不依赖 UI / store ——
 * store → 本模块单向引用，无循环依赖。聚合取代 content/rules-cards.ts（UI 批次再删旧卡）。
 */

import type { QKind, Question } from '../core/question-generator';

export interface MicroLessonSec {
  /** 分节标题（如「规则」「例调」） */
  heading: string;
  /** 条目文案（带 ①② 编号的直读口诀） */
  lines: string[];
  /** 直读示例（多行以 \n 分隔；只有例调节用） */
  example?: string;
}

export interface MicroLesson {
  /** 课 id（'mc|key' 等） */
  id: string;
  /** 课序 1..5 */
  no: number;
  /** 顶部眉题（如 '微课 1 / 5 · 读调号'） */
  eyebrow: string;
  title: string;
  secs: MicroLessonSec[];
  /** 动画演示引用（demo 内容见 lesson-demos.ts，本批只定义引用） */
  demos?: { id: string; label: string }[];
}

export type LessonId = 'mc|key' | 'mc|seq' | 'mc|chord-func' | 'mc|chord-build' | 'mc|deg';

/** 5 节微课正文（key = LessonId，键序即课序） */
export const LESSONS: Record<LessonId, MicroLesson> = {
  'mc|key': {
    id: 'mc|key',
    no: 1,
    eyebrow: '微课 1 / 5 · 读调号',
    title: '读调号直读',
    demos: [
      { id: 'demo-key-sh', label: '看动画 · 升号直读' },
      { id: 'demo-key-fl', label: '看动画 · 降号直读' },
    ],
    secs: [
      {
        heading: '规则',
        lines: [
          '① 升号调：看最右那个升号，再升半音 = 大调主音。',
          '② 降号调：看倒数第二个降号 = 大调主音。',
          '③ 特例：只有 1 个降号（B♭）= F 大调。',
          '④ 0 个升降号 = C 大调，一切从这数。',
          '⑤ 小调：同调号大调主音再下小三度。',
        ],
      },
      {
        heading: '例调',
        lines: [],
        example: ['例1：3♯ = F♯ C♯ G♯，最右 G♯ +半音 → A 大调', '例2：2♭ = B♭ E♭，倒二 → B♭ 大调', '例3：1♭ → F 大调（特例）'].join('\n'),
      },
    ],
  },
  'mc|seq': {
    id: 'mc|seq',
    no: 2,
    eyebrow: '微课 2 / 5 · 视奏读谱',
    title: '视奏读谱',
    demos: [{ id: 'demo-seq-bar', label: '看动画 · 记号跟小节走' }],
    secs: [
      {
        heading: '开弹前 3 秒',
        lines: [
          '① 调号只画在谱面最左，先默念再开弹，谱子滑走就看不见。',
          '② 例：3 个降号（B♭ E♭ A♭）先念一遍。',
        ],
      },
      {
        heading: '记号跟小节走',
        lines: [
          '③ 画了记号后同小节同字母延续，不重画记号。',
          '④ 跨过小节线记号失效，回到调号原样（♮ 表示还原）。',
          '⑤ 例：本小节 F 画了 ♯ → 后面 F 都弹♯；下一小节 F 恢复原样。',
        ],
      },
    ],
  },
  'mc|chord-func': {
    id: 'mc|chord-func',
    no: 3,
    eyebrow: '微课 3 / 5 · 属七与功能',
    title: '属七与顺阶功能',
    secs: [
      {
        heading: '属七归屋',
        lines: [
          '① 属七根音上行纯五度 = 主音，同名大小调共用一个属七。',
          '② 例：A7 → D 大调 + d 小调的 V7。',
        ],
      },
      {
        heading: '功能组',
        lines: [
          '① 主{I iii vi} · 下属{ii IV} · 属{V vii°}，三种调式通用。',
          '② 例：C 大调 I=C、ii=Dm、IV=F、V=G、vi=Am、vii°=B°。',
        ],
      },
      {
        heading: '两个小调特征',
        lines: [
          '① 和声小调升 7 级当导音 → V 变大三、vii°7 全减七（a 小调：G♯ B D F）。',
          '② 旋律小调爵士约定上下行同形：升 6、7 级 → IV 大三、V7 属七、vi 减三。',
        ],
      },
    ],
  },
  'mc|chord-build': {
    id: 'mc|chord-build',
    no: 4,
    eyebrow: '微课 4 / 5 · 和弦构建',
    title: '和弦构建与性质',
    secs: [
      {
        heading: '公式',
        lines: [
          '① 大三 = 4+3 半音（C E G），小三 = 3+4（C E♭ G）。',
          '② 属七 = 大三 + 小七，根到七音 10 半音（C7 = C E G B♭）。',
          '③ 减七 = 三个小三叠置（C E♭ G♭ B♭♭）。',
        ],
      },
      {
        heading: '看串定性质',
        lines: [
          '① 先量根→三音（4 = 大 / 3 = 小），再量根→七音（10 = 属七 / 9 = 大七）。',
          '② 例：G7 = G B D F；F♯°7 = F♯ A C E♭。',
        ],
      },
    ],
  },
  'mc|deg': {
    id: 'mc|deg',
    no: 5,
    eyebrow: '微课 5 / 5 · 音级直读',
    title: '音级与键盘直读',
    secs: [
      {
        heading: '谱上位置',
        lines: [
          '① 先数线 / 间位置得音级，1 级永远是主音。',
          '② 例：C 大调第 3 级 = E，a 小调第 3 级 = C。',
        ],
      },
      {
        heading: '键盘与变化音',
        lines: [
          '① 键盘题从主音那格数起，调内白键 + 升降键一起找。',
          '② 反推题把高亮音当 1 / 4 / 5 级候选，套升降号序验证。',
          '③ 例：D 大调变化音 = F♯ C♯。',
        ],
      },
    ],
  },
};

/** 课序（1..5） */
export const LESSON_ORDER: LessonId[] = ['mc|key', 'mc|seq', 'mc|chord-func', 'mc|chord-build', 'mc|deg'];

/** 按 id 取微课（未知 id 返回 undefined） */
export function getLesson(id: string): MicroLesson | undefined {
  return LESSONS[id as LessonId];
}

/** 题型 → 课归属（12 个 QKind 穷尽；kind 优先于 scale） */
const KIND_LESSON: Record<QKind, LessonId> = {
  'dom-key': 'mc|chord-func',
  'key-dom': 'mc|chord-func',
  'listen-func': 'mc|chord-func',
  deg2chord: 'mc|chord-func',
  chord2deg: 'mc|chord-func',
  chord2func: 'mc|chord-func',
  key2acc: 'mc|deg',
  deg2note: 'mc|deg',
  acc2key: 'mc|deg',
  'build-notes': 'mc|chord-build',
  'build-mc': 'mc|chord-build',
  notes2quality: 'mc|chord-build',
};

/**
 * 题目 → 微课归属：
 * - 视奏串题（q.seq）→ mc|seq（优先于 cq 判定）
 * - 无 cq（sig / piece 认调）→ mc|key
 * - 有 cq → 按 kind 归属表（kind 已穷尽 12 个；scale harmMin/melMin 不再单独分流，
 *   查表未命中——只可能来自 key 解析的脏 kind——兜底归 mc|chord-func）
 */
export function moduleForQuestion(q: Question): LessonId {
  if (q.seq !== undefined) return 'mc|seq';
  if (q.cq === undefined) return 'mc|key';
  const hit: LessonId | undefined = KIND_LESSON[q.cq.kind];
  return hit ?? 'mc|chord-func';
}

/* ---------- 旧规则卡 seenKeys 重映射 ---------- */

/**
 * 单个旧 key → 新微课 id（可能一对多：旧版 deg 题共用 rcq|func 卡）：
 * - `rc|…`（调号卡任意后缀）→ mc|key
 * - `rcq|bar` / `rcq|scroll` → mc|seq
 * - `rcq|dom*` / `rcq|func` / `rcq|harmMin*` / `rcq|melMin*` → mc|chord-func（func 额外产出 mc|deg）
 * - `rcq|build*` → mc|chord-build
 * - 非 legacy（已是 `mc|` 开头或未知 key）→ 原样保留
 */
function legacyTargets(key: string): string[] {
  if (key.startsWith('rc|')) return ['mc|key'];
  if (key === 'rcq|bar' || key === 'rcq|scroll') return ['mc|seq'];
  if (key.startsWith('rcq|dom')) return ['mc|chord-func'];
  if (key === 'rcq|func') return ['mc|chord-func', 'mc|deg'];
  if (key.startsWith('rcq|harmMin') || key.startsWith('rcq|melMin')) return ['mc|chord-func'];
  if (key.startsWith('rcq|build')) return ['mc|chord-build'];
  return [key];
}

/**
 * 旧规则卡 seenKeys → 新微课 seenKeys（纯函数）：
 * 输出去重、顺序稳定；幂等——第二次输入已无 legacy key，原样输出。
 */
export function remapLegacySeenKeys(keys: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    for (const target of legacyTargets(key)) {
      if (seen.has(target)) continue;
      seen.add(target);
      out.push(target);
    }
  }
  return out;
}
