import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAnimatedReaction, withSpring, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { isOpticalZoom } from '@/camera/types';
import { AppText } from '@/components/ui/AppText';
import { colors, motion, radii, spacing } from '@/theme/tokens';
import { formatZoom } from '@/utils/format';
import { haptics } from '@/utils/haptics';

export interface ZoomControlProps {
  zoom: SharedValue<number>;
  presets: readonly number[];
  opticalStops: readonly number[];
}

/**
 * Lens chips plus a live readout. Values that match a physical lens are labelled "optical";
 * anything in between is a digital crop and says so.
 */
function ZoomControlImpl({ zoom, presets, opticalStops }: ZoomControlProps) {
  const [current, setCurrent] = useState(1);
  useAnimatedReaction(
    () => Math.round(zoom.value * 10) / 10,
    (value, previous) => {
      if (value !== previous) scheduleOnRN(setCurrent, value);
    },
  );
  const optical = isOpticalZoom(current, opticalStops);
  const nearestPreset = presets.reduce((best, p) => (Math.abs(p - current) < Math.abs(best - current) ? p : best), presets[0] ?? 1);

  return (
    <View style={styles.container}>
      <View style={styles.chips}>
        {presets.map((preset) => {
          const selected = preset === nearestPreset && Math.abs(preset - current) < 0.05;
          return (
            <Pressable
              key={preset}
              accessibilityRole="button"
              accessibilityLabel={`Zoom ${formatZoom(preset)}${isOpticalZoom(preset, opticalStops) ? ', optical' : ', digital'}`}
              accessibilityState={{ selected }}
              onPress={() => {
                haptics.tap();
                zoom.set(withSpring(preset, motion.softSpring));
              }}
              style={[styles.chip, selected && styles.chipSelected]}
              hitSlop={4}
            >
              <AppText variant="caption" color={selected ? colors.accent : colors.text} style={styles.chipText}>
                {selected ? formatZoom(current) : formatZoom(preset, true)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {!presets.some((p) => Math.abs(p - current) < 0.05) ? (
        <AppText variant="label" color={optical ? colors.success : colors.textSecondary} style={styles.readout}>
          {`${formatZoom(current)} · ${optical ? 'OPTICAL' : 'DIGITAL'}`}
        </AppText>
      ) : (
        <AppText variant="label" color={colors.textTertiary} style={styles.readout}>
          {optical ? 'OPTICAL' : 'DIGITAL'}
        </AppText>
      )}
    </View>
  );
}

export const ZoomControl = memo(ZoomControlImpl);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 4,
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.glass,
  },
  chip: {
    minWidth: 38,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  chipSelected: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  chipText: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  readout: {
    fontSize: 9,
    letterSpacing: 1,
  },
});
