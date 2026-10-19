/**
 * 持久化适配：原生（Capacitor）走 Preferences 落原生 xml，
 * 防 WebView 数据被系统清理；Web 环境退化为 localStorage。
 */

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { localStorageAdapter, type StorageAdapter } from '../core/store';

export function createStorageAdapter(): StorageAdapter {
  if (!Capacitor.isNativePlatform()) return localStorageAdapter;
  return {
    async get(key: string): Promise<string | null> {
      const { value } = await Preferences.get({ key });
      return value ?? null;
    },
    async set(key: string, value: string): Promise<void> {
      await Preferences.set({ key, value });
    },
  };
}
