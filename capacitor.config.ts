import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kst.keytrainer',
  appName: '调号训练',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
