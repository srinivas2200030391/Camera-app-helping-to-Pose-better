import { useLocalSearchParams, useRouter } from 'expo-router';
import { Columns2, Redo2, RotateCcw, Sparkles, Undo2, Wand2 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProcessingSheet } from '@/components/photo/ProcessingSheet';
import { SkiaCompare } from '@/components/photo/SkiaCompare';
import { StyleStrip } from '@/components/photo/StyleStrip';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Slider } from '@/components/ui/Slider';
import { toast } from '@/components/ui/Toast';
import type { SceneStats } from '@/processing/analysis';
import { enqueueEnhancement } from '@/processing/jobs';
import { ADJUSTABLE_GROUPS, PARAM_SPECS, resolveBaseParams, resolveParams, withAdjustment, type EditRecipe, type NumericKey } from '@/processing/params';
import { getStyle, isStyleId } from '@/processing/presets';
import { useEditSession } from '@/processing/useEditSession';
import { useSettingsStore } from '@/state/settings';
import { colors, radii, spacing } from '@/theme/tokens';
import { formatEv } from '@/utils/format';

type Tab = 'style' | 'light' | 'color' | 'detail' | 'look';

const TABS: { value: Tab; label: string }[] = [
  { value: 'style', label: 'Style' },
  { value: 'light', label: 'Light' },
  { value: 'color', label: 'Colour' },
  { value: 'detail', label: 'Detail' },
  { value: 'look', label: 'Look' },
];

function formatValue(key: NumericKey, value: number): string {
  if (key === 'exposure') return `${formatEv(value)} EV`;
  const rounded = Math.round(value);
  return PARAM_SPECS[key].min < 0 && rounded > 0 ? `+${rounded}` : `${rounded}`;
}

/** Plain-language summary of what scene analysis changed ("Smart Natural"). */
function describeAuto(recipe: EditRecipe, stats: SceneStats | null): string {
  const auto = recipe.auto ?? {};
  const parts: string[] = [];
  if (auto.exposure && Math.abs(auto.exposure) >= 0.1) parts.push(`${auto.exposure > 0 ? 'brightened' : 'darkened'} ${Math.abs(auto.exposure).toFixed(1)} EV`);
  if (auto.temperature && Math.abs(auto.temperature) >= 3) parts.push(`${auto.temperature > 0 ? 'warmed' : 'cooled'} the colour balance`);
  if (auto.highlights && auto.highlights < -5) parts.push('recovered bright areas');
  if (auto.shadows && auto.shadows > 5) parts.push('opened up shadows');
  if (auto.dehaze) parts.push('reduced haze');
  if ((auto.luminanceNoise ?? 0) > 15) parts.push('cleaned up noise');
  if (parts.length === 0) return 'The scene was already well balanced — only gentle cleanup applied.';
  const intro = stats && stats.neutralFraction < 0.03 ? 'Few neutral tones found, so colour changes were kept small. ' : '';
  return `${intro}Scene analysis ${parts.join(', ')}.`;
}

export default function EditorScreen() {
  const params = useLocalSearchParams<{ photoId: string; style?: string; strength?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const settings = useSettingsStore();
  const initialStyle = isStyleId(params.style) ? params.style : undefined;
  const initialStrength = params.strength != null ? Number(params.strength) : undefined;
  const session = useEditSession(params.photoId, {
    defaultStyle: settings.defaultStyle,
    resumeCurrentEdit: !initialStyle,
    initialStyle,
    initialStrength,
  });
  const [tab, setTab] = useState<Tab>('style');
  const [compare, setCompare] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const { recipe } = session;

  const previewH = Math.max(220, height * 0.46);
  const resolved = useMemo(() => (recipe ? resolveParams(recipe) : null), [recipe]);
  const base = useMemo(() => (recipe ? resolveBaseParams(recipe) : null), [recipe]);

  const leave = () => {
    if (!session.dirty) {
      router.back();
      return;
    }
    Alert.alert('Discard changes?', 'Your adjustments have not been saved. The original photo is unchanged either way.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const save = () => {
    if (!recipe || !params.photoId) return;
    setJobId(enqueueEnhancement(params.photoId, recipe, { quality: settings.exportQuality, keepMetadata: settings.keepMetadata }));
  };

  const onSaved = useCallback(() => {
    setJobId(null);
    toast.success('Enhanced copy saved — the original is kept');
    if (params.photoId) router.replace({ pathname: '/gallery/[photoId]', params: { photoId: params.photoId } });
  }, [params.photoId, router]);

  const group = ADJUSTABLE_GROUPS.find((g) => g.id === tab);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Edit"
        subtitle={recipe ? `${getStyle(recipe.styleId).name} · ${Math.round(recipe.strength * 100)}%` : undefined}
        onBack={leave}
        right={
          <>
            <IconButton icon={Undo2} label="Undo" disabled={!session.canUndo} onPress={session.undo} />
            <IconButton icon={Redo2} label="Redo" disabled={!session.canRedo} onPress={session.redo} />
          </>
        }
      />

      <View style={[styles.preview, { height: previewH }]}>
        {session.status === 'ready' && session.original && session.processed && session.previewSize ? (
          <SkiaCompare
            original={session.original}
            processed={session.processed}
            width={width}
            height={previewH}
            imageWidth={session.previewSize.width}
            imageHeight={session.previewSize.height}
            compare={compare}
          />
        ) : session.status === 'error' ? (
          <AppText variant="body" color={colors.danger} align="center" style={{ padding: spacing.xl }}>
            {session.error}
          </AppText>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>

      <View style={styles.toolbar}>
        <Chip label="Compare" icon={Columns2} selected={compare} onPress={() => setCompare((c) => !c)} />
        <Chip
          label="Reset"
          icon={RotateCcw}
          onPress={() => recipe && session.commitRecipe({ ...recipe, adjustments: {}, strength: 1 })}
          accessibilityLabel="Reset all manual adjustments"
        />
        <Chip label="Original" onPress={() => recipe && session.commitRecipe({ ...recipe, strength: 0, adjustments: {} })} accessibilityLabel="Show the unedited original" />
      </View>

      <View style={styles.tabs}>
        <SegmentedControl accessibilityLabel="Editing tools" segments={TABS} value={tab} onChange={setTab} />
      </View>

      <ScrollView style={styles.panel} contentContainerStyle={{ paddingBottom: insets.bottom + 96 }} keyboardShouldPersistTaps="handled">
        {recipe && resolved && base ? (
          tab === 'style' ? (
            <View style={styles.stylePanel}>
              <StyleStrip value={recipe.styleId} onChange={(styleId) => session.commitRecipe({ ...recipe, styleId })} />
              <View style={styles.sliderBlock}>
                <Slider
                  label="Strength"
                  value={Math.round(recipe.strength * 100)}
                  min={0}
                  max={100}
                  resetValue={100}
                  onChange={(value) => session.previewRecipe({ ...recipe, strength: value / 100 })}
                  onCommit={(value) => session.commitRecipe({ ...recipe, strength: value / 100 })}
                  format={(value) => (value === 0 ? 'Original' : `${Math.round(value)}%`)}
                />
              </View>
              <View style={styles.autoCard}>
                <Wand2 size={18} color={colors.accent} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyStrong">Smart Natural</AppText>
                  <AppText variant="caption" color={colors.textSecondary}>
                    {describeAuto(recipe, session.stats)} Analysis uses image statistics on your device, not cloud AI.
                  </AppText>
                </View>
              </View>
            </View>
          ) : group ? (
            <View style={styles.sliderBlock}>
              {group.keys.map((key) => {
                const spec = PARAM_SPECS[key];
                return (
                  <Slider
                    key={key}
                    label={spec.label}
                    description={spec.description}
                    value={resolved[key]}
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    origin={spec.min < 0 ? 0 : spec.min}
                    resetValue={base[key]}
                    onChange={(value) => session.previewRecipe(withAdjustment(recipe, key, value))}
                    onCommit={(value) => session.commitRecipe(withAdjustment(recipe, key, value))}
                    format={(value) => formatValue(key, value)}
                  />
                );
              })}
              {tab === 'detail' ? (
                <AppText variant="caption" color={colors.textTertiary}>
                  Sharpening enhances edges that were captured; it cannot invent detail. Noise reduction is edge-aware to keep texture.
                </AppText>
              ) : null}
            </View>
          ) : null
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Save enhanced copy" icon={Sparkles} disabled={!recipe || session.status !== 'ready'} onPress={save} />
      </View>

      {jobId ? <ProcessingSheet jobId={jobId} onDone={onSaved} onDismiss={() => setJobId(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  preview: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.black,
  },
  toolbar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  tabs: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  panel: {
    flex: 1,
  },
  stylePanel: {
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  sliderBlock: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  autoCard: {
    flexDirection: 'row',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
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
