import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { LEVEL_TOLERANCE_DEG } from '@/camera/composition';
import { colors } from '@/theme/tokens';
import { haptics } from '@/utils/haptics';

export interface LevelIndicatorProps {
  roll: SharedValue<number>;
  visible: SharedValue<number>;
  width: number;
}

/**
 * Horizon level: the long line counter-rotates with the phone so it stays parallel to the real
 * horizon; the short fixed ticks mark "level". Turns gold within ±1° (with a light haptic tick).
 * Runs on the UI thread.
 */
function LevelIndicatorImpl({ roll, visible, width }: LevelIndicatorProps) {
  const deviation = useDerivedValue(() => {
    const quadrant = Math.round(roll.value / 90);
    return roll.value - quadrant * 90;
  });
  const levelAmount = useSharedValue(0);
  useAnimatedReaction(
    () => (visible.value > 0 && Math.abs(deviation.value) <= LEVEL_TOLERANCE_DEG ? 1 : 0),
    (current, previous) => {
      if (current === previous) return;
      levelAmount.set(withTiming(current, { duration: 160 }));
      if (current === 1 && previous === 0) scheduleOnRN(haptics.tap);
    },
  );

  const lineStyle = useAnimatedStyle(() => ({
    opacity: withTiming(visible.value, { duration: 200 }),
    transform: [{ rotate: `${-Math.max(-30, Math.min(30, deviation.value))}deg` }],
    backgroundColor: interpolateColor(levelAmount.value, [0, 1], ['rgba(255,255,255,0.85)', colors.accent]),
  }));
  const tickStyle = useAnimatedStyle(() => ({
    opacity: withTiming(visible.value, { duration: 200 }),
    backgroundColor: interpolateColor(levelAmount.value, [0, 1], ['rgba(255,255,255,0.6)', colors.accent]),
  }));
  const lineWidth = Math.min(width * 0.42, 180);
  return (
    <View style={styles.container} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.tick, { marginRight: lineWidth / 2 + 10 }, tickStyle]} />
      <Animated.View style={[styles.line, { width: lineWidth }, lineStyle]} />
      <Animated.View style={[styles.tick, { marginLeft: lineWidth / 2 + 10 }, tickStyle]} />
    </View>
  );
}

export const LevelIndicator = memo(LevelIndicatorImpl);

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    position: 'absolute',
    height: 2,
    borderRadius: 1,
  },
  tick: {
    position: 'absolute',
    width: 16,
    height: 2,
    borderRadius: 1,
  },
});
