import { describe, expect, it } from 'vitest';
import { chordSymbol, pitchNameToString, spellChord } from '../src/core/chord-theory';
import type { ChordQuality, PitchName } from '../src/core/chord-theory';
import {
  degreeNote,
  diatonicChords,
  keyAlterations,
  keyLabel,
  scaleLabel,
  scaleNotes,
} from '../src/core/scale-theory';
import type { DegreeNote, FunctionLabel, ScaleKind } from '../src/core/scale-theory';

const C: PitchName = { letter: 'C', acc: 0 };
const A: PitchName = { letter: 'A', acc: 0 };

function name(n: DegreeNote | PitchName): string {
  return pitchNameToString({ letter: n.letter, acc: n.acc });
}

function parseNote(s: string): PitchName {
  const rest = s.slice(1);
  const acc = rest === '♯' ? 1 : rest === '♭' ? -1 : rest === '𝄪' ? 2 : rest === '𝄫' ? -2 : 0;
  return { letter: s[0], acc };
}

/* ---------- 顺阶和弦全表（roman 与组成音测试锁死，期望值独立硬编码） ---------- */

interface Row {
  degree: number;
  func: FunctionLabel;
  triadRoman: string;
  triadQuality: ChordQuality;
  triadNotes: string;
  seventhRoman: string;
  seventhQuality: ChordQuality;
  seventhNotes: string;
}

const TABLE: Array<{ kind: ScaleKind; tonic: PitchName; rows: Row[] }> = [
  {
    kind: 'maj',
    tonic: C,
    rows: [
      { degree: 1, func: 'T', triadRoman: 'I', triadQuality: 'maj', triadNotes: 'C E G', seventhRoman: 'Imaj7', seventhQuality: 'maj7', seventhNotes: 'C E G B' },
      { degree: 2, func: 'S', triadRoman: 'ii', triadQuality: 'min', triadNotes: 'D F A', seventhRoman: 'ii7', seventhQuality: 'm7', seventhNotes: 'D F A C' },
      { degree: 3, func: 'T', triadRoman: 'iii', triadQuality: 'min', triadNotes: 'E G B', seventhRoman: 'iii7', seventhQuality: 'm7', seventhNotes: 'E G B D' },
      { degree: 4, func: 'S', triadRoman: 'IV', triadQuality: 'maj', triadNotes: 'F A C', seventhRoman: 'IVmaj7', seventhQuality: 'maj7', seventhNotes: 'F A C E' },
      { degree: 5, func: 'D', triadRoman: 'V', triadQuality: 'maj', triadNotes: 'G B D', seventhRoman: 'V7', seventhQuality: '7', seventhNotes: 'G B D F' },
      { degree: 6, func: 'T', triadRoman: 'vi', triadQuality: 'min', triadNotes: 'A C E', seventhRoman: 'vi7', seventhQuality: 'm7', seventhNotes: 'A C E G' },
      { degree: 7, func: 'D', triadRoman: 'vii°', triadQuality: 'dim', triadNotes: 'B D F', seventhRoman: 'viiø7', seventhQuality: 'm7b5', seventhNotes: 'B D F A' },
    ],
  },
  {
    kind: 'harmMin',
    tonic: A,
    rows: [
      { degree: 1, func: 'T', triadRoman: 'i', triadQuality: 'min', triadNotes: 'A C E', seventhRoman: 'i(mMaj7)', seventhQuality: 'mMaj7', seventhNotes: 'A C E G♯' },
      { degree: 2, func: 'S', triadRoman: 'ii°', triadQuality: 'dim', triadNotes: 'B D F', seventhRoman: 'iiø7', seventhQuality: 'm7b5', seventhNotes: 'B D F A' },
      { degree: 3, func: 'T', triadRoman: 'III+', triadQuality: 'aug', triadNotes: 'C E G♯', seventhRoman: 'III+(maj7)', seventhQuality: 'augMaj7', seventhNotes: 'C E G♯ B' },
      { degree: 4, func: 'S', triadRoman: 'iv', triadQuality: 'min', triadNotes: 'D F A', seventhRoman: 'iv7', seventhQuality: 'm7', seventhNotes: 'D F A C' },
      { degree: 5, func: 'D', triadRoman: 'V', triadQuality: 'maj', triadNotes: 'E G♯ B', seventhRoman: 'V7', seventhQuality: '7', seventhNotes: 'E G♯ B D' },
      { degree: 6, func: 'T', triadRoman: 'VI', triadQuality: 'maj', triadNotes: 'F A C', seventhRoman: 'VImaj7', seventhQuality: 'maj7', seventhNotes: 'F A C E' },
      { degree: 7, func: 'D', triadRoman: 'vii°', triadQuality: 'dim', triadNotes: 'G♯ B D', seventhRoman: 'vii°7', seventhQuality: 'dim7', seventhNotes: 'G♯ B D F' },
    ],
  },
  {
    kind: 'melMin',
    tonic: A,
    rows: [
      { degree: 1, func: 'T', triadRoman: 'i', triadQuality: 'min', triadNotes: 'A C E', seventhRoman: 'i(mMaj7)', seventhQuality: 'mMaj7', seventhNotes: 'A C E G♯' },
      { degree: 2, func: 'S', triadRoman: 'ii', triadQuality: 'min', triadNotes: 'B D F♯', seventhRoman: 'ii7', seventhQuality: 'm7', seventhNotes: 'B D F♯ A' },
      { degree: 3, func: 'T', triadRoman: 'III+', triadQuality: 'aug', triadNotes: 'C E G♯', seventhRoman: 'III+(maj7)', seventhQuality: 'augMaj7', seventhNotes: 'C E G♯ B' },
      // 第 4 级七和弦按三度叠置 = IV7（D F♯ A C，属七性质）——爵士旋律小调标准表
      { degree: 4, func: 'S', triadRoman: 'IV', triadQuality: 'maj', triadNotes: 'D F♯ A', seventhRoman: 'IV7', seventhQuality: '7', seventhNotes: 'D F♯ A C' },
      { degree: 5, func: 'D', triadRoman: 'V', triadQuality: 'maj', triadNotes: 'E G♯ B', seventhRoman: 'V7', seventhQuality: '7', seventhNotes: 'E G♯ B D' },
      { degree: 6, func: 'T', triadRoman: 'vi°', triadQuality: 'dim', triadNotes: 'F♯ A C', seventhRoman: 'viø7', seventhQuality: 'm7b5', seventhNotes: 'F♯ A C E' },
      { degree: 7, func: 'D', triadRoman: 'vii°', triadQuality: 'dim', triadNotes: 'G♯ B D', seventhRoman: 'viiø7', seventhQuality: 'm7b5', seventhNotes: 'G♯ B D F♯' },
    ],
  },
];

const FUNC_ZH: Record<FunctionLabel, string> = { T: '主功能', S: '下属功能', D: '属功能' };

describe('diatonicChords：三调式 × 7 级 × triad/seventh 全表断言', () => {
  for (const { kind, tonic, rows } of TABLE) {
    for (const size of ['triad', 'seventh'] as const) {
      it(`${kind} ${size}：roman / 性质 / 组成音 / 功能`, () => {
        const chords = diatonicChords(tonic, kind, size);
        expect(chords).toHaveLength(7);
        expect(chords.map((c) => c.roman)).toEqual(rows.map((r) => (size === 'triad' ? r.triadRoman : r.seventhRoman)));
        expect(chords.map((c) => c.spec.quality)).toEqual(rows.map((r) => (size === 'triad' ? r.triadQuality : r.seventhQuality)));
        expect(chords.map((c) => spellChord(c.spec).map(pitchNameToString).join(' '))).toEqual(
          rows.map((r) => (size === 'triad' ? r.triadNotes : r.seventhNotes)),
        );
        expect(chords.map((c) => c.func)).toEqual(rows.map((r) => r.func));
        expect(chords.map((c) => c.funcZh)).toEqual(rows.map((r) => FUNC_ZH[r.func]));
        expect(chords.map((c) => c.degree)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      });
    }
  }

  it('spec.root = 该级音名；symbol = chordSymbol(spec)', () => {
    for (const { kind, tonic, rows } of TABLE) {
      for (const size of ['triad', 'seventh'] as const) {
        const chords = diatonicChords(tonic, kind, size);
        chords.forEach((c, i) => {
          const notes = size === 'triad' ? rows[i].triadNotes : rows[i].seventhNotes;
          expect(c.spec.root).toEqual(parseNote(notes.split(' ')[0]));
          expect(c.symbol).toBe(chordSymbol(c.spec));
        });
      }
    }
  });
});

/* ---------- 举例逐条 ---------- */

describe('举例断言', () => {
  it('a 和声小调 V = E 大三（E G♯ B）', () => {
    const v = diatonicChords(A, 'harmMin', 'triad')[4];
    expect(v.roman).toBe('V');
    expect(v.spec).toEqual({ root: { letter: 'E', acc: 0 }, quality: 'maj' });
    expect(spellChord(v.spec).map(pitchNameToString).join(' ')).toBe('E G♯ B');
    expect(v.symbol).toBe('E');
  });

  it('a 和声小调 vii°7 = G♯ B D F（全减）；c 和声小调 vii°7 = B D F A♭（全减）', () => {
    const a = diatonicChords(A, 'harmMin', 'seventh')[6];
    expect(a.roman).toBe('vii°7');
    expect(a.spec.quality).toBe('dim7');
    expect(spellChord(a.spec).map(pitchNameToString).join(' ')).toBe('G♯ B D F');

    const c = diatonicChords(C, 'harmMin', 'seventh')[6];
    expect(c.roman).toBe('vii°7');
    expect(spellChord(c.spec).map(pitchNameToString).join(' ')).toBe('B D F A♭');
    expect(c.symbol).toBe('B°7');
  });

  it('C 大调 viiø7 = B D F A（半减）', () => {
    const vii = diatonicChords(C, 'maj', 'seventh')[6];
    expect(vii.roman).toBe('viiø7');
    expect(vii.spec).toEqual({ root: { letter: 'B', acc: 0 }, quality: 'm7b5' });
    expect(spellChord(vii.spec).map(pitchNameToString).join(' ')).toBe('B D F A');
    expect(vii.symbol).toBe('Bm7♭5');
  });

  it('a 旋律小调 IV = D 大三（D F♯ A）、V7 = E7（E G♯ B D）', () => {
    const iv = diatonicChords(A, 'melMin', 'triad')[3];
    expect(iv.roman).toBe('IV');
    expect(spellChord(iv.spec).map(pitchNameToString).join(' ')).toBe('D F♯ A');

    const v7 = diatonicChords(A, 'melMin', 'seventh')[4];
    expect(v7.roman).toBe('V7');
    expect(v7.spec).toEqual({ root: { letter: 'E', acc: 0 }, quality: '7' });
    expect(spellChord(v7.spec).map(pitchNameToString).join(' ')).toBe('E G♯ B D');
    expect(v7.symbol).toBe('E7');
  });

  it('a 旋律小调 vi° = F♯°（F♯ A C）、III+ = C+（C E G♯）', () => {
    const vi = diatonicChords(A, 'melMin', 'triad')[5];
    expect(vi.roman).toBe('vi°');
    expect(vi.spec).toEqual({ root: { letter: 'F', acc: 1 }, quality: 'dim' });
    expect(spellChord(vi.spec).map(pitchNameToString).join(' ')).toBe('F♯ A C');
    expect(vi.symbol).toBe('F♯°');

    const iii = diatonicChords(A, 'melMin', 'triad')[2];
    expect(iii.roman).toBe('III+');
    expect(iii.spec).toEqual({ root: { letter: 'C', acc: 0 }, quality: 'aug' });
    expect(spellChord(iii.spec).map(pitchNameToString).join(' ')).toBe('C E G♯');
    expect(iii.symbol).toBe('C+');
  });

  it('a 旋律小调 i = Am(maj7)（A C E G♯）', () => {
    const i = diatonicChords(A, 'melMin', 'seventh')[0];
    expect(i.roman).toBe('i(mMaj7)');
    expect(i.spec).toEqual({ root: { letter: 'A', acc: 0 }, quality: 'mMaj7' });
    expect(spellChord(i.spec).map(pitchNameToString).join(' ')).toBe('A C E G♯');
    expect(i.symbol).toBe('AmMaj7');
    expect(i.func).toBe('T');
    expect(i.funcZh).toBe('主功能');
  });
});

/* ---------- 音阶拼写 ---------- */

describe('scaleNotes / degreeNote：7 级音名（字母步进 + 目标半音）', () => {
  it('a 和声小调 = A B C D E F G♯；a 旋律小调 = A B C D E F♯ G♯', () => {
    expect(scaleNotes(A, 'harmMin').map(name).join(' ')).toBe('A B C D E F G♯');
    expect(scaleNotes(A, 'melMin').map(name).join(' ')).toBe('A B C D E F♯ G♯');
    expect(scaleNotes(C, 'melMin').map(name).join(' ')).toBe('C D E♭ F G A B');
  });

  it('C 大调 = C D E F G A B；E♭ 大调 = E♭ F G A♭ B♭ C D；F♯ 大调 = F♯ G♯ A♯ B C♯ D♯ E♯', () => {
    expect(scaleNotes(C, 'maj').map(name).join(' ')).toBe('C D E F G A B');
    expect(scaleNotes({ letter: 'E', acc: -1 }, 'maj').map(name).join(' ')).toBe('E♭ F G A♭ B♭ C D');
    expect(scaleNotes({ letter: 'F', acc: 1 }, 'maj').map(name).join(' ')).toBe('F♯ G♯ A♯ B C♯ D♯ E♯');
  });

  it('级数 degree = 1..7', () => {
    for (const kind of ['maj', 'harmMin', 'melMin'] as const) {
      expect(scaleNotes(A, kind).map((n) => n.degree)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    }
  });

  it('degreeNote 单级取音（deg 1-7）', () => {
    expect(degreeNote(C, 'maj', 7)).toEqual({ degree: 7, letter: 'B', acc: 0 });
    expect(degreeNote(A, 'melMin', 6)).toEqual({ degree: 6, letter: 'F', acc: 1 });
    expect(degreeNote({ letter: 'E', acc: -1 }, 'harmMin', 2)).toEqual({ degree: 2, letter: 'F', acc: 0 });
  });

  it('deg 越界抛 RangeError', () => {
    expect(() => degreeNote(C, 'maj', 0)).toThrow(RangeError);
    expect(() => degreeNote(C, 'maj', 8)).toThrow(RangeError);
    expect(() => degreeNote(C, 'maj', 1.5)).toThrow(RangeError);
  });
});

/* ---------- 调内变化音 ---------- */

describe('keyAlterations：调内变化音（相对同主音自然大/小调）', () => {
  it('D 大调：第 3 级 F♯、第 7 级 C♯（altered=false）', () => {
    expect(keyAlterations({ letter: 'D', acc: 0 }, 'maj')).toEqual([
      { degree: 1, note: 'D', altered: false, sign: '♮' },
      { degree: 2, note: 'E', altered: false, sign: '♮' },
      { degree: 3, note: 'F♯', altered: false, sign: '♯' },
      { degree: 4, note: 'G', altered: false, sign: '♮' },
      { degree: 5, note: 'A', altered: false, sign: '♮' },
      { degree: 6, note: 'B', altered: false, sign: '♮' },
      { degree: 7, note: 'C♯', altered: false, sign: '♯' },
    ]);
  });

  it('a 和声小调：第 7 级 G♯（altered=true）', () => {
    expect(keyAlterations(A, 'harmMin')).toEqual([
      { degree: 1, note: 'A', altered: false, sign: '♮' },
      { degree: 2, note: 'B', altered: false, sign: '♮' },
      { degree: 3, note: 'C', altered: false, sign: '♮' },
      { degree: 4, note: 'D', altered: false, sign: '♮' },
      { degree: 5, note: 'E', altered: false, sign: '♮' },
      { degree: 6, note: 'F', altered: false, sign: '♮' },
      { degree: 7, note: 'G♯', altered: true, sign: '♯' },
    ]);
  });

  it('c 旋律小调：第 6 级 A♮、第 7 级 B♮（altered=true）', () => {
    expect(keyAlterations(C, 'melMin')).toEqual([
      { degree: 1, note: 'C', altered: false, sign: '♮' },
      { degree: 2, note: 'D', altered: false, sign: '♮' },
      { degree: 3, note: 'E♭', altered: false, sign: '♭' },
      { degree: 4, note: 'F', altered: false, sign: '♮' },
      { degree: 5, note: 'G', altered: false, sign: '♮' },
      { degree: 6, note: 'A♮', altered: true, sign: '♮' },
      { degree: 7, note: 'B♮', altered: true, sign: '♮' },
    ]);
  });
});

/* ---------- 调名文案 ---------- */

describe('scaleLabel / keyLabel', () => {
  it("scaleLabel：'大调' / '和声小调' / '旋律小调'", () => {
    expect(scaleLabel('maj')).toBe('大调');
    expect(scaleLabel('harmMin')).toBe('和声小调');
    expect(scaleLabel('melMin')).toBe('旋律小调');
  });

  it("keyLabel：'D 大调' / 'a 和声小调'（大写大调、小写小调）", () => {
    expect(keyLabel({ letter: 'D', acc: 0 }, 'maj')).toBe('D 大调');
    expect(keyLabel(A, 'harmMin')).toBe('a 和声小调');
    expect(keyLabel({ letter: 'F', acc: 1 }, 'melMin')).toBe('f♯ 旋律小调');
    expect(keyLabel({ letter: 'B', acc: -1 }, 'harmMin')).toBe('b♭ 和声小调');
    expect(keyLabel(C, 'maj')).toBe('C 大调');
  });
});
