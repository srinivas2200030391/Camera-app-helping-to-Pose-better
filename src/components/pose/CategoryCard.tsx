import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { TiltCard } from '@/components/ui/TiltCard';
import type { Pose, PoseCategory } from '@/poses/types';
import { colors, radii, spacing } from '@/theme/tokens';

import { CATEGORY_ICONS, FALLBACK_CATEGORY_ICON } from './categoryIcons';
import { PoseFigure } from './PoseFigure';

export interface CategoryCardProps {
  category: PoseCategory;
  count: number;
  preview?: Pose;
  width: number;
  onPress: (category: PoseCategory) => void;
}

function CategoryCardImpl({ category, count, preview, width, onPress }: CategoryCardProps) {
  const Icon = CATEGORY_ICONS[category.id] ?? FALLBACK_CATEGORY_ICON;
  const figureHeight = 92;
  return (
    <TiltCard
      onPress={() => onPress(category)}
      accessibilityLabel={`${category.name}, ${count} poses`}
      style={{ width }}
    >
      <View style={styles.body}>
        <View style={styles.text}>
          <View style={styles.icon}>
            <Icon size={16} color={colors.accent} strokeWidth={2} />
          </View>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {category.name}
          </AppText>
          <AppText variant="caption" color={colors.textSecondary}>
            {count} poses
          </AppText>
        </View>
        {preview ? (
          <View style={styles.figure} pointerEvents="none">
            <PoseFigure figures={preview.figures} width={(figureHeight * 3) / 4} height={figureHeight} variant="card" color="rgba(255,255,255,0.85)" />
          </View>
        ) : null}
      </View>
    </TiltCard>
  );
}

export const CategoryCard = memo(CategoryCardImpl);

const styles = StyleSheet.create({
  body: {
    minHeight: 104,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentMuted,
    marginBottom: spacing.sm,
  },
  figure: {
    marginRight: -spacing.sm,
    marginBottom: -spacing.sm,
    opacity: 0.9,
  },
});
