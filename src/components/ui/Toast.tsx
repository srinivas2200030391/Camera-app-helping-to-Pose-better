import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors, radii, shadows, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

type ToastTone = 'info' | 'success' | 'error';

interface ToastState {
  message: string | null;
  tone: ToastTone;
  key: number;
  show: (message: string, tone?: ToastTone) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>()((set) => ({
  message: null,
  tone: 'info',
  key: 0,
  show: (message, tone = 'info') => set((state) => ({ message, tone, key: state.key + 1 })),
  hide: () => set({ message: null }),
}));

export const toast = {
  info: (message: string) => useToastStore.getState().show(message, 'info'),
  success: (message: string) => useToastStore.getState().show(message, 'success'),
  error: (message: string) => useToastStore.getState().show(message, 'error'),
};

const TONE_COLOR: Record<ToastTone, string> = {
  info: colors.text,
  success: colors.success,
  error: colors.danger,
};

/** Mounted once in the root layout. */
export function ToastHost() {
  const { message, tone, key, hide } = useToastStore();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(hide, tone === 'error' ? 4200 : 2600);
    return () => clearTimeout(timer);
  }, [message, tone, key, hide]);
  if (!message) return null;
  return (
    <Animated.View
      key={key}
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(160)}
      style={[styles.toast, { bottom: insets.bottom + 120 }]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <AppText variant="body" color={TONE_COLOR[tone]} align="center">
        {message}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.xxl,
    right: spacing.xxl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.glassStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
    ...shadows.floating,
  },
});
