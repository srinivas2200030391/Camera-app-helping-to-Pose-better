import { memo, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { colors, motion } from '@/theme/tokens';

const SIZE = 72;

/** Focus/metering indicator at the tapped point. `token` changes on every tap. */
function FocusRingImpl({ x, y, token }: { x: number; y: number; token: number }) {
  const scale = useSharedValue(1.4);
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (token === 0) return;
    scale.set(1.4);
    scale.set(withSpring(1, motion.spring));
    opacity.set(withSequence(withTiming(1, { duration: 90 }), withDelay(900, withTiming(0, { duration: 300 }))));
  }, [token, scale, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return <Animated.View pointerEvents="none" style={[styles.ring, { left: x - SIZE / 2, top: y - SIZE / 2 }, style]} />;
}

export const FocusRing = memo(FocusRingImpl);

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
});
