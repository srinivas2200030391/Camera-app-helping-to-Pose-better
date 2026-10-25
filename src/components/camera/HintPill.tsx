import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import type { CompositionHint } from '@/camera/composition';
import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/theme/tokens';

function HintPillImpl({ hints }: { hints: readonly CompositionHint[] }) {
  if (hints.length === 0) return null;
  return (
    <View style={styles.wrap} pointerEvents="none" accessibilityLiveRegion="polite">
      {hints.map((hint) => (
        <Animated.View key={hint.id} entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={styles.pill}>
          <View style={[styles.dot, { backgroundColor: hint.tone === 'good' ? colors.success : colors.accent }]} />
          <AppText variant="caption" style={styles.text}>
            {hint.text}
          </AppText>
        </Animated.View>
      ))}
    </View>
  );
}

export const HintPill = memo(HintPillImpl);

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.glassStrong,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontWeight: '500',
  },
});
