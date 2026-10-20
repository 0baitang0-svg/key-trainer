/**
 * 极简屏幕路由：一个挂载点 + 屏幕工厂表 + 历史栈。
 * 不用 hash / history API（打包进 Capacitor 后以栈式导航为准）。
 * 状态读写统一走 AppContext，屏幕自身只做展示与交互。
 */

import type { AppState } from '../core/store';

export type RouteName = 'onboarding' | 'home' | 'session' | 'result' | 'level-map' | 'profile' | 'settings';

export interface Route {
  name: RouteName;
  params?: unknown;
}

export interface ScreenInstance {
  root: HTMLElement;
  /** 离开屏幕时调用（清定时器、移除全局监听等） */
  destroy?: () => void;
}

/** 屏幕工厂：拿上下文与路由参数，返回可挂载的屏幕 */
export type ScreenFactory = (ctx: AppContext, params: unknown) => ScreenInstance;

/** 应用上下文：状态读写 + 导航（由 main.ts 注入真实实现） */
export interface AppContext {
  /** 当前状态（只读快照，写入请用 update） */
  getState(): AppState;
  /** 纯函数式更新状态，并自动持久化 */
  update(fn: (prev: AppState) => AppState): void;
  /** 立即持久化（一般不用手动调，update 会触发） */
  save(): void;
  navigate(route: Route): void;
  /** 用新屏幕替换栈顶（不产生返回层级） */
  replace(route: Route): void;
  /** 重置到某屏幕（清空历史） */
  reset(route: Route): void;
  back(): void;
  /**
   * 注册返回键拦截（弹层优先）：返回 true 表示弹层已关闭、本次返回已消费。
   * 屏幕 destroy 时传 null 注销。
   */
  setBackInterceptor(fn: (() => boolean) | null): void;
}

export type ScreenFactories = Record<RouteName, ScreenFactory>;

/** 页面切换淡入时长（ms），与 app.css 的 screen-in 动画保持一致 */
export const TRANSITION_MS = 150;

export class Router {
  private stack: Route[] = [];
  private current: ScreenInstance | null = null;
  private factories: ScreenFactories;

  constructor(
    private mountPoint: HTMLElement,
    private ctx: AppContext,
    factories: ScreenFactories,
  ) {
    this.factories = factories;
  }

  /** 当前路由（栈顶） */
  get route(): Route | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
  }

  /** 打开新屏幕（入栈） */
  navigate(route: Route): void {
    this.stack.push(route);
    this.render(route);
  }

  /** 返回上一屏；栈底时回到首页 */
  back(): void {
    if (this.stack.length > 1) {
      this.stack.pop();
      this.render(this.stack[this.stack.length - 1]);
      return;
    }
    this.stack = [{ name: 'home' }];
    this.render(this.stack[0]);
  }

  /** 用新屏幕替换栈顶（不产生返回层级） */
  replace(route: Route): void {
    if (this.stack.length > 0) this.stack.pop();
    this.stack.push(route);
    this.render(route);
  }

  /** 重置到某屏幕（清空历史） */
  reset(route: Route): void {
    this.stack = [route];
    this.render(route);
  }

  private render(route: Route): void {
    if (this.current?.destroy) this.current.destroy();
    const factory = this.factories[route.name];
    const screen = factory(this.ctx, route.params);
    this.current = screen;
    screen.root.classList.add('screen-in');
    this.mountPoint.replaceChildren(screen.root);
  }
}
