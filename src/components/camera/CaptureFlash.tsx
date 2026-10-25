import { useImperativeHandle, type Ref } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

export interface CaptureFlashHandle {
  /** Brief dark blink: visual confirmation that a photo was taken. */
  blink: () => void;
  /** Bright warm-white fill used as a front-camera "screen flash". */
  setScreenFlash: (on: boolean) => void;
}

export function CaptureFlash({ ref }: { ref?: Ref<CaptureFlashHandle> }) {
  const dark = useSharedValue(0);
  const light = useSharedValue(0);
  useImperativeHandle(ref, () => ({
    blink: () => {
      dark.set(withSequence(withTiming(0.65, { duration: 50 }), withTiming(0, { duration: 180 })));
    },
    setScreenFlash: (on) => {
      light.set(withTiming(on ? 1 : 0, { duration: on ? 60 : 220 }));
    },
  }));
  const darkStyle = useAnimatedStyle(() => ({ opacity: dark.value }));
  const lightStyle = useAnimatedStyle(() => ({ opacity: light.value }));
  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dark, darkStyle]} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.light, lightStyle]} />
    </>
  );
}

const styles = StyleSheet.create({
  dark: { backgroundColor: '#000' },
  light: { backgroundColor: '#FFF8EE' },
});
