/**
 * 返回键统一处理：弹层优先 → 页面返回 → 主页两下退出。
 * 安卓走 Capacitor App 的 backButton 事件；Web 退化为 history 哨兵 + popstate，
 * 退出动作退化为提示「网页版请关闭标签页」。
 * 计时 / 两下判定 / 拦截优先为纯逻辑（createBackLogic），可注入依赖单测。
 */

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export interface BackHandlerDeps {
  /** 当前是否主页（只有主页才走两下退出） */
  isHome(): boolean;
  /** 返回上一页 / 关闭弹层；返回 true = 本次返回已被消费（页面返回/弹层关闭） */
  onBack(): boolean;
  /** 两下确认后退出 */
  onExit(): void;
  /** 底部提示 */
  onToast(msg: string): void;
  /** 弹层拦截（优先于一切）：返回 true 表示弹层已关闭、本次返回已消费 */
  intercept?: () => boolean;
}

/** 主页两下退出的时间窗（ms） */
export const BACK_EXIT_WINDOW_MS = 2000;

export interface BackLogic {
  /** 处理一次返回键事件 */
  handleBack(): void;
  /** 清理计时器 */
  dispose(): void;
}

/** 纯逻辑：拦截优先 → 非主页返回 → 主页两下退出（2 秒窗口，超时重新计时） */
export function createBackLogic(deps: BackHandlerDeps, windowMs: number = BACK_EXIT_WINDOW_MS): BackLogic {
  let armed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const disarm = (): void => {
    armed = false;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    handleBack(): void {
      // 弹层优先：弹层关掉即视为本次返回已消费
      if (deps.intercept?.()) {
        disarm();
        return;
      }
      // 非主页：只回上一页（router 栈底落 home），绝不退出
      if (!deps.isHome()) {
        if (deps.onBack()) disarm();
        return;
      }
      // 主页：两下退出
      if (armed) {
        disarm();
        deps.onExit();
        return;
      }
      armed = true;
      deps.onToast('再按一次退出应用');
      timer = setTimeout(() => {
        armed = false;
        timer = null;
      }, windowMs);
    },
    dispose: disarm,
  };
}

/**
 * 装配返回键监听，返回卸载函数。
 * 安卓：Capacitor App 的 backButton；Web：history 哨兵 + popstate。
 */
export function installBackHandler(deps: BackHandlerDeps): () => void {
  const native = Capacitor.isNativePlatform();
  // Web 退化：两下确认后不出应用，改为提示关闭标签页
  const logic = createBackLogic(
    native ? deps : { ...deps, onExit: () => deps.onToast('网页版请关闭标签页') },
  );

  if (native) {
    let removed = false;
    const handle = App.addListener('backButton', () => logic.handleBack());
    return () => {
      if (removed) return;
      removed = true;
      void handle.then((h) => h.remove());
      logic.dispose();
    };
  }

  // Web：pushState 哨兵 + popstate，复用同一套两下逻辑
  const pushSentinel = (): void => {
    try {
      history.pushState({ kstBack: true }, '');
    } catch {
      // 历史不可用时静默
    }
  };
  const onPop = (): void => {
    pushSentinel();
    logic.handleBack();
  };
  pushSentinel();
  window.addEventListener('popstate', onPop);
  return () => {
    window.removeEventListener('popstate', onPop);
    logic.dispose();
  };
}
