import * as Haptics from 'expo-haptics';

import { useSettingsStore } from '@/state/settings';

/** Haptics respect the user's setting and never throw (some devices lack a vibrator). */
function enabled(): boolean {
  return useSettingsStore.getState().haptics;
}

export const haptics = {
  tap(): void {
    if (enabled()) Haptics.selectionAsync().catch(() => undefined);
  },
  impact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light): void {
    if (enabled()) Haptics.impactAsync(style).catch(() => undefined);
  },
  shutter(): void {
    if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  },
  success(): void {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
  warning(): void {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  },
};
