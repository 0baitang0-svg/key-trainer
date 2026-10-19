/**
 * 应用入口：初始化持久化状态 → 装配 AppContext / 路由 → 进入首页。
 * 持久化适配器可注入（默认 localStorage，后续可换 Capacitor Preferences）。
 */

import './app.css';
import {
  STORAGE_KEY,
  loadState,
  saveState,
  type AppState,
  type StorageAdapter,
} from './core/store';
import { createStorageAdapter } from './platform/storage-adapter';
import { Router, type AppContext, type Route, type ScreenFactories } from './ui/router';
import { homeScreen } from './ui/screens/home';
import { sessionScreen } from './ui/screens/session';
import { resultScreen } from './ui/screens/result';
import { levelMapScreen } from './ui/screens/level-map';
import { profileScreen } from './ui/screens/profile';
import { applyFontClass, settingsScreen } from './ui/screens/settings';
import { audioEngine } from './audio/engine';
import { playClick, setMuted, setVolume } from './audio/sfx';

export interface MountOptions {
  /** 持久化适配器（默认 localStorageAdapter） */
  storage?: StorageAdapter;
  /** 存储 key（默认 kst_v2） */
  storageKey?: string;
}

export async function mountApp(root: HTMLElement, options: MountOptions = {}): Promise<void> {
  const storage = options.storage ?? createStorageAdapter();
  const storageKey = options.storageKey ?? STORAGE_KEY;
  let state: AppState = await loadState(storage, storageKey);
  let router: Router | null = null;

  const ctx: AppContext = {
    getState: () => state,
    update(fn: (prev: AppState) => AppState): void {
      state = fn(state);
      void saveState(storage, state, storageKey);
    },
    save(): void {
      void saveState(storage, state, storageKey);
    },
    navigate: (route: Route) => router?.navigate(route),
    replace: (route: Route) => router?.replace(route),
    reset: (route: Route) => router?.reset(route),
    back: () => router?.back(),
  };

  const factories: ScreenFactories = {
    home: () => homeScreen(ctx),
    session: (_ctx, params) => sessionScreen(ctx, params),
    result: (_ctx, params) => resultScreen(ctx, params),
    'level-map': () => levelMapScreen(ctx),
    profile: () => profileScreen(ctx),
    settings: () => settingsScreen(ctx),
  };

  router = new Router(root, ctx, factories);

  // 音频 / 字号设置落地
  setVolume(state.config.volume);
  setMuted(!state.config.sound);
  applyFontClass(state.config.bigFont);

  // 浏览器自动播放策略：首次手势内预热音频
  const warmup = (): void => {
    try {
      audioEngine.warmup();
    } catch {
      // 无 AudioContext 环境静默
    }
  };
  document.addEventListener('pointerdown', warmup, { once: true });
  document.addEventListener('touchstart', warmup, { once: true });

  // 按钮轻响
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement | null)?.closest?.('button');
    if (btn && !btn.disabled) {
      try {
        playClick();
      } catch {
        // 音频不可用时静默
      }
    }
  });

  router.reset({ name: 'home' });
}

const appEl = document.getElementById('app');
if (appEl) void mountApp(appEl);
