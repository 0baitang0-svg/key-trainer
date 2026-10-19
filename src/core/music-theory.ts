/**
 * 乐理核心层：调号数据表 + 判定口诀纯函数 + 认音逻辑。
 * 全部为纯函数，不依赖 DOM，可在 vitest 中直接测试。
 *
 * 数据表经过逐像素校对（2026-10 修复 6♯/7♭ 两处槽位错位），数值不许改动。
 */

// step 槽位表同源于 engraving/key-signature-slots.ts，这里再导出一份方便统一入口
export { TSH, TFL, BSH, BFL } from '../engraving/key-signature-slots';

export type SigType = 'sh' | 'fl';
export type Clef = 'treble' | 'bass';
export type Ask = 'maj' | 'min';

/* ---------- 数据表（不许改动数值） ---------- */

/** 升号序：要升的音名字母 */
export const SH_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
/** 降号序：要降的音名字母 */
export const FL_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** SH_MAJ[n] = n 个升号的大调名（n = 0..7） */
export const SH_MAJ = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'];
/** FL_MAJ[n] = n 个降号的大调名（n = 0..7） */
export const FL_MAJ = ['C', 'F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭'];
/** SH_MIN[n] = n 个升号的小调名（n = 0..7） */
export const SH_MIN = ['a', 'e', 'b', 'f♯', 'c♯', 'g♯', 'd♯', 'a♯'];
/** FL_MIN[n] = n 个降号的小调名（n = 0..7） */
export const FL_MIN = ['a', 'd', 'g', 'c', 'f', 'b♭', 'e♭', 'a♭'];

/** 答题主按钮：升号方向 8 个 + 降号方向 7 个 */
export const MAJ_GRID = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭'];
/** 答题主按钮（小调） */
export const MIN_GRID = ['a', 'e', 'b', 'f♯', 'c♯', 'g♯', 'd♯', 'a♯', 'd', 'g', 'c', 'f', 'b♭', 'e♭', 'a♭'];

/** 高音谱号 step 0..8 的音名字母（0=第1线 … 8=第5线） */
export const T_LET = ['E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F'];
export const T_OCT = [4, 4, 4, 4, 4, 5, 5, 5, 5];
/** 低音谱号 step 0..8 的音名字母 */
export const B_LET = ['G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A'];
export const B_OCT = [2, 2, 2, 3, 3, 3, 3, 3, 3];

export const POS_NAMES = ['第1线', '第1间', '第2线', '第2间', '第3线', '第3间', '第4线', '第4间', '第5线'];
export const SIGN: Record<SigType, '♯' | '♭'> = { sh: '♯', fl: '♭' };
export const WORD: Record<SigType, '升' | '降'> = { sh: '升', fl: '降' };

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
/** 各字母自然音的半音数（C=0） */
const LETTER_SEMI = [0, 2, 4, 5, 7, 9, 11];
const LETTER_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

function assertN(n: number): void {
  if (!Number.isInteger(n) || n < 0 || n > 7) {
    throw new RangeError(`升降号个数 n 必须是 0..7 的整数，收到 ${n}`);
  }
}

/* ---------- 判定口诀（纯函数） ---------- */

/**
 * 升号调主音 = 最右升号音名再升半音。
 * F♯→G、C♯→D、G♯→A、D♯→E、A♯→B、E♯→F♯、B♯→C♯（E/B 与相邻字母是半音关系，升半音后保留♯）。
 */
export function sharpTonicByRule(n: number): string {
  assertN(n);
  if (n === 0) return 'C';
  return raisedHalfStep(SH_ORDER[n - 1]);
}

/** X♯ 再升半音后的主音音名 */
function raisedHalfStep(letter: string): string {
  const i = LETTER_INDEX[letter];
  const j = (i + 1) % 7;
  // 相邻字母间是全音（gap=2）则升半音后为自然音；是半音（gap=1，E-F / B-C）则仍带♯
  const gap = (LETTER_SEMI[j] - LETTER_SEMI[i] + 12) % 12;
  return gap === 2 ? LETTERS[j] : LETTERS[j] + '♯';
}

/** 降号调主音 = 倒数第二个降号的音名（1♭ 特例 = F） */
export function flatTonicByRule(n: number): string {
  assertN(n);
  if (n === 0) return 'C';
  if (n === 1) return 'F';
  return FL_ORDER[n - 2] + '♭';
}

/** 小调主音 = 同调号大调主音下小三度 */
export function minorTonicByRule(majTonic: string): string {
  const letter = majTonic[0];
  const acc = majTonic.includes('♯') ? 1 : majTonic.includes('♭') ? -1 : 0;
  const i = LETTER_INDEX[letter];
  const j = (i + 5) % 7; // 下行 3 个音级
  for (const b of [0, 1, -1, 2, -2]) {
    const diff = (((LETTER_SEMI[i] + acc) - (LETTER_SEMI[j] + b)) % 12 + 12) % 12;
    if (diff === 3) return LETTERS[j].toLowerCase() + (b === 1 ? '♯' : b === -1 ? '♭' : '');
  }
  throw new Error(`无法推导 ${majTonic} 的小调主音`);
}

/** 按判定口诀推导大小调主音（0♯♭ = C 大调 / a 小调） */
export function tonicByRule(type: SigType, n: number): { maj: string; min: string } {
  const maj = type === 'sh' ? sharpTonicByRule(n) : flatTonicByRule(n);
  return { maj, min: minorTonicByRule(maj) };
}

/* ---------- 调号信息 ---------- */

export interface KeyInfo {
  type: SigType;
  /** 升/降号个数 0..7 */
  n: number;
  sign: '♯' | '♭';
  /** 大调名 = 大调主音 */
  maj: string;
  /** 小调名 = 小调主音 */
  min: string;
  /** 大调主音 */
  tonicMaj: string;
  /** 小调主音 */
  tonicMin: string;
  /** 升/降序前 n 个被升降的音名字母（如 3♯ → ['F','C','G']） */
  letters: string[];
}

/** 由调号（sh/fl + 升降号个数）查大小调名 / 主音 / 前 n 个升降音名 */
export function keyInfo(type: SigType, n: number): KeyInfo {
  assertN(n);
  const maj = (type === 'sh' ? SH_MAJ : FL_MAJ)[n];
  const min = (type === 'sh' ? SH_MIN : FL_MIN)[n];
  return {
    type,
    n,
    sign: SIGN[type],
    maj,
    min,
    tonicMaj: maj,
    tonicMin: min,
    letters: (type === 'sh' ? SH_ORDER : FL_ORDER).slice(0, n),
  };
}

/* ---------- 认音 ---------- */

export interface NoteInfo {
  /** 音名字母（大写） */
  letter: string;
  /** 八度 */
  oct: number;
  /** 调号带来的实际记号：1=升、-1=降、0=原位 */
  acc: 1 | 0 | -1;
  /** 在该调号大调中的音级 1..7 */
  deg: number;
  /** 位置直读：第1线 / 第1间 / … / 第5线 */
  posName: string;
}

/**
 * 认音：给定 step（0=第1线 … 8=第5线）、调号、谱号，返回实际演奏音。
 * 逻辑照搬旧版单文件训练器 noteInfo()。
 */
export function noteInfo(step: number, type: SigType, n: number, clef: Clef): NoteInfo {
  if (!Number.isInteger(step) || step < 0 || step > 8) {
    throw new RangeError(`step 必须是 0..8 的整数，收到 ${step}`);
  }
  assertN(n);
  const treble = clef === 'treble';
  const letter = (treble ? T_LET : B_LET)[step];
  const oct = (treble ? T_OCT : B_OCT)[step];
  const order = type === 'sh' ? SH_ORDER : FL_ORDER;
  const altered = order.slice(0, n);
  const idx = altered.indexOf(letter);
  const acc: 1 | 0 | -1 = idx >= 0 ? (type === 'sh' ? 1 : -1) : 0;
  const maj = (type === 'sh' ? SH_MAJ : FL_MAJ)[n];
  const tonicL = maj[0];
  const deg = (((LETTER_INDEX[letter] - LETTER_INDEX[tonicL]) % 7) + 7) % 7 + 1;
  return { letter, oct, acc, deg, posName: POS_NAMES[step] };
}

/* ---------- 直读锚点文案 ---------- */

/**
 * 直读锚点：给「看调号 → 读主音」的口诀文案。
 * - 升号调：「最右升 X♯+半音 = 主音」
 * - 降号调：「倒二降 = 主音」；1♭ 特例「只有 B♭ → F 大调」
 * - 0♯♭：「无升降号 = C 大调」
 * - ask='min' 时附「大调主音下小三度」
 */
export function anchorText(type: SigType, n: number, ask: Ask): string {
  assertN(n);
  const { maj, min } = keyInfo(type, n);
  const tail = ask === 'min' ? `（小调 = 大调主音下小三度 → ${min}）` : '';
  if (n === 0) return `无升降号 = C 大调${tail}`;
  if (type === 'sh') {
    return `最右升 ${SH_ORDER[n - 1]}♯+半音 = 主音 ${maj}${tail}`;
  }
  if (n === 1) return `只有 B♭ → F 大调${tail}`;
  return `倒二降 ${FL_ORDER[n - 2]}♭ = 主音 ${maj}${tail}`;
}
