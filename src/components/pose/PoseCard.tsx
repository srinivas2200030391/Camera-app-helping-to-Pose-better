import { Heart } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { TiltCard } from '@/components/ui/TiltCard';
import type { Pose } from '@/poses/types';
import { colors, radii, spacing } from '@/theme/tokens';

import { PoseFigure } from './PoseFigure';

export interface PoseCardProps {
  pose: Pose;
  width: number;
  favorite?: boolean;
  onPress: (pose: Pose) => void;
}

function Difficulty({ level }: { level: number }) {
  return (
    <View style={styles.dots} accessibilityLabel={`Difficulty ${level} of 3`}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={[styles.dot, i <= level && styles.dotOn]} />
      ))}
    </View>
  );
}

function PoseCardImpl({ pose, width, favorite, onPress }: PoseCardProps) {
  const artWidth = width;
  const artHeight = (width * 4) / 3;
  return (
    <TiltCard
      onPress={() => onPress(pose)}
      accessibilityLabel={`${pose.name}. ${pose.framing.replace('-', ' ')} pose, ${pose.distance}.`}
      accessibilityHint="Opens the pose details"
      style={{ width }}
    >
      <View style={[styles.art, { height: artHeight }]}>
        <View style={styles.horizon} />
        <View style={[styles.thirdLine, { left: artWidth / 3 }]} />
        <View style={[styles.thirdLine, { left: (artWidth * 2) / 3 }]} />
        <PoseFigure figures={pose.figures} width={artWidth} height={artHeight} variant="card" />
        {favorite ? (
          <View style={styles.favorite}>
            <Heart size={14} color={colors.accent} fill={colors.accent} />
          </View>
        ) : null}
      </View>
      <View style={styles.meta}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {pose.name}
        </AppText>
        <View style={styles.row}>
          <AppText variant="caption" color={colors.textSecondary} numberOfLines={1} style={{ flex: 1 }}>
            {pose.distance}
          </AppText>
          <Difficulty level={pose.difficulty} />
        </View>
      </View>
    </TiltCard>
  );
}

export const PoseCard = memo(PoseCardImpl);

const styles = StyleSheet.create({
  art: {
    backgroundColor: '#17171C',
    overflow: 'hidden',
  },
  horizon: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '9%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairlineStrong,
  },
  thirdLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  favorite: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassStrong,
  },
  meta: {
    padding: spacing.md,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.hairlineStrong,
  },
  dotOn: {
    backgroundColor: colors.accent,
  },
});
