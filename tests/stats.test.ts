import { describe, expect, it } from 'vitest';
import {
  EMA_ALPHA,
  TRAIN_MODES,
  aggregate,
  applyAttempt,
  applyAttempts,
  buildStats,
  dateKey,
  emptyStats,
  itemKey,
  median,
  percentile,
  updateEma,
  type AttemptRecord,
  type StatsState,
} from '../src/core/stats';
import { chordItemExtra } from '../src/core/question-generator';
import {
  createInitialState,
  exportJSON,
  importJSON,
  migrate,
  addXp,
  checkIn,
  levelFromXp,
  makeupCheckIn,
  markSeen,
  streakDays,
  SCHEMA_VERSION,
} from '../src/core/store';

const NOW = new Date(2026, 9, 19, 12, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;
const KEY = itemKey('sig', 'sh', 3, 'treble', 'maj');

function rec(ok: boolean, reactionMs: number, at: number, key = KEY): AttemptRecord {
  return { key, ok, reactionMs, at };
}

describe('EMA 与反应样本', () => {
  it('EMA 用 α=0.3 平滑，首条直接取结果', () => {
    expect(updateEma(0.5, true)).toBeCloseTo(0.5 * (1 - EMA_ALPHA) + 1 * EMA_ALPHA);
    let s: StatsState = emptyStats();
    s = applyAttempt(s, rec(true, 1000, NOW));
    expect(s.items[KEY].emaAccuracy).toBe(1);
    s = applyAttempt(s, rec(false, 2000, NOW + 1));
    expect(s.items[KEY].emaAccuracy).toBeCloseTo(0.7);
    s = applyAttempt(s, rec(true, 3000, NOW + 2));
    expect(s.items[KEY].emaAccuracy).toBeCloseTo(0.79);
    expect(s.items[KEY].attempts).toBe(3);
    expect(s.items[KEY].correct).toBe(2);
    expect(s.items[KEY].consecCorrect).toBe(1);
  });

  it('反应样本只留最近 30 次，中位数 / p90 按窗口算', () => {
    let s: StatsState = emptyStats();
    for (let i = 0; i < 35; i++) {
      s = applyAttempt(s, rec(true, i, NOW + i));
    }
    const item = s.items[KEY];
    expect(item.reactionSamples).toHaveLength(30);
    expect(item.reactionSamples[0]).toBe(5);
    expect(item.reactionSamples[29]).toBe(34);
    expect(item.medianReactionMs).toBe(median(item.reactionSamples));
    expect(item.p90ReactionMs).toBe(percentile(item.reactionSamples, 0.9));

    const s2 = applyAttempts(emptyStats(), [rec(true, 1000, NOW), rec(true, 2000, NOW), rec(true, 3000, NOW)]);
    expect(s2.items[KEY].medianReactionMs).toBe(2000);
    expect(s2.items[KEY].p90ReactionMs).toBe(3000);
    expect(median([])).toBeNull();
    expect(percentile([], 0.9)).toBeNull();
  });
});

describe('聚合报表', () => {
  const records: AttemptRecord[] = [
    rec(true, 1000, NOW),
    rec(true, 1200, NOW),
    rec(false, 3000, NOW - DAY, itemKey('sig', 'fl', 2, 'treble', 'min')),
    rec(true, 1400, NOW - 3 * DAY, itemKey('sig', 'fl', 2, 'treble', 'min')),
    rec(true, 2600, NOW - 8 * DAY, itemKey('note', 'sh', 5, 'bass', 'maj')), // 落在 7 日窗口外
  ];

  it('总正确率 / 反应中位 / ≤1.5s 占比 / 连击', () => {
    const agg = aggregate(records, NOW);
    expect(agg.totalAttempts).toBe(5);
    expect(agg.totalCorrect).toBe(4);
    expect(agg.accuracy).toBeCloseTo(0.8);
    expect(agg.medianReactionMs).toBe(1400);
    expect(agg.fastRatio).toBeCloseTo(0.6); // 1000/1200/1400 三次达标
    expect(agg.currentStreak).toBe(2); // 最近两条连对（按记录顺序）
    expect(agg.bestStreak).toBe(2);
  });

  it('7 日每日题数与正确率序列', () => {
    const agg = aggregate(records, NOW);
    expect(agg.daily).toHaveLength(7);
    expect(agg.daily[6].date).toBe(dateKey(NOW));
    expect(agg.daily[6].count).toBe(2);
    expect(agg.daily[6].accuracy).toBe(1);
    expect(agg.daily[5].count).toBe(1); // 1 天前
    expect(agg.daily[3].count).toBe(1); // 3 天前
    expect(agg.daily[0].count).toBe(0); // 8 天前的记录被窗口裁掉
    expect(agg.daily[0].accuracy).toBeNull();
  });

  it('按调号分组条形数据：升号在前、n 升序', () => {
    const agg = aggregate(records, NOW);
    expect(agg.keyBars.map((b) => [b.type, b.n])).toEqual([
      ['sh', 3],
      ['sh', 5],
      ['fl', 2],
    ]);
    const flBar = agg.keyBars.find((b) => b.type === 'fl')!;
    expect(flBar.count).toBe(2);
    expect(flBar.accuracy).toBeCloseTo(0.5);
    expect(buildStats(records).records).toHaveLength(5);
  });

  it('modeBars 七模式全覆盖聚合，keyBars 不吃和弦新题', () => {
    const chordKeys = [
      itemKey('func', 'sh', 1, 'treble', 'maj', chordItemExtra('dom-key')),
      itemKey('func', 'sh', 1, 'treble', 'maj', chordItemExtra('key-dom', 'maj')),
      itemKey('diatonic', 'sh', 0, 'treble', 'maj', chordItemExtra('deg2chord', 'maj')),
      itemKey('diatonic', 'sh', 0, 'treble', 'maj', chordItemExtra('chord2deg', 'harmMin')),
      itemKey('degrees', 'fl', 2, 'treble', 'min', chordItemExtra('acc2key', 'melMin')),
      itemKey('build', 'sh', 1, 'treble', 'maj', chordItemExtra('build-notes')),
    ];
    expect(chordKeys[5].endsWith('|build-notes')).toBe(true);
    const mixed: AttemptRecord[] = [
      rec(true, 1000, NOW),
      rec(true, 1100, NOW, chordKeys[0]),
      rec(false, 1200, NOW, chordKeys[1]),
      rec(true, 1300, NOW, chordKeys[2]),
      rec(true, 1400, NOW, chordKeys[2]),
      rec(false, 1500, NOW, chordKeys[3]),
      rec(true, 1600, NOW, chordKeys[4]),
      rec(true, 1700, NOW, chordKeys[5]),
    ];
    const agg = aggregate(mixed, NOW);

    // modeBars：固定 7 行、按 TRAIN_MODES 顺序，count / correct / accuracy 聚合
    expect(agg.modeBars.map((m) => m.train)).toEqual([...TRAIN_MODES]);
    const bar = (train: string) => agg.modeBars.find((m) => m.train === train)!;
    expect(bar('sig')).toEqual({ train: 'sig', count: 1, correct: 1, accuracy: 1 });
    expect(bar('func')).toEqual({ train: 'func', count: 2, correct: 1, accuracy: 0.5 });
    expect(bar('diatonic')).toEqual({ train: 'diatonic', count: 3, correct: 2, accuracy: 2 / 3 });
    expect(bar('degrees')).toEqual({ train: 'degrees', count: 1, correct: 1, accuracy: 1 });
    expect(bar('build')).toEqual({ train: 'build', count: 1, correct: 1, accuracy: 1 });
    expect(bar('note')).toEqual({ train: 'note', count: 0, correct: 0, accuracy: 0 });
    expect(bar('piece')).toEqual({ train: 'piece', count: 0, correct: 0, accuracy: 0 });

    // keyBars：只统计 sig/note/piece 旧键，和弦题不混入
    expect(agg.keyBars.map((b) => [b.type, b.n])).toEqual([['sh', 3]]);
    const onlyChord = aggregate(mixed.filter((r) => chordKeys.includes(r.key)), NOW);
    expect(onlyChord.keyBars).toEqual([]);
    expect(onlyChord.modeBars.reduce((a, m) => a + m.count, 0)).toBe(7);
  });
});

describe('v1 → v2 迁移与导入导出', () => {
  it('旧网页版 kst_v1 兼容字段名迁移，缺省给默认值', () => {
    const v1 = {
      cfg: { clef: 'bass', ask: 'minor', sound: 'on', vol: 55, big: true },
      stats: {
        'sig|sh|3|bass|min': {
          a: 12,
          c: 9,
          ema: 0.8,
          med: 900,
          samples: [800, 1000],
          streak: 2,
          last: NOW,
        },
      },
      review: ['sig|sh|1|treble|maj'],
      xp: 240,
      streak: ['2026-10-01', '2026-10-02'],
      seenKeys: ['rc|sh|1|maj'],
      badges: ['first-answer'],
    };
    const s = migrate(JSON.stringify(v1));
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.config).toEqual({
      clef: 'bass',
      ask: 'min',
      train: 'sig',
      sound: true,
      volume: 0.55,
      bigFont: true,
      showRuleCards: true,
      theme: 'dark',
    });
    const item = s.stats.items['sig|sh|3|bass|min'];
    expect(item).toMatchObject({
      attempts: 12,
      correct: 9,
      emaAccuracy: 0.8,
      medianReactionMs: 900,
      consecCorrect: 2,
      lastSeenAt: NOW,
    });
    expect(item.reactionSamples).toEqual([800, 1000]);
    expect(s.review).toHaveLength(1);
    expect(s.review[0]).toMatchObject({ questionKey: 'sig|sh|1|treble|maj', box: 0 });
    expect(s.xp).toBe(240);
    expect(s.streak.dates).toEqual(['2026-10-01', '2026-10-02']);
    expect(s.streak.makeupDates).toEqual([]);
    expect(s.seenKeys).toEqual(['rc|sh|1|maj']);
    expect(s.badges).toEqual(['first-answer']);
  });

  it('v1 只有 records 时全量重建统计', () => {
    const v1 = {
      records: [
        { key: KEY, ok: true, reactionMs: 800, at: NOW },
        { key: KEY, ok: false, reactionMs: 2000, at: NOW + 1 },
      ],
    };
    const s = migrate(v1);
    expect(s.stats.records).toHaveLength(2);
    expect(s.stats.items[KEY].attempts).toBe(2);
    expect(s.stats.items[KEY].consecCorrect).toBe(0);
  });

  it('exportJSON / importJSON 往返一致', () => {
    const base = createInitialState();
    const state = {
      ...base,
      config: { ...base.config, clef: 'bass' as const, ask: 'min' as const, train: 'note' as const, volume: 0.4, bigFont: true },
      stats: applyAttempts(emptyStats(), [rec(true, 900, NOW), rec(false, 1500, NOW + 1)]),
      review: [
        {
          questionKey: 'note|fl|2|bass|min|4',
          box: 3,
          enqueuedAt: NOW,
          updatedAt: NOW + 5,
          wrongCount: 2,
          rightCount: 1,
          baseCount: 12,
          dueAt: null,
        },
      ],
      xp: 320,
      levelProgress: { passed: ['c1-01', 'c1-02'], stars: { 'c1-01': 3, 'c1-02': 2 } },
      badges: ['first-answer', 'first-pass'],
      streak: { dates: ['2026-10-18'], makeupDates: ['2026-10-12'] },
      seenKeys: ['rc|fl|2|min'],
    };
    expect(importJSON(exportJSON(state))).toEqual(state);
  });
});

describe('经验 / 打卡 / 微课卡', () => {
  it('经验与等级', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(250)).toBe(3);
    const s = addXp(createInitialState(), 150);
    expect(s.xp).toBe(150);
    expect(addXp(s, -200).xp).toBe(0);
  });

  it('打卡幂等、补卡每周限 1 次', () => {
    let s = createInitialState();
    s = checkIn(s, '2026-10-19');
    s = checkIn(s, '2026-10-19');
    expect(s.streak.dates).toEqual(['2026-10-19']);
    // 2026-10-19 是周一：补 10-18（上周日）和 10-17（上周六）属同一周
    const m1 = makeupCheckIn(s, '2026-10-18');
    expect(m1).not.toBeNull();
    const m2 = makeupCheckIn(m1!, '2026-10-17');
    expect(m2).toBeNull();
    expect(makeupCheckIn(s, '2026-10-19')).toBeNull(); // 已打卡不能再补
    expect(streakDays(s.streak, '2026-10-19')).toBe(1);
  });

  it('微课卡已读幂等', () => {
    let s = createInitialState();
    s = markSeen(s, 'rc|sh|1|maj');
    const s2 = markSeen(s, 'rc|sh|1|maj');
    expect(s2.seenKeys).toEqual(['rc|sh|1|maj']);
  });
});

describe('微课卡开关配置（showRuleCards）', () => {
  it('默认开启', () => {
    expect(createInitialState().config.showRuleCards).toBe(true);
    expect(migrate({}).config.showRuleCards).toBe(true);
  });

  it('旧 JSON（无该字段）导入后字段补齐为 true，不升 schemaVersion', () => {
    const legacy = JSON.stringify({
      cfg: { clef: 'bass', ask: 'minor', sound: 'on', vol: 55, big: true },
      seenKeys: ['rc|sh|1|maj'],
    });
    const s = migrate(legacy);
    expect(s.config).toHaveProperty('showRuleCards', true);
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('显式关闭保留，导出导入往返一致', () => {
    const s = migrate({ config: { showRuleCards: false }, seenKeys: ['rc|sh|1|maj'] });
    expect(s.config.showRuleCards).toBe(false);
    expect(importJSON(exportJSON(s)).config.showRuleCards).toBe(false);
  });
});
