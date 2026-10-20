/**
 * 直读微课卡：首遇题型时的口诀卡片文案（纯内容层）。
 * 调号卡 id 前缀 `rc|`，和弦卡 id 前缀 `rcq|`，两套互不去重冲突。
 */

import { anchorText, keyInfo, type Ask, type SigType } from '../core/music-theory';
import type { ChordQ } from '../core/question-generator';

export interface RuleCard {
  id: string;
  /** 调号卡专用：调号类型 / 升降号个数 / 问法（和弦卡不带） */
  type?: SigType;
  n?: number;
  ask?: Ask;
  /** 卡片标题 */
  title: string;
  /** 口诀正文 */
  lines: string[];
  /** 当前题目的直读示例 */
  example: string;
}

/** 微课卡 id（用于 seenKeys 去重） */
export function ruleCardId(type: SigType, n: number, ask: Ask): string {
  return `rc|${type}|${n}|${ask}`;
}

/**
 * 首遇微课卡：按调号与问法生成口诀内容。
 * - 升号：最右升号再升半音
 * - 降号：倒二降（1♭ 特例 = F）
 * - 小调：大调主音下小三度
 */
export function firstSeen(type: SigType, n: number, ask: Ask): RuleCard {
  const info = keyInfo(type, n);
  const lines: string[] = [];
  if (n === 0) {
    lines.push('没有任何升降号 = C 大调，先记住这个基准。');
  } else if (type === 'sh') {
    lines.push(`升号直读口诀：最右那个升号（${info.letters[info.letters.length - 1]}♯）再升半音 = 大调主音。`);
    lines.push(`顺着升号序数一数：${info.letters.join(' → ')}，最右是 ${info.letters[info.letters.length - 1]}♯。`);
  } else if (n === 1) {
    lines.push('降号特例：只有一个降号 B♭ 时，主音是 F（唯一不走「倒二降」的调）。');
  } else {
    lines.push(`降号直读口诀：倒数第二个降号（${info.letters[info.letters.length - 2]}♭）= 大调主音。`);
    lines.push(`降号序：${info.letters.join(' → ')}，倒二是 ${info.letters[info.letters.length - 2]}♭。`);
  }
  if (ask === 'min') {
    lines.push(`小调直读：同调号大调主音 ${info.maj} 下小三度 = ${info.min}。`);
  }
  return {
    id: ruleCardId(type, n, ask),
    type,
    n,
    ask,
    title: `${info.sign === '♯' ? '升' : '降'}号 ${n} 个 · ${ask === 'maj' ? '大调' : '小调'}直读`,
    lines,
    example: anchorText(type, n, ask),
  };
}

/* ---------- 和弦微课卡（id 前缀 `rcq|`） ---------- */

/** 和弦微课卡 id（与调号卡 `rc|` 前缀区分） */
export function chordRuleCardId(tag: string): string {
  return `rcq|${tag}`;
}

/** 属七归属口诀卡 */
export const DOM_KEY_CARD: RuleCard = {
  id: chordRuleCardId('dom'),
  title: '属七归屋口诀',
  lines: ['属七根音上行纯五度就是主音，同名大小调共用一个属七：G7 = C 大调 + c 小调的 V7。'],
  example: '例：A7 的根 A 上行纯五度 = D → A7 = D 大调 + d 小调的 V7。',
};

/** 顺阶和弦功能卡 */
export const FUNC_CARD: RuleCard = {
  id: chordRuleCardId('func'),
  title: '顺阶和弦功能',
  lines: ['主{I iii vi} 下属{ii IV} 属{V vii}，三种调式通用。'],
  example: '例：C 大调 → I=C、ii=Dm、IV=F、V=G、vi=Am、vii°=B°。',
};

/** 和声小调特征卡 */
export const HARM_MIN_CARD: RuleCard = {
  id: chordRuleCardId('harmMin'),
  title: '和声小调特征',
  lines: ['和声小调升第 7 级当导音 → V 变大三、vii°7 是全减七（a 小调：G♯ B D F）。'],
  example: '例：a 和声小调 → V = E 大三、vii°7 = G♯°7 = G♯ B D F。',
};

/** 旋律小调卡 */
export const MEL_MIN_CARD: RuleCard = {
  id: chordRuleCardId('melMin'),
  title: '旋律小调约定',
  lines: ['爵士约定上下行同形：升 6、7 级 → IV 变大三、V7 是属七、vi 变减三（古典下行还原不考）。'],
  example: '例：a 旋律小调 → IV = D 大三、V7 = E7、vi = F♯°。',
};

/** 和弦构建公式卡 */
export const CHORD_BUILD_CARD: RuleCard = {
  id: chordRuleCardId('build'),
  title: '和弦构建公式',
  lines: ['大三 = 4+3 半音，小三 = 3+4，属七 = 大三 + 小七（10 半音），减七 = 三个小三度叠置。'],
  example: '例：C 大三 = C E G（4+3）；C7 = C E G B♭（4+3+3）。',
};

/**
 * 和弦题首遇微课卡：按题型 / 调式取对应口诀卡。
 * - 拼和弦类 → 构建公式卡
 * - 属七归属类（dom-key / key-dom）→ 属七归屋卡
 * - 和声 / 旋律小调题 → 对应小调特征卡
 * - 其余（顺阶和弦 / 功能 / 大调音级）→ 顺阶功能卡
 */
export function firstSeenChord(cq: ChordQ): RuleCard {
  if (cq.kind === 'build-notes' || cq.kind === 'build-mc' || cq.kind === 'notes2quality') return CHORD_BUILD_CARD;
  if (cq.kind === 'dom-key' || cq.kind === 'key-dom') return DOM_KEY_CARD;
  if (cq.scale === 'harmMin') return HARM_MIN_CARD;
  if (cq.scale === 'melMin') return MEL_MIN_CARD;
  return FUNC_CARD;
}
