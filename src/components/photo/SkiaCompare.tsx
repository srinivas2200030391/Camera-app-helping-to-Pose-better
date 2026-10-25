import { Canvas, Group, Image as SkiaImage, rect, type SkImage } from '@shopify/react-native-skia';
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, useLongPressGesture, usePanGesture, useSimultaneousGestures } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/theme/tokens';

export interface SkiaCompareProps {
  original: SkImage;
  processed: SkImage;
  /** Display box; the image is fitted (contain) inside it. */
  width: number;
  height: number;
  /** Image pixel size (both images share it). */
  imageWidth: number;
  imageHeight: number;
  /** Show the draggable split; when false the processed image is shown (hold to see the original). */
  compare: boolean;
}

/**
 * Before/after for the live preview. The split position lives on the UI thread and is passed
 * straight to Skia, so dragging never re-renders React.
 */
function SkiaCompareImpl({ original, processed, width, height, imageWidth, imageHeight, compare }: SkiaCompareProps) {
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const drawW = imageWidth * scale;
  const drawH = imageHeight * scale;
  const x0 = (width - drawW) / 2;
  const y0 = (height - drawH) / 2;

  const split = useSharedValue(compare ? 0.5 : 0);
  const holding = useSharedValue(0);
  const start = useSharedValue(0.5);

  useEffect(() => {
    split.set(withTiming(compare ? 0.5 : 0, { duration: 220 }));
  }, [compare, split]);

  const clip = useDerivedValue(() => {
    const amount = holding.value === 1 ? 1 : split.value;
    return rect(x0, y0, drawW * amount, drawH);
  });

  const pan = usePanGesture({
    enabled: compare,
    onActivate: () => {
      'worklet';
      start.set(split.value);
    },
    onUpdate: (event) => {
      'worklet';
      split.set(Math.min(1, Math.max(0, start.value + event.translationX / drawW)));
    },
  });
  const hold = useLongPressGesture({
    enabled: !compare,
    minDuration: 180,
    onActivate: () => {
      'worklet';
      holding.set(1);
    },
    onFinalize: () => {
      'worklet';
      holding.set(0);
    },
  });
  const gestures = useSimultaneousGestures(pan, hold);

  const handleStyle = useAnimatedStyle(() => ({
    opacity: compare ? 1 : 0,
    transform: [{ translateX: x0 + split.value * drawW - 1 }],
  }));
  const holdLabel = useAnimatedStyle(() => ({ opacity: withTiming(holding.value, { duration: 120 }) }));

  return (
    <GestureDetector gesture={gestures}>
      <View style={{ width, height }} accessibilityLabel={compare ? 'Before and after comparison. Drag to compare.' : 'Edited photo. Press and hold to see the original.'}>
        <Canvas style={{ width, height }}>
          <SkiaImage image={processed} x={x0} y={y0} width={drawW} height={drawH} fit="fill" />
          <Group clip={clip}>
            <SkiaImage image={original} x={x0} y={y0} width={drawW} height={drawH} fit="fill" />
          </Group>
        </Canvas>
        <Animated.View pointerEvents="none" style={[styles.handle, { top: y0, height: drawH }, handleStyle]}>
          <View style={styles.knob} />
        </Animated.View>
        {compare ? (
          <>
            <View style={[styles.tag, { left: x0 + spacing.md, top: y0 + spacing.md }]} pointerEvents="none">
              <AppText variant="label" uppercase>
                Before
              </AppText>
            </View>
            <View style={[styles.tag, { right: x0 + spacing.md, top: y0 + spacing.md }]} pointerEvents="none">
              <AppText variant="label" uppercase color={colors.accent}>
                After
              </AppText>
            </View>
          </>
        ) : (
          <Animated.View style={[styles.tag, { left: x0 + spacing.md, top: y0 + spacing.md }, holdLabel]} pointerEvents="none">
            <AppText variant="label" uppercase>
              Original
            </AppText>
          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
}

export const SkiaCompare = memo(SkiaCompareImpl);

const styles = StyleSheet.create({
  handle: {
    position: 'absolute',
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
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    backgroundColor: colors.glassStrong,
  },
});
