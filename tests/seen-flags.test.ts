import { describe, expect, it } from 'vitest';
import { createInitialState, hasSeenFlag, markFlagSeen, migrate, type AppState } from '../src/core/store';

/** 功能气泡的五条一次性标记 */
const COACH_FLAGS = ['coach.keyboard', 'coach.swipe', 'coach.rulecard', 'coach.sprint', 'coach.weakbar'];

describe('seenFlags 一次性引导标记（幂等）', () => {
  it('markFlagSeen 首次标记写入，重复标记返回原状态、不重复追加', () => {
    const s0 = createInitialState();
    expect(s0.seenFlags).toEqual([]);

    const s1 = markFlagSeen(s0, 'coach.swipe');
    expect(s1.seenFlags).toEqual(['coach.swipe']);
    expect(s1).not.toBe(s0);

    const s2 = markFlagSeen(s1, 'coach.swipe');
    expect(s2).toBe(s1);
    expect(s2.seenFlags).toEqual(['coach.swipe']);
  });

  it('多条标记互不影响、顺序保留', () => {
    let s = createInitialState();
    for (const f of COACH_FLAGS) s = markFlagSeen(s, f);
    expect(s.seenFlags).toEqual(COACH_FLAGS);

    // 已全部见过后再标记任意一条，状态不变
    for (const f of COACH_FLAGS) expect(markFlagSeen(s, f)).toBe(s);
  });

  it('hasSeenFlag 判定已弹过 / 未弹过', () => {
    const s = markFlagSeen(createInitialState(), 'coach.rulecard');
    expect(hasSeenFlag(s, 'coach.rulecard')).toBe(true);
    expect(hasSeenFlag(s, 'coach.keyboard')).toBe(false);
  });

  it('migrate：缺省 seenFlags 为 []，导入 JSON 保留', () => {
    expect(migrate({}).seenFlags).toEqual([]);

    const s = markFlagSeen(createInitialState(), 'coach.sprint');
    expect(migrate(JSON.parse(JSON.stringify(s))).seenFlags).toEqual(['coach.sprint']);
    // 旧字段名 flags 也能迁移
    expect(migrate({ flags: ['coach.weakbar'] }).seenFlags).toEqual(['coach.weakbar']);
  });
});

describe('onboarded 首启引导标记', () => {
  it('默认未引导；导出 / 导入保留引导完成状态', () => {
    const s: AppState = { ...createInitialState(), onboarded: true };
    expect(createInitialState().onboarded).toBe(false);
    expect(migrate(JSON.parse(JSON.stringify(s))).onboarded).toBe(true);
  });
});
