/**
 * 返回键纯逻辑单测：计时 / 两下判定 / 拦截优先（fake timers 注入依赖）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACK_EXIT_WINDOW_MS,
  createBackLogic,
  type BackHandlerDeps,
} from '../src/platform/back-handler';

interface Harness {
  deps: BackHandlerDeps;
  calls: { back: number; exit: number; toasts: string[] };
  setHome(v: boolean): void;
}

function setup(opts: { home?: boolean; intercept?: () => boolean } = {}): Harness {
  const calls = { back: 0, exit: 0, toasts: [] as string[] };
  let home = opts.home ?? true;
  const deps: BackHandlerDeps = {
    isHome: () => home,
    onBack: () => {
      calls.back += 1;
      return true;
    },
    onExit: () => {
      calls.exit += 1;
    },
    onToast: (msg) => {
      calls.toasts.push(msg);
    },
    intercept: opts.intercept,
  };
  return { deps, calls, setHome: (v) => (home = v) };
}

describe('返回键两下退出（纯逻辑）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('主页第 1 次只提示，不退出', () => {
    const { deps, calls } = setup();
    createBackLogic(deps).handleBack();
    expect(calls.toasts).toEqual(['再按一次退出应用']);
    expect(calls.exit).toBe(0);
    expect(calls.back).toBe(0);
  });

  it('2 秒窗口内第 2 次退出', () => {
    const { deps, calls } = setup();
    const logic = createBackLogic(deps);
    logic.handleBack();
    vi.advanceTimersByTime(BACK_EXIT_WINDOW_MS - 1);
    logic.handleBack();
    expect(calls.exit).toBe(1);
    expect(calls.toasts).toEqual(['再按一次退出应用']);
  });

  it('超时再按重新计时，不误退出', () => {
    const { deps, calls } = setup();
    const logic = createBackLogic(deps);
    logic.handleBack();
    vi.advanceTimersByTime(BACK_EXIT_WINDOW_MS);
    logic.handleBack();
    expect(calls.exit).toBe(0);
    expect(calls.toasts).toEqual(['再按一次退出应用', '再按一次退出应用']);
    logic.handleBack();
    expect(calls.exit).toBe(1);
  });

  it('自定义窗口生效', () => {
    const { deps, calls } = setup();
    const logic = createBackLogic(deps, 500);
    logic.handleBack();
    vi.advanceTimersByTime(500);
    logic.handleBack();
    expect(calls.exit).toBe(0);
  });

  it('非主页只回上一页，绝不退出', () => {
    const { deps, calls } = setup({ home: false });
    const logic = createBackLogic(deps);
    logic.handleBack();
    logic.handleBack();
    expect(calls.back).toBe(2);
    expect(calls.exit).toBe(0);
    expect(calls.toasts).toEqual([]);
  });

  it('页面返回会清掉主页的两下计时', () => {
    const { deps, calls, setHome } = setup();
    const logic = createBackLogic(deps);
    logic.handleBack(); // 主页第 1 次，armed
    setHome(false);
    logic.handleBack(); // 非主页返回
    setHome(true);
    logic.handleBack(); // 只应重新计时
    expect(calls.exit).toBe(0);
    expect(calls.toasts).toEqual(['再按一次退出应用', '再按一次退出应用']);
  });

  it('拦截优先：弹层消费后不返回、不提示、不退出', () => {
    const { deps, calls } = setup({
      home: false,
      intercept: () => true,
    });
    const logic = createBackLogic(deps);
    logic.handleBack();
    expect(calls.back).toBe(0);
    expect(calls.exit).toBe(0);
    expect(calls.toasts).toEqual([]);
  });

  it('拦截消费同样清掉两下计时', () => {
    let overlay = false;
    const { deps, calls } = setup({ intercept: () => overlay });
    const logic = createBackLogic(deps);
    logic.handleBack(); // 主页第 1 次，armed
    overlay = true;
    logic.handleBack(); // 弹层消费
    overlay = false;
    logic.handleBack(); // 应重新计时而非退出
    expect(calls.exit).toBe(0);
    expect(calls.toasts).toEqual(['再按一次退出应用', '再按一次退出应用']);
  });

  it('拦截返回 false 时走常规逻辑', () => {
    const { deps, calls } = setup({ home: false, intercept: () => false });
    createBackLogic(deps).handleBack();
    expect(calls.back).toBe(1);
  });

  it('dispose 清理计时与两下状态', () => {
    const { deps, calls } = setup();
    const logic = createBackLogic(deps);
    logic.handleBack();
    logic.dispose();
    vi.advanceTimersByTime(BACK_EXIT_WINDOW_MS);
    logic.handleBack();
    expect(calls.exit).toBe(0);
    expect(calls.toasts).toHaveLength(2);
  });
});
