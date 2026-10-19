/**
 * 震动反馈：原生走 Capacitor Haptics，Web 退化为 navigator.vibrate，均无则静默。
 */

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export type HapticKind = 'light' | 'success' | 'error';

export async function haptic(kind: HapticKind): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      if (kind === 'light') await Haptics.impact({ style: ImpactStyle.Light });
      else {
        await Haptics.notification({
          type: kind === 'success' ? NotificationType.Success : NotificationType.Warning,
        });
      }
      return;
    }
    const vib = navigator.vibrate;
    if (typeof vib === 'function') {
      vib.call(navigator, kind === 'light' ? [8] : kind === 'success' ? [12, 40, 18] : [24, 60, 24]);
    }
  } catch {
    // 震动不可用时静默
  }
}
