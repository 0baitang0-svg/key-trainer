import { describe, expect, it } from 'vitest';
import {
  CHORD_INTERVALS,
  CHORD_NAME_ZH,
  CHORD_SYMBOL,
  chordPcSet,
  chordSymbol,
  dominantKeys,
  dominantOf,
  leadingToneDimKeys,
  parseChordSymbol,
  pitchNameToString,
  spellChord,
} from '../src/core/chord-theory';
import type { ChordQuality, ChordSpec, PitchName } from '../src/core/chord-theory';

const QUALITIES: ChordQuality[] = [
  'maj',
  'min',
  'dim',
  'aug',
  'maj7',
  '7',
  'm7',
  'm7b5',
  'dim7',
  'mMaj7',
  'augMaj7',
];

const spell = (spec: ChordSpec): string => spellChord(spec).map(pitchNameToString).join(' ');

/* ---------- 数据表锁死 ---------- */

describe('数据表：音程 / 符号 / 中文名（数值不许改动）', () => {
  it('CHORD_INTERVALS（step 音级步进 + semi 根音上方半音）', () => {
    expect(CHORD_INTERVALS).toEqual({
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
    });
  });

  it('CHORD_SYMBOL / CHORD_NAME_ZH', () => {
    expect(CHORD_SYMBOL).toEqual({
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
    });
    expect(CHORD_NAME_ZH).toEqual({
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
    });
  });

  it('CHORD_INTERVALS 的 step 按 音级步进取值（根=0 三度=2 五度=4 七度=6）', () => {
    for (const q of QUALITIES) {
      const steps = CHORD_INTERVALS[q].map((iv) => iv.step);
      expect(steps).toEqual(q === 'maj' || q === 'min' || q === 'dim' || q === 'aug' ? [0, 2, 4] : [0, 2, 4, 6]);
      expect(CHORD_INTERVALS[q][0]).toEqual({ step: 0, semi: 0 });
    }
  });
});

/* ---------- spellChord 逐音断言（期望值独立硬编码） ---------- */

interface RootCase {
  label: string;
  root: PitchName;
  notes: Record<ChordQuality, string>;
}

const SPELL: RootCase[] = [
  {
    label: 'C',
    root: { letter: 'C', acc: 0 },
    notes: {
      maj: 'C E G',
      min: 'C E♭ G',
      dim: 'C E♭ G♭',
      aug: 'C E G♯',
      maj7: 'C E G B',
      '7': 'C E G B♭',
      m7: 'C E♭ G B♭',
      m7b5: 'C E♭ G♭ B♭',
      dim7: 'C E♭ G♭ B𝄫',
      mMaj7: 'C E♭ G B',
      augMaj7: 'C E G♯ B',
    },
  },
  {
    label: 'E♭',
    root: { letter: 'E', acc: -1 },
    notes: {
      maj: 'E♭ G B♭',
      min: 'E♭ G♭ B♭',
      dim: 'E♭ G♭ B𝄫',
      aug: 'E♭ G B',
      maj7: 'E♭ G B♭ D',
      '7': 'E♭ G B♭ D♭',
      m7: 'E♭ G♭ B♭ D♭',
      m7b5: 'E♭ G♭ B𝄫 D♭',
      dim7: 'E♭ G♭ B𝄫 D𝄫',
      mMaj7: 'E♭ G♭ B♭ D',
      augMaj7: 'E♭ G B D',
    },
  },
  {
    label: 'B',
    root: { letter: 'B', acc: 0 },
    notes: {
      maj: 'B D♯ F♯',
      min: 'B D F♯',
      dim: 'B D F',
      aug: 'B D♯ F𝄪',
      maj7: 'B D♯ F♯ A♯',
      '7': 'B D♯ F♯ A',
      m7: 'B D F♯ A',
      m7b5: 'B D F A',
      dim7: 'B D F A♭',
      mMaj7: 'B D F♯ A♯',
      augMaj7: 'B D♯ F𝄪 A♯',
    },
  },
  {
    label: 'C♯',
    root: { letter: 'C', acc: 1 },
    notes: {
      maj: 'C♯ E♯ G♯',
      min: 'C♯ E G♯',
      dim: 'C♯ E G',
      aug: 'C♯ E♯ G𝄪',
      maj7: 'C♯ E♯ G♯ B♯',
      '7': 'C♯ E♯ G♯ B',
      m7: 'C♯ E G♯ B',
      m7b5: 'C♯ E G B',
      dim7: 'C♯ E G B♭',
      mMaj7: 'C♯ E G♯ B♯',
      augMaj7: 'C♯ E♯ G𝄪 B♯',
    },
  },
  {
    label: 'F♯',
    root: { letter: 'F', acc: 1 },
    notes: {
      maj: 'F♯ A♯ C♯',
      min: 'F♯ A C♯',
      dim: 'F♯ A C',
      aug: 'F♯ A♯ C𝄪',
      maj7: 'F♯ A♯ C♯ E♯',
      '7': 'F♯ A♯ C♯ E',
      m7: 'F♯ A C♯ E',
      m7b5: 'F♯ A C E',
      dim7: 'F♯ A C E♭',
      mMaj7: 'F♯ A C♯ E♯',
      augMaj7: 'F♯ A♯ C𝄪 E♯',
    },
  },
];

describe('spellChord：11 种性质 × 5 个根音逐音断言（字母步进拼写）', () => {
  for (const { label, root, notes } of SPELL) {
    describe(`根音 ${label}`, () => {
      for (const q of QUALITIES) {
        it(`${q} = ${notes[q]}`, () => {
          expect(spell({ root, quality: q })).toBe(notes[q]);
        });
      }
    });
  }

  it('任务举例：A♯ 大三 = A♯ C𝄪 E♯；B 减七 = B D F A♭；C♯ dim7 = C♯ E G B♭', () => {
    expect(spell({ root: { letter: 'A', acc: 1 }, quality: 'maj' })).toBe('A♯ C𝄪 E♯');
    expect(spell({ root: { letter: 'B', acc: 0 }, quality: 'dim7' })).toBe('B D F A♭');
    expect(spell({ root: { letter: 'C', acc: 1 }, quality: 'dim7' })).toBe('C♯ E G B♭');
  });

  it('拼写按字母步进（三度字母 +2、五度 +4、七度 +6），acc 由目标半音差算出', () => {
    for (const { root } of SPELL) {
      for (const q of QUALITIES) {
        const notes = spellChord({ root, quality: q });
        const steps = CHORD_INTERVALS[q].map((iv) => iv.step);
        for (let k = 0; k < notes.length; k++) {
          const expected = String.fromCharCode(((root.letter.charCodeAt(0) - 65 + steps[k]) % 7) + 65);
          expect(notes[k].letter).toBe(expected);
          expect(Math.abs(notes[k].acc)).toBeLessThanOrEqual(2);
        }
      }
    }
  });
});

/* ---------- chordSymbol / parseChordSymbol / chordPcSet ---------- */

describe('chordSymbol：和弦符号', () => {
  it('任务举例：G7 / Cm7 / B°7 / Bm7♭5', () => {
    expect(chordSymbol({ root: { letter: 'G', acc: 0 }, quality: '7' })).toBe('G7');
    expect(chordSymbol({ root: { letter: 'C', acc: 0 }, quality: 'm7' })).toBe('Cm7');
    expect(chordSymbol({ root: { letter: 'B', acc: 0 }, quality: 'dim7' })).toBe('B°7');
    expect(chordSymbol({ root: { letter: 'B', acc: 0 }, quality: 'm7b5' })).toBe('Bm7♭5');
  });

  it('各性质符号 = 根音 + CHORD_SYMBOL（大三只有根音）', () => {
    for (const q of QUALITIES) {
      expect(chordSymbol({ root: { letter: 'E', acc: -1 }, quality: q })).toBe('E♭' + CHORD_SYMBOL[q]);
    }
    expect(chordSymbol({ root: { letter: 'C', acc: 0 }, quality: 'maj' })).toBe('C');
    expect(chordSymbol({ root: { letter: 'F', acc: 1 }, quality: 'augMaj7' })).toBe('F♯+maj7');
  });
});

describe('parseChordSymbol：chordSymbol 逆操作', () => {
  it('11 种性质 × 5 个根音往返一致', () => {
    for (const { root } of SPELL) {
      for (const q of QUALITIES) {
        const spec: ChordSpec = { root, quality: q };
        const s = chordSymbol(spec);
        expect(parseChordSymbol(s)).toEqual(spec);
      }
    }
  });

  it('带临时记号的根音往返：C♯7 / E♭maj7 / A𝄪 / B𝄫m7', () => {
    expect(parseChordSymbol('C♯7')).toEqual({ root: { letter: 'C', acc: 1 }, quality: '7' });
    expect(parseChordSymbol('E♭maj7')).toEqual({ root: { letter: 'E', acc: -1 }, quality: 'maj7' });
    expect(parseChordSymbol('A𝄪')).toEqual({ root: { letter: 'A', acc: 2 }, quality: 'maj' });
    expect(parseChordSymbol('B𝄫m7')).toEqual({ root: { letter: 'B', acc: -2 }, quality: 'm7' });
  });

  it('非法输入返回 null', () => {
    for (const bad of ['', 'H7', 'm7', '7', 'c7', 'C7x', 'C7maj', 'Gø7', 'Cm7♭', 'C♯♯♯7', '𝄪7']) {
      expect(parseChordSymbol(bad)).toBeNull();
    }
  });
});

describe('chordPcSet：pitch class 集合', () => {
  it('C maj7 = [0,4,7,11]；G7 = [7,11,2,5]；B dim7 = [11,2,5,8]；C♯ dim7 = [1,4,7,10]', () => {
    expect(chordPcSet({ root: { letter: 'C', acc: 0 }, quality: 'maj7' })).toEqual([0, 4, 7, 11]);
    expect(chordPcSet({ root: { letter: 'G', acc: 0 }, quality: '7' })).toEqual([7, 11, 2, 5]);
    expect(chordPcSet({ root: { letter: 'B', acc: 0 }, quality: 'dim7' })).toEqual([11, 2, 5, 8]);
    expect(chordPcSet({ root: { letter: 'C', acc: 1 }, quality: 'dim7' })).toEqual([1, 4, 7, 10]);
  });

  it('与 spellChord 的音名半音一致', () => {
    const NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as Record<string, number>;
    for (const { root } of SPELL) {
      for (const q of QUALITIES) {
        const spec = { root, quality: q };
        const byName = spellChord(spec).map((p) => (((NAT[p.letter] + p.acc) % 12) + 12) % 12);
        expect(chordPcSet(spec)).toEqual(byName);
      }
    }
  });
});

/* ---------- 调性归属反查 ---------- */

describe('dominantKeys：属七和弦归属（大调 + 同名小调）', () => {
  it('G7 → C 大调 / c 小调；F♯7 → B 大调 / b 小调', () => {
    const g = dominantKeys({ root: { letter: 'G', acc: 0 }, quality: '7' });
    expect(g.map((k) => k.label)).toEqual(['C 大调', 'c 小调']);
    expect(g.map((k) => k.mode)).toEqual(['maj', 'min']);
    expect(g[0].tonic).toEqual({ letter: 'C', acc: 0 });
    expect(g[1].tonic).toEqual({ letter: 'C', acc: 0 });

    const fs = dominantKeys({ root: { letter: 'F', acc: 1 }, quality: '7' });
    expect(fs.map((k) => k.label)).toEqual(['B 大调', 'b 小调']);
    expect(fs[0].tonic).toEqual({ letter: 'B', acc: 0 });
  });

  it('E♭7 → A♭ 大调 / a♭ 小调；C7 → F 大调 / f 小调', () => {
    const ef = dominantKeys({ root: { letter: 'E', acc: -1 }, quality: '7' });
    expect(ef.map((k) => k.label)).toEqual(['A♭ 大调', 'a♭ 小调']);
    expect(ef[0].tonic).toEqual({ letter: 'A', acc: -1 });

    const c = dominantKeys({ root: { letter: 'C', acc: 0 }, quality: '7' });
    expect(c.map((k) => k.label)).toEqual(['F 大调', 'f 小调']);
    expect(c[0].tonic).toEqual({ letter: 'F', acc: 0 });
  });

  it('仅 quality=7 返回归属，其余返回空表', () => {
    expect(dominantKeys({ root: { letter: 'G', acc: 0 }, quality: 'maj' })).toEqual([]);
    expect(dominantKeys({ root: { letter: 'G', acc: 0 }, quality: 'm7' })).toEqual([]);
    expect(dominantKeys({ root: { letter: 'G', acc: 0 }, quality: 'dim7' })).toEqual([]);
  });
});

describe('leadingToneDimKeys：导七（减七）归属（和声小调）', () => {
  it('B°7 → c 和声小调；A°7 → b♭ 和声小调', () => {
    const b = leadingToneDimKeys({ root: { letter: 'B', acc: 0 }, quality: 'dim7' });
    expect(b.map((k) => k.label)).toEqual(['c 和声小调']);
    expect(b[0].mode).toBe('min');
    expect(b[0].tonic).toEqual({ letter: 'C', acc: 0 });

    const a = leadingToneDimKeys({ root: { letter: 'A', acc: 0 }, quality: 'dim7' });
    expect(a.map((k) => k.label)).toEqual(['b♭ 和声小调']);
    expect(a[0].tonic).toEqual({ letter: 'B', acc: -1 });
  });

  it('仅 quality=dim7 返回归属，其余返回空表', () => {
    expect(leadingToneDimKeys({ root: { letter: 'B', acc: 0 }, quality: 'dim' })).toEqual([]);
    expect(leadingToneDimKeys({ root: { letter: 'B', acc: 0 }, quality: 'm7b5' })).toEqual([]);
  });
});

describe('dominantOf：给调出属七（与 dominantKeys 互逆）', () => {
  it('C 大调 → G7；a 小调 → E7；E♭ 大调 → B♭7；f♯ 小调 → C♯7', () => {
    expect(dominantOf({ letter: 'C', acc: 0 }, 'maj')).toEqual({ root: { letter: 'G', acc: 0 }, quality: '7' });
    expect(dominantOf({ letter: 'A', acc: 0 }, 'min')).toEqual({ root: { letter: 'E', acc: 0 }, quality: '7' });
    expect(dominantOf({ letter: 'E', acc: -1 }, 'maj')).toEqual({ root: { letter: 'B', acc: -1 }, quality: '7' });
    expect(dominantOf({ letter: 'F', acc: 1 }, 'min')).toEqual({ root: { letter: 'C', acc: 1 }, quality: '7' });
  });

  it('dominantKeys(dominantOf(tonic)) 回到原调；dominantOf(dominantKeys 的主音) 回到原和弦', () => {
    const tonics: PitchName[] = [
      { letter: 'C', acc: 0 },
      { letter: 'E', acc: -1 },
      { letter: 'B', acc: 0 },
      { letter: 'C', acc: 1 },
      { letter: 'F', acc: 1 },
      { letter: 'A', acc: -1 },
      { letter: 'G', acc: 1 },
    ];
    for (const tonic of tonics) {
      for (const mode of ['maj', 'min'] as const) {
        const spec = dominantOf(tonic, mode);
        expect(spec.quality).toBe('7');
        const keys = dominantKeys(spec);
        expect(keys).toHaveLength(2);
        expect(keys[0].tonic).toEqual(tonic);
        expect(keys[0].mode).toBe('maj');
        expect(keys[1].mode).toBe('min');
        expect(dominantOf(keys[0].tonic, 'maj')).toEqual(spec);
      }
    }
  });
});
