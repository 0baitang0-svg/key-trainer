/**
 * 直读微课卡：调号首遇时的口诀卡片文案（纯内容层）。
 */

import { anchorText, keyInfo, type Ask, type SigType } from '../core/music-theory';

export interface RuleCard {
  id: string;
  type: SigType;
  n: number;
  ask: Ask;
  /** 卡片标题 */
  title: string;
  /** 口诀正文 */
  lines: string[];
  /** 当前调号的直读示例 */
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
