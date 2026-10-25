import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/theme/tokens';

export interface ImageCompareProps {
  beforeUri: string;
  afterUri: string;
  width: number;
  height: number;
  /** Aspect (w/h) of the displayed photo, used to fit both layers identically. */
  aspect: number;
}

/** Split view for two saved files (original vs enhanced copy). */
function ImageCompareImpl({ beforeUri, afterUri, width, height, aspect }: ImageCompareProps) {
  const drawW = Math.min(width, height * aspect);
  const drawH = drawW / aspect;
  const split = useSharedValue(0.5);
  const start = useSharedValue(0.5);
  const pan = usePanGesture({
    onActivate: () => {
      'worklet';
      start.set(split.value);
    },
    onUpdate: (event) => {
      'worklet';
      split.set(Math.min(1, Math.max(0, start.value + event.translationX / drawW)));
    },
  });
  const clipStyle = useAnimatedStyle(() => ({ width: split.value * drawW }));
  const handleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: split.value * drawW - 1 }] }));
  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.container, { width, height }]} accessibilityLabel="Before and after comparison. Drag to compare.">
        <View style={{ width: drawW, height: drawH }}>
          <Image source={{ uri: afterUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
          <Animated.View style={[styles.clip, clipStyle]}>
            <Image source={{ uri: beforeUri }} style={{ width: drawW, height: drawH }} contentFit="cover" />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.handle, { height: drawH }, handleStyle]}>
            <View style={styles.knob} />
          </Animated.View>
          <View style={[styles.tag, { left: spacing.md }]} pointerEvents="none">
            <AppText variant="label" uppercase>
              Original
            </AppText>
          </View>
          <View style={[styles.tag, { right: spacing.md }]} pointerEvents="none">
            <AppText variant="label" uppercase color={colors.accent}>
              Enhanced
            </AppText>
          </View>
        </View>
      </View>
    </GestureDetector>
  );
}

export const ImageCompare = memo(ImageCompareImpl);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  clip: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  handle: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  knob: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  tag: {
    position: 'absolute',
    top: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    backgroundColor: colors.glassStrong,
  },
});
