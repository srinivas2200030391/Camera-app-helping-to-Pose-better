import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors } from '@/theme/tokens';

/** Determinate progress (0..1). Animated on the UI thread so it keeps moving during JS work. */
export function ProgressBar({ progress, height = 4 }: { progress: number; height?: number }) {
  const value = useSharedValue(progress);
  useEffect(() => {
    value.set(withTiming(Math.min(1, Math.max(0, progress)), { duration: 260 }));
  }, [progress, value]);
  const fill = useAnimatedStyle(() => ({ width: `${value.value * 100}%` }));
  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2 }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
    >
      <Animated.View style={[styles.fill, { borderRadius: height / 2 }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: colors.hairlineStrong,
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
});
