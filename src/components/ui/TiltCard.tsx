import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type GestureResponderEvent, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, motion, radii } from '@/theme/tokens';
import { haptics } from '@/utils/haptics';

const MAX_TILT = 6;

export interface TiltCardProps {
  children: ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  accessibilityHint?: string;
}

/** Card that tilts toward the touch point (lightweight 3D, UI thread only). */
export function TiltCard({ children, onPress, onLongPress, style, accessibilityLabel, accessibilityHint }: TiltCardProps) {
  const reduceMotion = useReducedMotion();
  const size = useSharedValue({ width: 1, height: 1 });
  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  const onLayout = (event: LayoutChangeEvent) => {
    size.set({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height });
  };
  const pressIn = (event: GestureResponderEvent) => {
    scale.set(withSpring(0.97, motion.spring));
    glow.set(withSpring(1, motion.spring));
    if (reduceMotion) return;
    const { locationX, locationY } = event.nativeEvent;
    const nx = locationX / size.value.width - 0.5;
    const ny = locationY / size.value.height - 0.5;
    rotateY.set(withSpring(nx * MAX_TILT * 2, motion.spring));
    rotateX.set(withSpring(-ny * MAX_TILT * 2, motion.spring));
  };
  const pressOut = () => {
    scale.set(withSpring(1, motion.softSpring));
    rotateX.set(withSpring(0, motion.softSpring));
    rotateY.set(withSpring(0, motion.softSpring));
    glow.set(withSpring(0, motion.softSpring));
  };

  const animated = useAnimatedStyle(() => ({
    transform: [{ perspective: 700 }, { rotateX: `${rotateX.value}deg` }, { rotateY: `${rotateY.value}deg` }, { scale: scale.value }],
    borderColor: glow.value > 0.5 ? colors.hairlineStrong : colors.hairline,
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      onLongPress={onLongPress}
      style={style}
    >
      <Animated.View style={[styles.card, animated]} onLayout={onLayout}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
