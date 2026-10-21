import { describe, expect, it } from 'vitest';
import {
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
import { seqProfileCode, seqProfileOf } from '../src/core/seq-generator';
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

  it('note 题 = 视奏串：出题带 seq、长度按档、key 第 9 段 play~、判题兜底', () => {
    const cfg: PickConfig = { train: 'note', clefs: ['treble'], asks: ['maj'], keys: [{ type: 'sh', n: 3 }] };
    const q = pickQuestion(cfg, emptyStats(), [], [], { rng: makeRng(11), now: NOW });
    // 无统计 → T0 档（len 6）
    expect(q.seq).toBeDefined();
    expect(typeof q.seqSeed).toBe('number');
    expect(q.seqProfile).toEqual(seqProfileOf(undefined, 0));
    expect(q.seq!.notes).toHaveLength(q.seqProfile!.len);
    expect(q.seq!.bars.length).toBeGreaterThan(0);
    expect(q.options).toEqual([]);
    expect(correctLabelOf(q)).toBe('弹完即可');

    // questionKey 第 9 段：play~{seed}~{profileCode}
    const parts = questionKey(q).split('|');
    expect(parts).toHaveLength(9);
    expect(parts[0]).toBe('note');
    expect(parts[8]).toBe(`play~${q.seqSeed}~${seqProfileCode(q.seqProfile!)}`);

    // 同 seed 同 profile 确定性重建同串
    const back = questionFromKey(questionKey(q), makeRng(2));
    expect(back.seqSeed).toBe(q.seqSeed);
    expect(questionKey(back)).toBe(questionKey(q));
    expect(back.seq!.notes.map((n) => n.midis)).toEqual(q.seq!.notes.map((n) => n.midis));
    expect(back.step).toBeUndefined();

    // checkAnswer 兜底：{errors} 结构 0 错 = ok
    expect(checkAnswer(q, { errors: 0 }).ok).toBe(true);
    expect(checkAnswer(q, { errors: 2 }).ok).toBe(false);
    expect(checkAnswer(q, { errors: 0 }).correctLabel).toBe('弹完即可');
  });

  it('视奏难度档吃统计：ema/样本决定档位（ema 0.9 + 10 样本 → T1 len 8）', () => {
    const stats: StatsState = {
      items: {
        [itemKey('note', 'sh', 3, 'treble', 'maj')]: statWith({
          attempts: 10,
          emaAccuracy: 0.9,
          lastSeenAt: NOW,
        }),
      },
      records: [],
    };
    const cfg: PickConfig = { train: 'note', clefs: ['treble'], asks: ['maj'], keys: [{ type: 'sh', n: 3 }] };
    const q = pickQuestion(cfg, stats, [], [], { rng: makeRng(5), now: NOW });
    expect(q.seqProfile!.len).toBe(8);
    expect(q.seq!.notes).toHaveLength(8);
  });

  it('旧 note key（三选时代 step 段）兼容：忽略 step、hash 成 seed 重建视奏题', () => {
    const old = 'note|fl|3|bass|maj|6';
    const q = questionFromKey(old, makeRng(1));
    expect(q.train).toBe('note');
    expect(q.type).toBe('fl');
    expect(q.n).toBe(3);
    expect(q.clef).toBe('bass');
    expect(q.ask).toBe('maj');
    expect(q.step).toBeUndefined(); // 旧 step 被忽略
    expect(q.seq).toBeDefined();
    expect(q.options).toEqual([]);
    expect(questionKey(q)).toMatch(/\|play~\d+~/);
    // 同旧 key 两次还原 → 同 seed 同串（错题回炉不炸）
    const again = questionFromKey(old, makeRng(1));
    expect(questionKey(again)).toBe(questionKey(q));
    expect(again.seq!.notes.map((n) => n.midis)).toEqual(q.seq!.notes.map((n) => n.midis));
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
  it('从 reviewDue 还原视奏题：保留 train/type/n/clef/ask，串确定性重建', () => {
    const cfg: PickConfig = { train: 'note', clefs: ['bass'], asks: ['maj'], keys: [{ type: 'fl', n: 3 }] };
    const src = pickQuestion(cfg, emptyStats(), [], [], { rng: makeRng(9), now: NOW });
    const key = questionKey(src);
    const q = pickQuestion(cfg, emptyStats(), [], [key], { rng: () => 0, now: NOW });
    expect(q.fromReview).toBe(true);
    expect(q.train).toBe('note');
    expect(q.type).toBe('fl');
    expect(q.n).toBe(3);
    expect(q.clef).toBe('bass');
    expect(q.ask).toBe('maj');
    expect(q.options).toEqual([]);
    expect(questionKey(q)).toBe(key);
    expect(q.seq!.notes.map((n) => n.midis)).toEqual(src.seq!.notes.map((n) => n.midis));
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
