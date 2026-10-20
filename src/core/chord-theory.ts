/**
 * 和弦乐理纯函数层：音程/符号/中文名数据表 + 按字母步进的和弦拼写 + 符号互转 + 调性归属反查。
 * 音名体系与 music-theory.ts 一致（'F♯'、'B♭' 这类后缀字符），双升/双降写作 𝄪 / 𝄫。
 * 全部为纯函数，不依赖 DOM，可在 vitest 中直接测试。
 */

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
/** 各字母自然音的半音数（C=0） */
const LETTER_SEMI = [0, 2, 4, 5, 7, 9, 11];
const LETTER_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

/** 临时记号字符 → 半音数 */
const ACC_VALUE: Record<string, number> = { '♯': 1, '♭': -1, '𝄪': 2, '𝄫': -2 };

/* ---------- 类型 ---------- */

/**
 * 和弦性质。augMaj7 = 增三 + 大七度（和声/旋律小调 III+(maj7) 用），
 * 补上它全表才闭合。
 */
export type ChordQuality =
  | 'maj'
  | 'min'
  | 'dim'
  | 'aug'
  | 'maj7'
  | '7'
  | 'm7'
  | 'm7b5'
  | 'dim7'
  | 'mMaj7'
  | 'augMaj7';

/** 音名：字母 A-G + 临时升降号（♯=+1 ♭=-1，允许 ±2） */
export interface PitchName {
  letter: string;
  acc: number;
}

/** 和弦 = 根音 + 性质 */
export interface ChordSpec {
  root: PitchName;
  quality: ChordQuality;
}

/** 和弦音程：step 为音级步进（根=0、三度=2、五度=4、七度=6），semi 为根音上方绝对半音 */
export interface ChordInterval {
  step: 0 | 2 | 4 | 6;
  semi: number;
}

/* ---------- 数据表 ---------- */

export const CHORD_INTERVALS: Record<ChordQuality, ChordInterval[]> = {
  maj: [
    { step: 0, semi: 0 },
    { step: 2, semi: 4 },
    { step: 4, semi: 7 },
  ],
  min: [
    { step: 0, semi: 0 },
    { step: 2, semi: 3 },
    { step: 4, semi: 7 },
  ],
  dim: [
    { step: 0, semi: 0 },
    { step: 2, semi: 3 },
    { step: 4, semi: 6 },
  ],
  aug: [
    { step: 0, semi: 0 },
    { step: 2, semi: 4 },
    { step: 4, semi: 8 },
  ],
  maj7: [
    { step: 0, semi: 0 },
    { step: 2, semi: 4 },
    { step: 4, semi: 7 },
    { step: 6, semi: 11 },
  ],
  '7': [
    { step: 0, semi: 0 },
    { step: 2, semi: 4 },
    { step: 4, semi: 7 },
    { step: 6, semi: 10 },
  ],
  m7: [
    { step: 0, semi: 0 },
    { step: 2, semi: 3 },
    { step: 4, semi: 7 },
    { step: 6, semi: 10 },
  ],
  m7b5: [
    { step: 0, semi: 0 },
    { step: 2, semi: 3 },
    { step: 4, semi: 6 },
    { step: 6, semi: 10 },
  ],
  dim7: [
    { step: 0, semi: 0 },
    { step: 2, semi: 3 },
    { step: 4, semi: 6 },
    { step: 6, semi: 9 },
  ],
  mMaj7: [
    { step: 0, semi: 0 },
    { step: 2, semi: 3 },
    { step: 4, semi: 7 },
    { step: 6, semi: 11 },
  ],
  augMaj7: [
    { step: 0, semi: 0 },
    { step: 2, semi: 4 },
    { step: 4, semi: 8 },
    { step: 6, semi: 11 },
  ],
};

export const CHORD_SYMBOL: Record<ChordQuality, string> = {
  maj: '',
  min: 'm',
  dim: '°',
  aug: '+',
  maj7: 'maj7',
  '7': '7',
  m7: 'm7',
  m7b5: 'm7♭5',
  dim7: '°7',
  mMaj7: 'mMaj7',
  augMaj7: '+maj7',
};

export const CHORD_NAME_ZH: Record<ChordQuality, string> = {
  maj: '大三和弦',
  min: '小三和弦',
  dim: '减三和弦',
  aug: '增三和弦',
  maj7: '大七和弦',
  '7': '属七（大小七）和弦',
  m7: '小七和弦',
  m7b5: '半减七和弦',
  dim7: '减七和弦',
  mMaj7: '小大七和弦',
  augMaj7: '增大七和弦',
};

const CHORD_QUALITIES = Object.keys(CHORD_SYMBOL) as ChordQuality[];

/* ---------- 音名拼写 ---------- */

function letterIndex(letter: string): number {
  const i = LETTER_INDEX[letter];
  if (i === undefined) {
    throw new RangeError(`音名字母必须是 A-G，收到 ${letter}`);
  }
  return i;
}

function accStr(acc: number): string {
  if (acc === 0) return '';
  if (acc === 1) return '♯';
  if (acc === -1) return '♭';
  if (acc === 2) return '𝄪';
  if (acc === -2) return '𝄫';
  throw new RangeError(`临时升降号 acc 必须是 -2..2 的整数，收到 ${acc}`);
}

/** 音名 → 显示串：'C'、'F♯'、'B♭'、'C𝄪' */
export function pitchNameToString(p: PitchName): string {
  return p.letter + accStr(p.acc);
}

/** 小写主音显示串（小调主音用）：'c'、'f♯'、'b♭' */
export function pitchNameToLower(p: PitchName): string {
  return p.letter.toLowerCase() + accStr(p.acc);
}

/** 目标半音相对该字母自然音所需的临时升降号（归一到 -6..6，正常拼写落在 ±2） */
function accFor(target: number, natural: number): number {
  let d = (((target - natural) % 12) + 12) % 12;
  if (d > 6) d -= 12;
  return d;
}

/**
 * 按字母步进拼写：root 的字母前进 letterSteps 个、音高高 semi 个半音处的音名。
 * 临时升降号由目标半音差算出，超过 ±2 视为无法拼写。
 */
export function noteAbove(root: PitchName, letterSteps: number, semi: number): PitchName {
  const i0 = letterIndex(root.letter);
  const li = (((i0 + letterSteps) % 7) + 7) % 7;
  const rootPc = (((LETTER_SEMI[i0] + root.acc) % 12) + 12) % 12;
  const target = (((rootPc + semi) % 12) + 12) % 12;
  const acc = accFor(target, LETTER_SEMI[li]);
  if (acc < -2 || acc > 2) {
    throw new RangeError(`${pitchNameToString(root)} 上方 ${semi} 半音（字母 +${letterSteps}）无法拼写（acc=${acc}）`);
  }
  return { letter: LETTERS[li], acc };
}

/* ---------- 和弦拼写 / 符号 / 音级集合 ---------- */

/**
 * 按字母步进拼写和弦：根→三度→五度→七度 = 字母 +2，acc 由目标半音差算出（允许 ±2）。
 * 例：A♯ 大三 = A♯ C𝄪 E♯；B 减七 = B D F A♭；C♯ dim7 = C♯ E G B♭。
 */
export function spellChord(spec: ChordSpec): PitchName[] {
  return CHORD_INTERVALS[spec.quality].map(({ step, semi }) => noteAbove(spec.root, step, semi));
}

/** 和弦符号：'G7'、'Cm7'、'B°7'、'Bm7♭5'（大三和弦只有根音，如 'C'） */
export function chordSymbol(spec: ChordSpec): string {
  return pitchNameToString(spec.root) + CHORD_SYMBOL[spec.quality];
}

/** 和弦的 pitch class 集合（0-11，按 根→三→五→七 顺序） */
export function chordPcSet(spec: ChordSpec): number[] {
  const i0 = letterIndex(spec.root.letter);
  const rootPc = (((LETTER_SEMI[i0] + spec.root.acc) % 12) + 12) % 12;
  return CHORD_INTERVALS[spec.quality].map(({ semi }) => (((rootPc + semi) % 12) + 12) % 12);
}

/** chordSymbol 逆操作：解析成根音 + 性质；无法解析返回 null */
export function parseChordSymbol(s: string): ChordSpec | null {
  const m = /^([A-G])([♯♭𝄪𝄫]*)(.*)$/u.exec(s);
  if (!m) return null;
  const [, letter, accPart, rest] = m;
  let acc = 0;
  for (const ch of accPart) {
    acc += ACC_VALUE[ch];
  }
  if (acc < -2 || acc > 2) return null;
  for (const q of CHORD_QUALITIES) {
    if (CHORD_SYMBOL[q] === rest) return { root: { letter, acc }, quality: q };
  }
  return null;
}

/* ---------- 调性归属反查 ---------- */

/** 和弦归属的调：主音 + 大/小调 + 显示标签 */
export interface KeyAttribution {
  tonic: PitchName;
  mode: 'maj' | 'min';
  label: string;
}

function keyLabelOf(tonic: PitchName, mode: 'maj' | 'min'): string {
  return `${mode === 'maj' ? pitchNameToString(tonic) : pitchNameToLower(tonic)} ${mode === 'maj' ? '大调' : '小调'}`;
}

/** 纯五度下行拼写：字母 -4（≡ +3）、半音 -7 */
function fifthBelow(p: PitchName): PitchName {
  return noteAbove(p, 3, 5);
}

/** 纯五度上行拼写：字母 +4、半音 +7 */
function fifthAbove(p: PitchName): PitchName {
  return noteAbove(p, 4, 7);
}

/**
 * 属七和弦归属反查：主音 = 根音下行纯五度，返回 [该大调, 其同名小调]。
 * 例：G7 → ['C 大调','c 小调']；F♯7 → ['B 大调','b 小调']。非属七返回空表。
 */
export function dominantKeys(spec: ChordSpec): KeyAttribution[] {
  if (spec.quality !== '7') return [];
  const tonic = fifthBelow(spec.root);
  return [
    { tonic, mode: 'maj', label: keyLabelOf(tonic, 'maj') },
    { tonic, mode: 'min', label: keyLabelOf(tonic, 'min') },
  ];
}

/**
 * 导七（减七）和弦归属反查：主音 = 根音上行小二度的和声小调。
 * 例：B°7 → ['c 和声小调']。非减七返回空表。
 */
export function leadingToneDimKeys(spec: ChordSpec): KeyAttribution[] {
  if (spec.quality !== 'dim7') return [];
  const tonic = noteAbove(spec.root, 1, 1);
  return [{ tonic, mode: 'min', label: `${pitchNameToLower(tonic)} 和声小调` }];
}

/** 给调出属七和弦：根音 = 主音上行纯五度（与 dominantKeys 互逆） */
export function dominantOf(tonic: PitchName, _mode: 'maj' | 'min'): ChordSpec {
  return { root: fifthAbove(tonic), quality: '7' };
}
