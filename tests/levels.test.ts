import { describe, expect, it } from 'vitest';
import {
  CHAPTERS,
  CHAPTER_PASS_MS,
  LEVELS,
  buildDailyPlan,
  chapterLevels,
  checkPass,
  findLevel,
  levelPickConfig,
  type Level,
  type LevelAttempt,
} from '../src/core/levels';

function results(n: number, ok: boolean | ((i: number) => boolean), ms: number | ((i: number) => number)): LevelAttempt[] {
  return Array.from({ length: n }, (_, i) => ({
    ok: typeof ok === 'function' ? ok(i) : ok,
    reactionMs: typeof ms === 'function' ? ms(i) : ms,
  }));
}

describe('关卡数据', () => {
  it('4 章、每章 6–10 关、题数 5–8、门槛齐整', () => {
    expect(CHAPTERS).toHaveLength(4);
    expect(LEVELS.length).toBeGreaterThanOrEqual(24);
    expect(CHAPTER_PASS_MS).toEqual([2500, 2000, 1500, 1200]);
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
});
