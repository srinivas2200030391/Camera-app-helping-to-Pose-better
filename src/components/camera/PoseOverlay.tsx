import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture, usePinchGesture, useRotationGesture, useSimultaneousGestures } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { PoseFigure } from '@/components/pose/PoseFigure';
import type { Pose } from '@/poses/types';
import type { OverlayStyle } from '@/state/settings';
import { colors, motion, radii } from '@/theme/tokens';

export interface PoseOverlayProps {
  pose: Pose;
  /** Size of the camera frame the overlay sits in. */
  width: number;
  height: number;
  opacity: number;
  variant: OverlayStyle;
  mirrored: boolean;
  editing: boolean;
  resetToken: number;
}

const MIN_SCALE = 0.35;
const MAX_SCALE = 2.6;

/**
 * Pose guide layered over the preview. It is a React view above the camera; captures come from
 * the camera pipeline, so the guide can never appear in a photo.
 */
function PoseOverlayImpl({ pose, width, height, opacity, variant, mirrored, editing, resetToken }: PoseOverlayProps) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const start = useSharedValue({ tx: 0, ty: 0, scale: 1, rotation: 0 });

  useEffect(() => {
    tx.set(withSpring(0, motion.spring));
    ty.set(withSpring(0, motion.spring));
    scale.set(withSpring(1, motion.spring));
    rotation.set(withSpring(0, motion.spring));
  }, [resetToken, pose.id, tx, ty, scale, rotation]);

  const pan = usePanGesture({
    enabled: editing,
    maxPointers: 2,
    onActivate: () => {
      'worklet';
      start.set({ ...start.value, tx: tx.value, ty: ty.value });
    },
    onUpdate: (event) => {
      'worklet';
      tx.set(start.value.tx + event.translationX);
      ty.set(start.value.ty + event.translationY);
    },
  });
  const pinch = usePinchGesture({
    enabled: editing,
    onActivate: () => {
      'worklet';
      start.set({ ...start.value, scale: scale.value });
    },
    onUpdate: (event) => {
      'worklet';
      scale.set(Math.min(MAX_SCALE, Math.max(MIN_SCALE, start.value.scale * event.scale)));
    },
  });
  const rotate = useRotationGesture({
    enabled: editing,
    onActivate: () => {
      'worklet';
      start.set({ ...start.value, rotation: rotation.value });
    },
    onUpdate: (event) => {
      'worklet';
      rotation.set(start.value.rotation + event.rotation);
    },
  });
  const gestures = useSimultaneousGestures(pan, pinch, rotate);

  // The pose is authored in a 3:4 box; fit it inside the frame (contain).
  const boxHeight = Math.min(height, (width * 4) / 3);
  const boxWidth = (boxHeight * 3) / 4;

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }, { rotate: `${rotation.value}rad` }],
  }));

  return (
    <GestureDetector gesture={gestures}>
      <View style={StyleSheet.absoluteFill} pointerEvents={editing ? 'auto' : 'none'}>
        <View style={styles.center} pointerEvents="none">
          <Animated.View style={[{ width: boxWidth, height: boxHeight }, animated]}>
            <View style={{ opacity }} needsOffscreenAlphaCompositing renderToHardwareTextureAndroid>
              <PoseFigure figures={pose.figures} width={boxWidth} height={boxHeight} variant={variant} mirrored={mirrored} />
            </View>
            {editing ? <View style={styles.editFrame} /> : null}
          </Animated.View>
        </View>
      </View>
    </GestureDetector>
  );
}

export const PoseOverlay = memo(PoseOverlayImpl);

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editFrame: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    borderRadius: radii.md,
  },
});
