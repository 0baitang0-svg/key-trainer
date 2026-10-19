import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相对资源路径，便于后续 Capacitor 打包安卓
  base: './',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
