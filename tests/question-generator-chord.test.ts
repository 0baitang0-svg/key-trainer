import { describe, expect, it } from 'vitest';
import {
  buildOptions,
  checkAnswer,
  correctLabelOf,
  explainAnswer,
  makeRng,
  pickQuestion,
  pickWeight,
  questionFromKey,
  questionKey,
  type PickConfig,
  type QKind,
  type Question,
  type TrainMode,
} from '../src/core/question-generator';
import { emptyStats, itemKey } from '../src/core/stats';
import { chordPcSet, pitchNameToString, type ChordSpec } from '../src/core/chord-theory';
import { keyLabel } from '../src/core/scale-theory';

const NOW = 1_700_000_000_000;

const KIND_TRAIN: Record<QKind, TrainMode> = {
  'dom-key': 'func',
  'key-dom': 'func',
  'listen-func': 'func',
  deg2chord: 'diatonic',
  chord2deg: 'diatonic',
  chord2func: 'diatonic',
  key2acc: 'degrees',
  deg2note: 'degrees',
  acc2key: 'degrees',
  'build-notes': 'build',
  'build-mc': 'build',
  notes2quality: 'build',
};

const ALL_KINDS = Object.keys(KIND_TRAIN) as QKind[];
const THREE_OPTION_KINDS: QKind[] = ['listen-func', 'chord2func'];

/** 抽一道指定题型的题 */
function draw(kind: QKind, seed = 1): Question {
  const cfg: PickConfig = { train: KIND_TRAIN[kind], kinds: [kind], clefs: ['treble'], asks: ['maj'] };
  return pickQuestion(cfg, emptyStats(), [], [], { rng: makeRng(seed), now: NOW });
}

/** 题目前缀：train|kind|主音 */
function prefixOf(q: Question): string {
  const cq = q.cq!;
  const t = cq.tonic ?? cq.root ?? cq.chord!.root;
  return `${q.train}|${cq.kind}|${pitchNameToString(t)}`;
}

describe('12 种和弦题型：出题 → 判对 / 判错 → explain', () => {
  for (const kind of ALL_KINDS) {
    it(`${kind} 判对判错与锚点非空`, () => {
      const q = draw(kind);
      expect(q.cq?.kind).toBe(kind);
      expect(q.answerInput).toBe(kind === 'build-notes' ? 'keyboard-build' : 'options');
      const correct = correctLabelOf(q);
      expect(explainAnswer(q).length).toBeGreaterThan(0);
      expect(checkAnswer(q, correct).explain).toBe(explainAnswer(q));

      if (kind === 'build-notes') {
        // 键盘拼和弦：midi 数组按 pitch class 集合判题
        expect(q.options).toEqual([]);
        const want = chordPcSet(q.cq!.chord!);
        expect(checkAnswer(q, want.map((pc) => 48 + pc)).ok).toBe(true);
        // 文案作答（正确拼名串）也判对
        expect(checkAnswer(q, correct).ok).toBe(true);
        // 漏音 / 多音（新音级）/ 半音错都判错
        expect(checkAnswer(q, want.slice(0, -1).map((pc) => 48 + pc)).ok).toBe(false);
        const extra = Array.from({ length: 12 }, (_, pc) => pc).find((pc) => !want.includes(pc))!;
        expect(checkAnswer(q, [...want.map((pc) => 48 + pc), 48 + extra]).ok).toBe(false);
        expect(checkAnswer(q, want.map((pc, i) => (i === 0 ? 48 + ((pc + 1) % 12) : 48 + pc))).ok).toBe(false);
        // 等音不同八度判对
        expect(checkAnswer(q, want.map((pc) => 72 + pc)).ok).toBe(true);
      } else {
        const wantLen = THREE_OPTION_KINDS.includes(kind) ? 3 : 4;
        expect(q.options).toHaveLength(wantLen);
        // 干扰项不重复、不含正确项之外恰好一个正确项
        expect(new Set(q.options).size).toBe(wantLen);
        expect(q.options.filter((o) => o === correct)).toHaveLength(1);
        expect(checkAnswer(q, correct).ok).toBe(true);
        expect(checkAnswer(q, q.options.indexOf(correct)).ok).toBe(true);
        for (const o of q.options) {
          if (o !== correct) expect(checkAnswer(q, o).ok).toBe(false);
        }
      }
    });
  }
});

describe('questionKey ↔ questionFromKey 含 cq 往返', () => {
  for (const kind of ALL_KINDS) {
    it(`${kind} 往返还原 cq`, () => {
      const q = draw(kind, 7);
      const key = questionKey(q);
      expect(key.split('|')).toHaveLength(9);
      expect(key.split('|')[8].split('~')).toHaveLength(5);
      const back = questionFromKey(key, makeRng(9));
      expect(back.fromReview).toBe(true);
      expect(back.train).toBe(q.train);
      expect(back.cq).toEqual(q.cq);
      expect(back.answerInput).toBe(q.answerInput);
      expect(correctLabelOf(back)).toBe(correctLabelOf(q));
      expect(checkAnswer(back, correctLabelOf(back)).ok).toBe(true);
    });
  }

  it('旧 8 段 key 不受影响', () => {
    const q = questionFromKey('sig|sh|1|treble|maj', makeRng(1));
    expect(q.cq).toBeUndefined();
    expect(questionKey(q)).toBe('sig|sh|1|treble|maj|||');
  });
});

describe('锚点文案（方案示例风格）', () => {
  const g7: ChordSpec = { root: { letter: 'G', acc: 0 }, quality: '7' };

  it('dom-key：G7 → C 大调 / c 小调', () => {
    const q: Question = {
      id: 'dk',
      train: 'func',
      type: 'sh',
      n: 1,
      clef: 'treble',
      ask: 'maj',
      cq: { kind: 'dom-key', chord: g7, root: { letter: 'G', acc: 0 } },
      answerInput: 'options',
      options: [],
    };
    q.options = buildOptions(q, makeRng(1));
    expect(correctLabelOf(q)).toBe('C 大调 / c 小调');
    const res = checkAnswer(q, 'C 大调 / c 小调');
    expect(res.ok).toBe(true);
    expect(res.explain).toBe('G7 = G B D F；属七根音 = 主音上方纯五度 → C 大调与 c 小调的 V7（同名大小调共用属七）');
    expect(checkAnswer(q, q.options.find((o) => o !== 'C 大调 / c 小调')!).ok).toBe(false);
  });

  it('build-notes：G7 拼音级链锚点', () => {
    const q: Question = {
      id: 'bn',
      train: 'build',
      type: 'sh',
      n: 1,
      clef: 'treble',
      ask: 'maj',
      cq: { kind: 'build-notes', chord: g7, root: { letter: 'G', acc: 0 } },
      answerInput: 'keyboard-build',
      options: [],
    };
    expect(correctLabelOf(q)).toBe('G B D F');
    expect(explainAnswer(q)).toBe('G7：根 G → 大三 B → 纯五 D → 小七 F');
    expect(checkAnswer(q, [55, 59, 62, 65]).ok).toBe(true);
  });

  it('key-dom / deg2chord / chord2deg 锚点带具体调与级数', () => {
    const keyDom = draw('key-dom', 3);
    expect(explainAnswer(keyDom)).toContain('的属七');
    expect(explainAnswer(keyDom)).toContain('→');
    const d2c = draw('deg2chord', 3);
    expect(explainAnswer(d2c)).toContain('第');
    expect(explainAnswer(d2c)).toContain('级顺阶和弦');
    const c2d = draw('chord2deg', 3);
    expect(explainAnswer(c2d)).toContain('级（');
  });
});

describe('干扰项规则', () => {
  it('key-dom 干扰项来自同根音其它性质 + 五度邻根属七', () => {
    const q = draw('key-dom', 5);
    const correct = correctLabelOf(q);
    expect(q.options).toHaveLength(4);
    expect(q.options).toContain(correct);
    // 正确项是属七符号
    expect(correct.endsWith('7')).toBe(true);
    for (const o of q.options) {
      if (o === correct) continue;
      // 干扰项带 maj7 / m7 / ° 后缀，或是另一根音的属七
      expect(/(maj7|m7|°|7)$/.test(o)).toBe(true);
    }
  });

  it('chord2deg 选项是同调其它级，优先 ii/iii/vi', () => {
    const q = draw('chord2deg', 5);
    const correct = correctLabelOf(q);
    expect(q.options).toHaveLength(4);
    expect(q.options).toContain(correct);
    for (const o of q.options) {
      expect(o).toMatch(/^[iIvV]+[°+]?(7)? · (主功能|下属功能|属功能)$/);
    }
    expect(new Set(q.options).size).toBe(4);
  });

  it('acc2key 干扰项是同数量变化音的其它调', () => {
    const q = draw('acc2key', 5);
    const cq = q.cq!;
    const correct = correctLabelOf(q);
    expect(q.options).toHaveLength(4);
    expect(q.options).toContain(correct);
    // 正确项就是该调调名
    expect(correct).toBe(keyLabel(cq.tonic!, cq.scale!));
  });

  it('notes2quality 选项是同根音 4 种性质互混', () => {
    const q = draw('notes2quality', 5);
    const correct = correctLabelOf(q);
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
    expect(q.options).toContain(correct);
    for (const o of q.options) expect(o).toMatch(/(和弦)$/);
  });
});

describe('间距与权重', () => {
  it('同 train|kind|主音 前缀间隔 ≥2 题', () => {
    const cfg: PickConfig = { train: 'diatonic', clefs: ['treble'], asks: ['maj'] };
    const rng = makeRng(11);
    const recent: Question[] = [];
    for (let i = 0; i < 200; i++) {
      recent.push(pickQuestion(cfg, emptyStats(), recent, [], { rng, now: NOW }));
    }
    for (let i = 2; i < recent.length; i++) {
      for (let back = 1; back <= 2; back++) {
        expect(prefixOf(recent[i])).not.toBe(prefixOf(recent[i - back]));
      }
    }
  });

  it('flatBias 只对 sig/note/degrees 生效，dim7/m7b5 加 0.3 冷门偏置', () => {
    // 旧签名（不传 train）保留 flatBias
    expect(pickWeight(undefined, 'fl', 5, NOW)).toBeCloseTo(1 + 2 * 0.35 + 1 + 0.5, 6);
    expect(pickWeight(undefined, 'fl', 5, NOW, 'degrees')).toBeCloseTo(1 + 2 * 0.35 + 1 + 0.5, 6);
    expect(pickWeight(undefined, 'fl', 5, NOW, 'func')).toBeCloseTo(1 + 2 * 0.35 + 1, 6);
    expect(pickWeight(undefined, 'fl', 5, NOW, 'build')).toBeCloseTo(1 + 2 * 0.35 + 1, 6);
    const base = pickWeight(undefined, 'sh', 100, NOW, 'build', 'maj');
    expect(pickWeight(undefined, 'sh', 100, NOW, 'build', 'dim7')).toBeCloseTo(base + 0.3, 6);
    expect(pickWeight(undefined, 'sh', 100, NOW, 'build', 'm7b5')).toBeCloseTo(base + 0.3, 6);
    expect(pickWeight(undefined, 'sh', 100, NOW, 'build', 'maj7')).toBeCloseTo(base, 6);
  });

  it('itemKey 第 6 段 extra 传 qkind，缺省保持旧签名', () => {
    expect(itemKey('sig', 'sh', 0, 'treble', 'maj')).toBe('sig|sh|0|treble|maj');
    expect(itemKey('build', 'sh', 1, 'treble', 'maj', 'build-notes')).toBe('build|sh|1|treble|maj|build-notes');
    expect(itemKey('degrees', 'fl', 3, 'treble', 'min', 'acc2key')).toBe('degrees|fl|3|treble|min|acc2key');
  });
});

describe('错题回炉兼容和弦题', () => {
  it('reviewDue 还原和弦题（含 cq 与键盘模式）', () => {
    const src = draw('build-notes', 13);
    const cfg: PickConfig = { train: 'build', kinds: ['build-notes'], clefs: ['treble'], asks: ['maj'] };
    const q = pickQuestion(cfg, emptyStats(), [], [questionKey(src)], { rng: () => 0, now: NOW });
    expect(q.fromReview).toBe(true);
    expect(q.cq).toEqual(src.cq);
    expect(q.answerInput).toBe('keyboard-build');
    expect(correctLabelOf(q)).toBe(correctLabelOf(src));
  });
});
