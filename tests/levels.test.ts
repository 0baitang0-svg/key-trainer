import { describe, expect, it } from 'vitest';
import {
  CHAPTERS,
  CHAPTER_PASS_MS,
  CHORD_MIN_ATTEMPTS,
  CHORD_MIX_WEIGHTS,
  LEVELS,
  buildDailyPlan,
  chapterLevels,
  checkPass,
  findLevel,
  levelPickConfig,
  type Level,
  type LevelAttempt,
} from '../src/core/levels';
import {
  checkAnswer,
  correctLabelOf,
  makeRng,
  pickQuestion,
  type Question,
} from '../src/core/question-generator';
import { emptyStats } from '../src/core/stats';

const NOW = 1_700_000_000_000;

function results(n: number, ok: boolean | ((i: number) => boolean), ms: number | ((i: number) => number)): LevelAttempt[] {
  return Array.from({ length: n }, (_, i) => ({
    ok: typeof ok === 'function' ? ok(i) : ok,
    reactionMs: typeof ms === 'function' ? ms(i) : ms,
  }));
}

describe('关卡数据', () => {
  it('5 章、每章 6–10 关、题数 5–8、门槛齐整', () => {
    expect(CHAPTERS).toHaveLength(5);
    expect(LEVELS.length).toBeGreaterThanOrEqual(24);
    expect(CHAPTER_PASS_MS).toEqual([2500, 2000, 1500, 1200, 3000]);
    for (let ch = 1; ch <= 4; ch++) {
      const list = chapterLevels(ch);
      expect(list.length).toBeGreaterThanOrEqual(6);
      expect(list.length).toBeLessThanOrEqual(10);
      for (const l of list) {
        expect(l.questionCount).toBeGreaterThanOrEqual(5);
        expect(l.questionCount).toBeLessThanOrEqual(8);
        expect(l.passAcc).toBe(0.8);
        expect(l.passMedianMs).toBe(CHAPTER_PASS_MS[ch - 1]);
        expect(l.dist.length).toBeGreaterThan(0);
      }
    }
    expect(findLevel('c4-06')?.title).toContain('理论极值挑战');
    expect(findLevel('c4-06')?.bossQuestion).toBe(true);
  });

  it('关卡可转成抽题配置', () => {
    const level = findLevel('c2-07')!;
    const cfg = levelPickConfig(level, 'sig', ['treble']);
    expect(cfg.train).toBe('sig');
    expect(cfg.clefs).toEqual(['treble']);
    expect(cfg.keys).toEqual(level.dist);
  });
});

describe('第 5 章和弦关卡', () => {
  const c5 = () => chapterLevels(5);

  it('7 关齐整：题数 5–8、门槛 3000ms（build 类关 4000ms）、Boss 在章末', () => {
    expect(c5().map((l) => l.id)).toEqual(['c5-01', 'c5-02', 'c5-03', 'c5-04', 'c5-05', 'c5-06', 'c5-07']);
    for (const l of c5()) {
      expect(l.chapter).toBe(5);
      expect(l.questionCount).toBeGreaterThanOrEqual(5);
      expect(l.questionCount).toBeLessThanOrEqual(8);
      expect(l.passAcc).toBe(0.8);
      expect(l.dist.length).toBeGreaterThan(0);
    }
    expect(findLevel('c5-05')?.passMedianMs).toBe(4000);
    for (const l of c5().filter((l) => l.id !== 'c5-05')) expect(l.passMedianMs).toBe(3000);
    expect(findLevel('c5-07')?.bossQuestion).toBe(true);
    expect(c5().filter((l) => l.bossQuestion).map((l) => l.id)).toEqual(['c5-07']);
    expect(CHAPTERS[4]).toMatchObject({ id: 5, title: '和弦与功能', passMedianMs: 3000 });
  });

  it('每关 pick 配置合法且可出题（题型不越界、判题闭环）', () => {
    for (const l of c5()) {
      const cfg = levelPickConfig(l);
      const allowed = new Set(cfg.kinds ?? []);
      expect(allowed.size).toBeGreaterThan(0);
      expect(['func', 'diatonic', 'degrees', 'build']).toContain(cfg.train);
      const seen = new Set<string>();
      for (let seed = 1; seed <= 24; seed++) {
        const q: Question = pickQuestion(cfg, emptyStats(), [], [], { rng: makeRng(seed), now: NOW });
        expect(q.cq).toBeDefined();
        expect(allowed.has(q.cq!.kind)).toBe(true);
        seen.add(q.cq!.kind);
        expect(checkAnswer(q, correctLabelOf(q)).ok).toBe(true);
      }
      // 受 kinds / scales / qualities 约束的题都要能抽到
      if (l.id === 'c5-01') {
        expect(seen.has('dom-key')).toBe(true);
        expect(cfg.kindWeights?.['dom-key']).toBeGreaterThan(cfg.kindWeights?.['key-dom'] ?? 0);
      }
      if (l.id === 'c5-05') {
        expect(cfg.qualities).toEqual(['maj', 'min', '7']);
        expect([...seen].every((k) => k === 'build-notes' || k === 'build-mc')).toBe(true);
      }
      if (l.id === 'c5-06') {
        expect(cfg.scales).toEqual(['harmMin', 'melMin']);
        for (let seed = 1; seed <= 24; seed++) {
          const q = pickQuestion(cfg, emptyStats(), [], [], { rng: makeRng(seed), now: NOW });
          expect(['harmMin', 'melMin']).toContain(q.cq?.scale);
        }
      }
      if (l.id === 'c5-07') {
        const trains = new Set<string>();
        for (let seed = 1; seed <= 48; seed++) {
          const q = pickQuestion(cfg, emptyStats(), [], [], { rng: makeRng(seed), now: NOW });
          trains.add(q.train);
        }
        expect([...trains].sort()).toEqual(['build', 'degrees', 'diatonic', 'func']);
      }
    }
  });

  it('c5 关卡 checkPass 沿用星级规则（含 boss 关）', () => {
    const boss = findLevel('c5-07')!;
    const out = checkPass(boss, results(8, true, 2000)); // ≤3000ms×75% → 速度星
    expect(out.pass).toBe(true);
    expect(out.bossOk).toBe(true);
    expect(out.stars).toBe(3);
    const failBoss = checkPass(boss, results(8, (i) => i !== 7, 2000));
    expect(failBoss.pass).toBe(false);
  });
});

describe('通关判定与星级', () => {
  const level: Level = findLevel('c1-01')!; // 5 题、门槛 0.8 / 2500ms

  it('全对且快：通关并拿 3 星', () => {
    const out = checkPass(level, results(5, true, 1000));
    expect(out.pass).toBe(true);
    expect(out.acc).toBe(1);
    expect(out.medianMs).toBe(1000);
    expect(out.stars).toBe(3); // 正确率星 + 速度星
  });

  it('全对但不够快：2 星', () => {
    const out = checkPass(level, results(5, true, 2000));
    expect(out.pass).toBe(true);
    expect(out.stars).toBe(2);
  });

  it('正确率不足 0.8：不通过、0 星', () => {
    const out = checkPass(level, results(5, (i) => i < 3, 1000));
    expect(out.acc).toBeCloseTo(0.6);
    expect(out.pass).toBe(false);
    expect(out.stars).toBe(0);
  });

  it('反应中位数超门槛：不通过', () => {
    const out = checkPass(level, results(5, true, (i) => (i < 3 ? 3000 : 1000)));
    expect(out.medianMs).toBe(3000);
    expect(out.pass).toBe(false);
  });

  it('没答满题数：不通过', () => {
    expect(checkPass(level, results(3, true, 1000)).pass).toBe(false);
    expect(checkPass(level, []).pass).toBe(false);
    expect(checkPass(level, []).medianMs).toBe(Number.POSITIVE_INFINITY);
  });

  it('Boss 题（最后一题）答错则不通过', () => {
    const boss = findLevel('c1-06')!; // 8 题 boss 关
    const failBoss = checkPass(boss, results(8, (i) => i !== 7, 1000));
    expect(failBoss.acc).toBeCloseTo(0.875);
    expect(failBoss.bossOk).toBe(false);
    expect(failBoss.pass).toBe(false);

    const passBoss = checkPass(boss, results(8, true, 1000));
    expect(passBoss.bossOk).toBe(true);
    expect(passBoss.pass).toBe(true);
    expect(passBoss.stars).toBe(3);
  });
});

describe('每日编排', () => {
  it('默认编排：热身 1 分 + 主节 2 分 + 曲目关卡 2 分', () => {
    const plan = buildDailyPlan({ train: 'sig' }, { totalAttempts: 0, accuracy: null });
    expect(plan.map((b) => b.kind)).toEqual(['warmup', 'main', 'level']);
    expect(plan[0].minutes).toBe(1);
    expect(plan[1].minutes).toBe(2);
    expect(plan[2].minutes).toBe(2);
  });

  it('正确率低 → 主节 3 分钟', () => {
    const plan = buildDailyPlan({}, { totalAttempts: 40, accuracy: 0.7 });
    expect(plan.find((b) => b.kind === 'main')?.minutes).toBe(3);
  });

  it('表现好（≥20 题且 ≥85%）→ 追加 1 分钟冲刺；可强制开启', () => {
    const plan = buildDailyPlan({}, { totalAttempts: 20, accuracy: 0.85 });
    expect(plan.map((b) => b.kind)).toEqual(['warmup', 'main', 'level', 'sprint']);
    expect(plan.find((b) => b.kind === 'sprint')?.minutes).toBe(1);

    const forced = buildDailyPlan({ sprint: true, hasLevel: false });
    expect(forced.map((b) => b.kind)).toEqual(['warmup', 'main', 'sprint']);
    expect(forced.reduce((a, b) => a + b.minutes, 0)).toBe(4);
  });

  it('和弦块三种触发路径各一条；位置在 level 之后、sprint 之前', () => {
    // 无任何触发 → 不排和弦块
    expect(buildDailyPlan({}, { totalAttempts: 0, accuracy: null }).map((b) => b.kind)).toEqual([
      'warmup',
      'main',
      'level',
    ]);
    // 路径 1：任一 c5 关已通过
    const byPass = buildDailyPlan({}, { totalAttempts: 0, accuracy: null, passedLevelIds: ['c5-03'] });
    expect(byPass.map((b) => b.kind)).toEqual(['warmup', 'main', 'level', 'chord']);
    expect(buildDailyPlan({}, { totalAttempts: 0, accuracy: null, passedLevelIds: ['c1-01'] }).map((b) => b.kind)).not.toContain('chord');
    // 路径 2：主训练是四种新模式之一
    for (const train of ['func', 'diatonic', 'degrees', 'build'] as const) {
      expect(buildDailyPlan({ train }, { totalAttempts: 0, accuracy: null }).map((b) => b.kind)).toContain('chord');
    }
    expect(buildDailyPlan({ train: 'sig' }, { totalAttempts: 0, accuracy: null }).map((b) => b.kind)).not.toContain('chord');
    // 路径 3：总作答数 ≥30
    expect(buildDailyPlan({}, { totalAttempts: CHORD_MIN_ATTEMPTS, accuracy: null }).map((b) => b.kind)).toContain('chord');
    expect(buildDailyPlan({}, { totalAttempts: CHORD_MIN_ATTEMPTS - 1, accuracy: null }).map((b) => b.kind)).not.toContain('chord');
    // 位置与时长
    const full = buildDailyPlan({ sprint: true }, { totalAttempts: 30, accuracy: 0.9 });
    expect(full.map((b) => b.kind)).toEqual(['warmup', 'main', 'level', 'chord', 'sprint']);
    expect(full.find((b) => b.kind === 'chord')?.minutes).toBe(1);
    // 混编权重：func:diatonic:degrees:build = 3:3:2:2
    expect(CHORD_MIX_WEIGHTS).toEqual({ func: 3, diatonic: 3, degrees: 2, build: 2 });
  });
});
