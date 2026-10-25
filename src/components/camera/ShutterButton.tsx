import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { colors, motion } from '@/theme/tokens';

export interface ShutterButtonProps {
  onPress: () => void;
  busy: boolean;
  /** Seconds remaining when a timer is running. */
  countdown: number | null;
  /** Waiting for a face to start the hands-free timer. */
  armed: boolean;
  size?: number;
}

function ShutterButtonImpl({ onPress, busy, countdown, armed, size = 78 }: ShutterButtonProps) {
  const press = useSharedValue(1);
  const inner = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const counting = countdown != null;
  const label = counting ? `Cancel timer, ${countdown} seconds left` : armed ? 'Cancel hands-free capture' : 'Take photo';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy }}
      onPressIn={() => {
        press.set(withSpring(0.86, motion.spring));
      }}
      onPressOut={() => {
        press.set(withSequence(withTiming(0.9, { duration: 40 }), withSpring(1, motion.spring)));
      }}
      onPress={onPress}
      hitSlop={10}
    >
      <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, (counting || armed) && styles.ringActive]}>
        <Animated.View
          style={[
            styles.inner,
            { width: size - 14, height: size - 14, borderRadius: (size - 14) / 2 },
            busy && styles.innerBusy,
            (counting || armed) && styles.innerTimer,
            inner,
          ]}
        >
          {counting ? (
            <AppText variant="headline" color={colors.accentText}>
              {countdown}
            </AppText>
          ) : armed ? (
            <View style={styles.stop} />
          ) : null}
        </Animated.View>
      </View>
    </Pressable>
  );
}

export const ShutterButton = memo(ShutterButtonImpl);

const styles = StyleSheet.create({
  ring: {
    borderWidth: 3.5,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringActive: {
    borderColor: colors.accent,
  },
  inner: {
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerBusy: {
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  innerTimer: {
    backgroundColor: colors.accent,
  },
  stop: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: colors.accentText,
  },
});
