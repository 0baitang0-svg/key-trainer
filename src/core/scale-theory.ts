/**
 * 调式音阶与顺阶和弦纯函数层：音阶拼写、顺阶三/七和弦（罗马数字标注）、调内变化音。
 * melMin 采用爵士约定（上下行同形）。音名体系与 music-theory.ts / chord-theory.ts 一致。
 * 全部为纯函数，不依赖 DOM，可在 vitest 中直接测试。
 */
import { chordSymbol, noteAbove, pitchNameToLower, pitchNameToString } from './chord-theory';
import type { ChordQuality, ChordSpec, PitchName } from './chord-theory';

export type ScaleKind = 'maj' | 'harmMin' | 'melMin';

/** 各调式 7 级音相对主音的半音数 */
export const SCALE_SEMITONES: Record<ScaleKind, number[]> = {
  maj: [0, 2, 4, 5, 7, 9, 11],
  harmMin: [0, 2, 3, 5, 7, 8, 11],
  melMin: [0, 2, 3, 5, 7, 9, 11],
};

/** 自然小调（调号参照：harmMin / melMin 的变化音以它为基准） */
const NAT_MIN = [0, 2, 3, 5, 7, 8, 10];

/** 音阶某一级的音名 */
export interface DegreeNote {
  /** 级数 1..7 */
  degree: number;
  letter: string;
  acc: number;
}

/** 7 级音名（字母步进 + 目标半音拼写） */
export function scaleNotes(tonic: PitchName, kind: ScaleKind): DegreeNote[] {
  return SCALE_SEMITONES[kind].map((semi, i) => {
    const n = noteAbove(tonic, i, semi);
    return { degree: i + 1, letter: n.letter, acc: n.acc };
  });
}

/** 单级音名（deg 1-7） */
export function degreeNote(tonic: PitchName, kind: ScaleKind, deg: number): DegreeNote {
  if (!Number.isInteger(deg) || deg < 1 || deg > 7) {
    throw new RangeError(`级数 deg 必须是 1..7 的整数，收到 ${deg}`);
  }
  return scaleNotes(tonic, kind)[deg - 1];
}

/* ---------- 顺阶和弦 ---------- */

export type ChordSize = 'triad' | 'seventh';
export type FunctionLabel = 'T' | 'S' | 'D';

/** 级数 → 功能：主 {1,3,6}、下属 {2,4}、属 {5,7} */
const FUNC: FunctionLabel[] = ['T', 'S', 'T', 'S', 'D', 'T', 'D'];

export const FUNC_ZH: Record<FunctionLabel, string> = {
  T: '主功能',
  S: '下属功能',
  D: '属功能',
};

/** 顺阶和弦：级数 + 罗马数字标注 + 和弦 + 符号 + 功能 */
export interface DiatonicChord {
  degree: number;
  roman: string;
  spec: ChordSpec;
  symbol: string;
  func: FunctionLabel;
  funcZh: string;
}

/** 罗马数字标注全表（测试锁死）：三和弦 / 七和弦 */
const ROMAN: Record<ScaleKind, ReadonlyArray<{ triad: string; seventh: string }>> = {
  maj: [
    { triad: 'I', seventh: 'Imaj7' },
    { triad: 'ii', seventh: 'ii7' },
    { triad: 'iii', seventh: 'iii7' },
    { triad: 'IV', seventh: 'IVmaj7' },
    { triad: 'V', seventh: 'V7' },
    { triad: 'vi', seventh: 'vi7' },
    { triad: 'vii°', seventh: 'viiø7' },
  ],
  harmMin: [
    { triad: 'i', seventh: 'i(mMaj7)' },
    { triad: 'ii°', seventh: 'iiø7' },
    { triad: 'III+', seventh: 'III+(maj7)' },
    { triad: 'iv', seventh: 'iv7' },
    { triad: 'V', seventh: 'V7' },
    { triad: 'VI', seventh: 'VImaj7' },
    { triad: 'vii°', seventh: 'vii°7' },
  ],
  melMin: [
    { triad: 'i', seventh: 'i(mMaj7)' },
    { triad: 'ii', seventh: 'ii7' },
    { triad: 'III+', seventh: 'III+(maj7)' },
    { triad: 'IV', seventh: 'IV7' },
    { triad: 'V', seventh: 'V7' },
    { triad: 'vi°', seventh: 'viø7' },
    { triad: 'vii°', seventh: 'viiø7' },
  ],
};

/** 性质对应：罗马数字标注 → 和弦性质（viiø7/iiø7/viø7 → 半减七、i(mMaj7) → 小大七、III+(maj7) → 增大七） */
const TOKEN_QUALITY: Record<string, ChordQuality> = {
  I: 'maj',
  ii: 'min',
  iii: 'min',
  IV: 'maj',
  V: 'maj',
  vi: 'min',
  i: 'min',
  iv: 'min',
  VI: 'maj',
  'vii°': 'dim',
  'ii°': 'dim',
  'vi°': 'dim',
  'III+': 'aug',
  Imaj7: 'maj7',
  IVmaj7: 'maj7',
  VImaj7: 'maj7',
  V7: '7',
  IV7: '7',
  ii7: 'm7',
  iii7: 'm7',
  vi7: 'm7',
  iv7: 'm7',
  'viiø7': 'm7b5',
  'iiø7': 'm7b5',
  'viø7': 'm7b5',
  'vii°7': 'dim7',
  'i(mMaj7)': 'mMaj7',
  'III+(maj7)': 'augMaj7',
};

/** 7 级顺阶和弦（roman 按全表标注，性质按「性质对应」查表） */
export function diatonicChords(tonic: PitchName, kind: ScaleKind, size: ChordSize): DiatonicChord[] {
  return ROMAN[kind].map((row, i) => {
    const degree = i + 1;
    const roman = size === 'triad' ? row.triad : row.seventh;
    const root = degreeNote(tonic, kind, degree);
    const quality = TOKEN_QUALITY[roman];
    const spec: ChordSpec = { root: { letter: root.letter, acc: root.acc }, quality };
    const func = FUNC[i];
    return { degree, roman, spec, symbol: chordSymbol(spec), func, funcZh: FUNC_ZH[func] };
  });
}

/* ---------- 调内变化音 ---------- */

/**
 * 某级音的调内变化音信息：
 * - note：音名显示串（变化音级显式带记号，如 'A♮'）
 * - sign：该音的记号（♯/♭/♮）
 * - altered：是否为超出调号的显式变化（相对同主音自然大/小调）
 */
export interface KeyAlteration {
  degree: number;
  note: string;
  altered: boolean;
  sign: '♯' | '♭' | '♮';
}

function signOf(acc: number): '♯' | '♭' | '♮' {
  return acc > 0 ? '♯' : acc < 0 ? '♭' : '♮';
}

/** 7 级的调内变化音（harmMin/melMin 以自然小调为调号基准） */
export function keyAlterations(tonic: PitchName, kind: ScaleKind): KeyAlteration[] {
  const refSemi = kind === 'maj' ? SCALE_SEMITONES.maj : NAT_MIN;
  return scaleNotes(tonic, kind).map((n, i) => {
    const ref = noteAbove(tonic, i, refSemi[i]);
    const altered = n.acc !== ref.acc;
    const note = n.acc !== 0 ? pitchNameToString({ letter: n.letter, acc: n.acc }) : n.letter + (altered ? '♮' : '');
    return { degree: n.degree, note, altered, sign: signOf(n.acc) };
  });
}

/* ---------- 调名文案 ---------- */

export const SCALE_NAME_ZH: Record<ScaleKind, string> = {
  maj: '大调',
  harmMin: '和声小调',
  melMin: '旋律小调',
};

/** '大调' / '和声小调' / '旋律小调' */
export function scaleLabel(kind: ScaleKind): string {
  return SCALE_NAME_ZH[kind];
}

/** 'D 大调' / 'a 和声小调'（大调主音大写、小调主音小写） */
export function keyLabel(tonic: PitchName, kind: ScaleKind): string {
  const name = kind === 'maj' ? pitchNameToString(tonic) : pitchNameToLower(tonic);
  return `${name} ${scaleLabel(kind)}`;
}
