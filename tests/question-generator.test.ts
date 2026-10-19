import { describe, expect, it } from 'vitest';
import {
  NOTE_LABELS,
  NOTE_OPTIONS,
  buildOptions,
  checkAnswer,
  correctLabelOf,
  makeRng,
  pickQuestion,
  pickWeight,
  questionFromKey,
  questionKey,
  type PickConfig,
  type Question,
} from '../src/core/question-generator';
import { emptyItemStat, emptyStats, itemKey, type StatsState } from '../src/core/stats';
import { MAJ_GRID, MIN_GRID } from '../src/core/music-theory';

const NOW = 1_700_000_000_000;

function statWith(overrides: Partial<ReturnType<typeof emptyItemStat>>) {
  return { ...emptyItemStat(), ...overrides };
}

describe('抽题权重', () => {
  it('权重公式：EMA / 反应惩罚 / 陈旧度 / 降号偏置', () => {
    // 未见过：ema=0.65、staleness=1
    expect(pickWeight(undefined, 'sh', 100, NOW)).toBeCloseTo(1 + 2 * (1 - 0.65) + 1, 6);
    // 刚见过的降号项，样本 <20 → flatBias 0.5
    const fl = statWith({ emaAccuracy: 0.5, lastSeenAt: NOW });
    expect(pickWeight(fl, 'fl', 5, NOW)).toBeCloseTo(1 + 2 * 0.5 + 0.5, 6);
    // 样本 ≥20 后移除降号偏置
    expect(pickWeight(fl, 'fl', 20, NOW)).toBeCloseTo(2, 6);
    // 反应中位 3500ms → 惩罚 (3500-2000)/3000 = 0.5
    const slow = statWith({ emaAccuracy: 0.5, lastSeenAt: NOW, medianReactionMs: 3500 });
    expect(pickWeight(slow, 'sh', 100, NOW)).toBeCloseTo(1 + 1 + 0.5, 6);
    // 3 天未见 → staleness 满 1
    const stale = statWith({ emaAccuracy: 1, lastSeenAt: NOW - 3 * 24 * 60 * 60 * 1000 });
    expect(pickWeight(stale, 'sh', 100, NOW)).toBeCloseTo(1 + 1, 6);
  });

  it('低正确率条目被抽中更频繁（2000 次分布）', () => {
    const weakKey = itemKey('sig', 'sh', 0, 'treble', 'maj');
    const strongKey = itemKey('sig', 'sh', 1, 'treble', 'maj');
    const stats: StatsState = {
      items: {
        [weakKey]: statWith({ attempts: 30, correct: 6, emaAccuracy: 0.2, lastSeenAt: NOW }),
        [strongKey]: statWith({ attempts: 30, correct: 28, emaAccuracy: 0.93, lastSeenAt: NOW }),
      },
      records: Array.from({ length: 50 }, (_, i) => ({
        key: strongKey,
        ok: true,
        reactionMs: 600,
        at: NOW - 10_000 + i,
      })),
    };
    const cfg: PickConfig = {
      train: 'sig',
      clefs: ['treble'],
      asks: ['maj'],
      keys: [
        { type: 'sh', n: 0 },
        { type: 'sh', n: 1 },
      ],
    };
    const rng = makeRng(42);
    let weak = 0;
    let strong = 0;
    for (let i = 0; i < 2000; i++) {
      const q = pickQuestion(cfg, stats, [], [], { rng, now: NOW });
      if (q.n === 0) weak++;
      else strong++;
    }
    expect(weak + strong).toBe(2000);
    expect(weak).toBeGreaterThan(strong * 1.5);
  });
});

describe('间隔约束与选项', () => {
  it('同一调号与上一题间隔 ≥2 题', () => {
    const cfg: PickConfig = {
      train: 'sig',
      clefs: ['treble'],
      asks: ['maj'],
      keys: Array.from({ length: 8 }, (_, i) => ({ type: 'sh' as const, n: i })),
    };
    const rng = makeRng(7);
    const recent: Question[] = [];
    for (let i = 0; i < 200; i++) {
      recent.push(pickQuestion(cfg, emptyStats(), recent, [], { rng, now: NOW }));
    }
    for (let i = 2; i < recent.length; i++) {
      for (let back = 1; back <= 2; back++) {
        const a = recent[i];
        const b = recent[i - back];
        expect(a.type + a.n).not.toBe(b.type + b.n);
      }
    }
  });

  it('认调选项：4 项、含易混干扰项、同为大调（或同为小调）', () => {
    const maj: Question = {
      id: 'm',
      train: 'sig',
      type: 'sh',
      n: 7,
      clef: 'treble',
      ask: 'maj',
      options: [],
    };
    const opts = buildOptions(maj, makeRng(1));
    expect(opts).toHaveLength(4);
    expect(new Set(opts).size).toBe(4);
    expect(opts).toContain('C♯'); // 7♯ 大调主音
    expect(opts).toContain('C♭'); // 易混对：同字母反记号
    for (const o of opts) expect(MAJ_GRID).toContain(o);

    const min: Question = { ...maj, id: 'n', ask: 'min' };
    const minOpts = buildOptions(min, makeRng(2));
    expect(minOpts).toContain('a♯'); // 7♯ 小调主音
    expect(minOpts).toContain('a♭'); // 易混对
    for (const o of minOpts) expect(MIN_GRID).toContain(o);
    expect(correctLabelOf(min)).toBe('a♯');
  });

  it('note 模式选项固定原位/升/降，判定用 noteInfo().acc', () => {
    const q: Question = {
      id: 'nn',
      train: 'note',
      type: 'sh',
      n: 7,
      clef: 'treble',
      ask: 'maj',
      step: 2,
      options: [],
    };
    q.options = buildOptions(q, makeRng(3));
    expect(q.options).toEqual([...NOTE_LABELS]);
    expect(NOTE_OPTIONS.map((o) => o.a)).toEqual([0, 1, -1]);
    // 第2线 = G，7♯ 调号里有 G → G♯
    const hit = checkAnswer(q, 1);
    expect(hit.ok).toBe(true);
    expect(hit.correctLabel).toBe('♯升');
    expect(hit.explain).toBe('第2线 = G，7 个升号里有它 → G♯（C♯ 大调第 5 级）');
    expect(checkAnswer(q, 0).ok).toBe(false);
    expect(checkAnswer(q, '♭降').ok).toBe(false);
  });

  it('判题：下标 / 文案两种作答方式，解析直读锚点', () => {
    const q: Question = {
      id: 's',
      train: 'sig',
      type: 'fl',
      n: 3,
      clef: 'bass',
      ask: 'min',
      options: [],
    };
    q.options = buildOptions(q, makeRng(4));
    const idx = q.options.indexOf('c'); // 3♭ 小调 = c
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(checkAnswer(q, idx).ok).toBe(true);
    expect(checkAnswer(q, 'c').ok).toBe(true);
    expect(checkAnswer(q, q.options.find((o) => o !== 'c')!).ok).toBe(false);
    expect(checkAnswer(q, idx).explain).toContain('倒二降');
    expect(checkAnswer(q, idx).explain).toContain('小调');
  });
});

describe('错题回炉', () => {
  it('从 reviewDue 还原题目：保留 train/type/n/clef/ask/step', () => {
    const src: Question = {
      id: 'src',
      train: 'note',
      type: 'fl',
      n: 3,
      clef: 'bass',
      ask: 'maj',
      step: 2,
      options: [...NOTE_LABELS],
    };
    const key = questionKey(src);
    const q = pickQuestion(
      { train: 'note', clefs: ['bass'], asks: ['maj'] },
      emptyStats(),
      [],
      [key],
      { rng: () => 0, now: NOW },
    );
    expect(q.fromReview).toBe(true);
    expect(q.train).toBe('note');
    expect(q.type).toBe('fl');
    expect(q.n).toBe(3);
    expect(q.clef).toBe('bass');
    expect(q.ask).toBe('maj');
    expect(q.step).toBe(2);
    expect(q.options).toEqual([...NOTE_LABELS]);
  });

  it('每节 25%~30% 的题来自 reviewDue', () => {
    const keys = ['sig|sh|1|treble|maj', 'sig|fl|2|treble|min', 'note|sh|4|bass|maj|6'];
    const rng = makeRng(2026);
    const cfg: PickConfig = { train: 'sig', clefs: ['treble'], asks: ['maj'], keys: [{ type: 'sh', n: 0 }] };
    let fromReview = 0;
    for (let i = 0; i < 1000; i++) {
      const q = pickQuestion(cfg, emptyStats(), [], keys, { rng, now: NOW });
      if (q.fromReview) fromReview++;
    }
    expect(fromReview).toBeGreaterThanOrEqual(230);
    expect(fromReview).toBeLessThanOrEqual(310);
  });

  it('questionKey / questionFromKey 往返保留字段', () => {
    const src: Question = {
      id: 'rt',
      train: 'piece',
      type: 'sh',
      n: 2,
      clef: 'treble',
      ask: 'maj',
      pieceId: 'canon',
      pieceKind: 'listen',
      options: [],
    };
    const back = questionFromKey(questionKey(src), makeRng(5));
    expect(back.train).toBe('piece');
    expect(back.type).toBe('sh');
    expect(back.n).toBe(2);
    expect(back.clef).toBe('treble');
    expect(back.ask).toBe('maj');
    expect(back.pieceId).toBe('canon');
    expect(back.pieceKind).toBe('listen');
    expect(back.fromReview).toBe(true);
    expect(back.id).not.toBe(src.id);
    // 2♯ 大调 = D，选项含正确项与 3 个同为大调的干扰项
    expect(back.options).toHaveLength(4);
    expect(back.options).toContain('D');
  });
});
