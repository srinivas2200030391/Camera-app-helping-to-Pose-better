import { Sun } from 'lucide-react-native';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, withTiming, type SharedValue } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { Slider } from '@/components/ui/Slider';
import { colors, radii, spacing } from '@/theme/tokens';
import { formatEv } from '@/utils/format';
import { haptics } from '@/utils/haptics';

export interface ExposureControlProps {
  exposure: SharedValue<number>;
  min: number;
  max: number;
}

/** EV chip that expands into a compensation slider (within the device's supported range). */
function ExposureControlImpl({ exposure, min, max }: ExposureControlProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(0);
  const lo = Math.max(min, -2);
  const hi = Math.min(max, 2);
  const apply = (next: number) => {
    setValue(next);
    exposure.set(withTiming(next, { duration: 90 }));
  };
  return (
    <View style={styles.container}>
      {open ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.panel}>
          <Slider label="Exposure" value={value} min={lo} max={hi} step={0.1} origin={0} onChange={apply} format={formatEv} compact />
        </Animated.View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Exposure compensation ${formatEv(value)}`}
        accessibilityHint="Opens the exposure slider"
        onPress={() => {
          haptics.tap();
          setOpen((current) => !current);
        }}
        onLongPress={() => apply(0)}
        style={[styles.chip, (open || value !== 0) && styles.chipActive]}
        hitSlop={6}
      >
        <Sun size={15} color={value !== 0 ? colors.accent : colors.text} strokeWidth={2} />
        <AppText variant="caption" color={value !== 0 ? colors.accent : colors.text} style={styles.text}>
          {formatEv(value)}
        </AppText>
      </Pressable>
    </View>
  );
}

export const ExposureControl = memo(ExposureControlImpl);

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-end',
  },
  panel: {
    position: 'absolute',
    bottom: 44,
    right: 0,
    width: 240,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: colors.glassStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  chip: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.glass,
  },
  chipActive: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,200,97,0.4)',
  },
  text: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
