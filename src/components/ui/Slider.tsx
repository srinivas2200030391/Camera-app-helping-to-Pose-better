import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, motion, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Value the fill starts from (0 for bipolar sliders such as exposure). Defaults to `min`. */
  origin?: number;
  /** Value restored by a double tap. Defaults to `origin`. */
  resetValue?: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  format?: (value: number) => string;
  description?: string;
  disabled?: boolean;
  compact?: boolean;
}

const THUMB = 22;

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  origin = min,
  resetValue,
  onChange,
  onCommit,
  format = (v) => `${Math.round(v)}`,
  description,
  disabled,
  compact,
}: SliderProps) {
  const range = Math.max(1e-6, max - min);
  const toPosition = (v: number) => Math.min(1, Math.max(0, (v - min) / range));
  const position = useSharedValue(toPosition(value));
  const width = useSharedValue(1);
  const startPosition = useSharedValue(0);
  const dragging = useSharedValue(0);
  const lastEmitted = useSharedValue(value);
  // Local value only while dragging; otherwise the prop is the source of truth.
  const [dragValue, setDragValue] = useState<number | null>(null);
  const showValue = dragValue ?? value;

  useEffect(() => {
    if (dragging.get() === 0) position.set(withSpring(Math.min(1, Math.max(0, (value - min) / Math.max(1e-6, max - min))), motion.spring));
    lastEmitted.set(value);
  }, [value, min, max, dragging, position, lastEmitted]);

  const emit = (next: number) => {
    setDragValue(next);
    onChange(next);
  };
  const commit = (next: number) => {
    setDragValue(null);
    onCommit?.(next);
  };

  const pan = usePanGesture({
    enabled: !disabled,
    activeOffsetX: [-4, 4],
    failOffsetY: [-14, 14],
    onActivate: () => {
      'worklet';
      dragging.set(1);
      startPosition.set(position.value);
    },
    onUpdate: (event) => {
      'worklet';
      const raw = Math.min(1, Math.max(0, startPosition.value + event.translationX / width.value));
      const stepped = Math.round((min + raw * range) / step) * step;
      const clamped = Math.min(max, Math.max(min, stepped));
      position.set((clamped - min) / range);
      if (clamped !== lastEmitted.value) {
        lastEmitted.set(clamped);
        scheduleOnRN(emit, clamped);
      }
    },
    onFinalize: () => {
      'worklet';
      if (dragging.value === 1) {
        dragging.set(0);
        scheduleOnRN(commit, lastEmitted.value);
      }
    },
  });

  const reset = resetValue ?? origin;
  const applyReset = () => {
    emit(reset);
    commit(reset);
  };
  const doubleTap = useTapGesture({
    enabled: !disabled,
    numberOfTaps: 2,
    onActivate: () => {
      'worklet';
      position.set(withSpring(Math.min(1, Math.max(0, (reset - min) / range)), motion.spring));
      lastEmitted.set(reset);
      scheduleOnRN(applyReset);
    },
  });
  const gesture = useSimultaneousGestures(pan, doubleTap);

  const originPosition = toPosition(origin);
  const fillStyle = useAnimatedStyle(() => {
    const from = Math.min(originPosition, position.value);
    const to = Math.max(originPosition, position.value);
    return { left: from * width.value, width: (to - from) * width.value };
  });
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value * width.value - THUMB / 2 }, { scale: dragging.value ? 1.15 : 1 }],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    width.set(Math.max(1, event.nativeEvent.layout.width));
  };

  return (
    <View style={[styles.container, compact && styles.compact, disabled && { opacity: 0.45 }]}>
      <View style={styles.header}>
        <AppText variant="caption" color={colors.textSecondary}>
          {label}
        </AppText>
        <AppText variant="caption" color={showValue === reset ? colors.textTertiary : colors.text} style={styles.value}>
          {format(showValue)}
        </AppText>
      </View>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.hitArea}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityHint={description}
          accessibilityValue={{ text: format(showValue) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            const delta = (event.nativeEvent.actionName === 'increment' ? 1 : -1) * step * Math.max(1, Math.round(range / step / 20));
            const next = Math.min(max, Math.max(min, value + delta));
            emit(next);
            commit(next);
          }}
        >
          <View style={styles.track} onLayout={onLayout}>
            <Animated.View style={[styles.fill, fillStyle]} />
            {origin > min && origin < max ? <View style={[styles.originTick, { left: `${originPosition * 100}%` }]} /> : null}
            <Animated.View style={[styles.thumb, thumbStyle]} />
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.sm,
  },
  compact: {
    paddingVertical: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  value: {
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  hitArea: {
    height: 32,
    justifyContent: 'center',
  },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.hairlineStrong,
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  originTick: {
    position: 'absolute',
    top: -4,
    width: 2,
    height: 11,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: colors.textTertiary,
  },
  thumb: {
    position: 'absolute',
    top: -(THUMB / 2) + 1.5,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
