import { useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, FlipHorizontal2, Heart, Lightbulb, SearchX } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';

import { PoseFigure } from '@/components/pose/PoseFigure';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { toast } from '@/components/ui/Toast';
import { getCategory } from '@/poses/categories';
import { getPose } from '@/poses/library';
import { useOverlayStore } from '@/state/overlay';
import { isFavoritePose, recordPoseUse, setFavoritePose } from '@/storage/posesRepo';
import { colors, radii, spacing } from '@/theme/tokens';

const FRAMING_LABEL: Record<string, string> = {
  headshot: 'Head & shoulders',
  'half-body': 'Half body',
  'three-quarter': 'Three-quarter',
  'full-body': 'Full body',
  environmental: 'Wide, with scenery',
};
const DIFFICULTY_LABEL = ['', 'Easy', 'Medium', 'Advanced'];

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <AppText variant="label" uppercase color={colors.textTertiary}>
        {label}
      </AppText>
      <AppText variant="bodyStrong">{value}</AppText>
    </View>
  );
}

export default function PoseDetailScreen() {
  const { poseId } = useLocalSearchParams<{ poseId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const setPose = useOverlayStore((state) => state.setPose);
  const pose = getPose(poseId ?? '');
  const [favorite, setFavorite] = useState(false);
  const [mirrored, setMirrored] = useState(false);

  useEffect(() => {
    if (!pose) return;
    isFavoritePose(pose.id)
      .then(setFavorite)
      .catch(() => undefined);
  }, [pose]);

  if (!pose) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Pose" />
        <EmptyState icon={SearchX} title="Pose not found" message="It may have been removed in an update." actionLabel="All poses" onAction={() => router.replace('/poses')} />
      </View>
    );
  }

  const artW = Math.min(width - spacing.xl * 2, 360);
  const artH = (artW * 4) / 3;

  const toggleFavorite = async () => {
    const next = !favorite;
    setFavorite(next);
    try {
      await setFavoritePose(pose.id, next);
    } catch {
      setFavorite(!next);
      toast.error('Could not update favourites');
    }
  };

  const usePose = () => {
    setPose(pose.id);
    if (mirrored) useOverlayStore.getState().toggleMirrored();
    recordPoseUse(pose.id).catch(() => undefined);
    router.dismissTo('/camera');
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={pose.name}
        subtitle={pose.categories.map((id) => getCategory(id)?.name ?? id).join(' · ')}
        right={
          <IconButton
            icon={Heart}
            label={favorite ? 'Remove from favourites' : 'Add to favourites'}
            active={favorite}
            color={favorite ? colors.accent : undefined}
            onPress={() => void toggleFavorite()}
          />
        }
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}>
        <View style={[styles.art, { width: artW, height: artH }]}>
          <Svg width={artW} height={artH} style={StyleSheet.absoluteFill}>
            {[1, 2].map((i) => (
              <Line key={`v${i}`} x1={(artW * i) / 3} y1={0} x2={(artW * i) / 3} y2={artH} stroke="rgba(255,255,255,0.08)" />
            ))}
            {[1, 2].map((i) => (
              <Line key={`h${i}`} x1={0} y1={(artH * i) / 3} x2={artW} y2={(artH * i) / 3} stroke="rgba(255,255,255,0.08)" />
            ))}
          </Svg>
          <PoseFigure figures={pose.figures} width={artW} height={artH} variant="card" mirrored={mirrored} />
          <View style={styles.artActions}>
            <IconButton icon={FlipHorizontal2} label="Mirror preview" glass active={mirrored} onPress={() => setMirrored((m) => !m)} />
          </View>
        </View>

        <View style={styles.facts}>
          <Fact label="Distance" value={pose.distance} />
          <Fact label="Framing" value={FRAMING_LABEL[pose.framing] ?? pose.framing} />
          <Fact label="Camera" value={pose.cameraHeight} />
          <Fact label="Lens" value={pose.lens} />
          <Fact label="Orientation" value={pose.orientation === 'portrait' ? 'Vertical' : pose.orientation === 'landscape' ? 'Horizontal' : 'Either'} />
          <Fact label="Level" value={DIFFICULTY_LABEL[pose.difficulty] ?? ''} />
        </View>

        <View style={styles.block}>
          <AppText variant="label" uppercase color={colors.textTertiary}>
            How to pose
          </AppText>
          {pose.instructions.map((step, index) => (
            <View key={step} style={styles.step}>
              <View style={styles.stepNumber}>
                <AppText variant="caption" color={colors.accentText} style={{ fontWeight: '700' }}>
                  {index + 1}
                </AppText>
              </View>
              <AppText variant="body" style={{ flex: 1 }}>
                {step}
              </AppText>
            </View>
          ))}
        </View>

        <View style={styles.tip}>
          <Lightbulb size={18} color={colors.accent} />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="bodyStrong">Composition</AppText>
            <AppText variant="body" color={colors.textSecondary}>
              {pose.composition}
            </AppText>
          </View>
        </View>

        {pose.hints.length > 0 ? (
          <View style={styles.block}>
            <AppText variant="label" uppercase color={colors.textTertiary}>
              Hands & body
            </AppText>
            {pose.hints.map((hint) => (
              <AppText key={hint} variant="body" color={colors.textSecondary}>
                • {hint}
              </AppText>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Use this pose" icon={Camera} onPress={usePose} accessibilityHint="Shows this pose as a guide over the camera" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.xl,
    alignItems: 'stretch',
  },
  art: {
    alignSelf: 'center',
    borderRadius: radii.xl,
    backgroundColor: '#17171C',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    overflow: 'hidden',
  },
  artActions: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.lg,
  },
  fact: {
    width: '50%',
    gap: 2,
    paddingRight: spacing.md,
  },
  block: {
    gap: spacing.sm,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    marginTop: -1,
  },
  tip: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
});
