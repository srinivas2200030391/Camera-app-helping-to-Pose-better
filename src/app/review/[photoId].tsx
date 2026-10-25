import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Columns2, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProcessingSheet } from '@/components/photo/ProcessingSheet';
import { SkiaCompare } from '@/components/photo/SkiaCompare';
import { StyleStrip } from '@/components/photo/StyleStrip';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Slider } from '@/components/ui/Slider';
import { toast } from '@/components/ui/Toast';
import { enqueueEnhancement } from '@/processing/jobs';
import { useEditSession } from '@/processing/useEditSession';
import { useSettingsStore } from '@/state/settings';
import { deletePhoto } from '@/storage/photoLibrary';
import { colors, spacing } from '@/theme/tokens';
import { formatDateTime } from '@/utils/format';

export default function ReviewScreen() {
  const { photoId } = useLocalSearchParams<{ photoId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const settings = useSettingsStore();
  const session = useEditSession(photoId, { defaultStyle: settings.defaultStyle });
  const [compare, setCompare] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const previewH = height - insets.top - insets.bottom - 330;
  const { recipe, photo } = session;

  const save = () => {
    if (!recipe || !photoId) return;
    setJobId(enqueueEnhancement(photoId, recipe, { quality: settings.exportQuality, keepMetadata: settings.keepMetadata }));
  };

  const onSaved = useCallback(() => {
    setJobId(null);
    toast.success('Enhanced copy saved — the original is kept');
    if (photoId) router.replace({ pathname: '/gallery/[photoId]', params: { photoId } });
  }, [photoId, router]);

  const confirmDelete = () => {
    if (!photoId) return;
    Alert.alert('Delete photo?', 'This removes the photo and any enhanced copies from PoseLens. Copies you exported to the gallery are not affected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deletePhoto(photoId)
            .then(() => router.back())
            .catch(() => toast.error('Could not delete the photo'));
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton icon={X} label="Close review" onPress={() => router.back()} />
        <View style={styles.titles}>
          <AppText variant="title">Review</AppText>
          {photo ? (
            <AppText variant="caption" color={colors.textSecondary}>
              {formatDateTime(photo.createdAt)}
            </AppText>
          ) : null}
        </View>
        <IconButton icon={Trash2} label="Delete photo" color={colors.danger} onPress={confirmDelete} />
      </View>

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
          <>
            {photo ? <Image source={{ uri: photo.originalUri }} style={StyleSheet.absoluteFill} contentFit="contain" /> : null}
            <View style={styles.loading}>
              <ActivityIndicator color={colors.accent} />
              <AppText variant="caption" color={colors.textSecondary}>
                Preparing enhanced preview…
              </AppText>
            </View>
          </>
        )}
      </View>

      <View style={styles.tools}>
        <View style={styles.toolRow}>
          <Chip label={compare ? 'Comparing' : 'Compare'} icon={Columns2} selected={compare} onPress={() => setCompare((c) => !c)} />
          <AppText variant="caption" color={colors.textTertiary} style={{ flex: 1 }} align="right">
            {compare ? 'Drag the line' : 'Hold the photo to see the original'}
          </AppText>
        </View>
        {recipe ? (
          <>
            <StyleStrip value={recipe.styleId} onChange={(styleId) => session.commitRecipe({ ...recipe, styleId })} />
            <View style={styles.strength}>
              <Slider
                label="Strength"
                value={Math.round(recipe.strength * 100)}
                min={0}
                max={100}
                step={1}
                resetValue={100}
                onChange={(value) => session.previewRecipe({ ...recipe, strength: value / 100 })}
                onCommit={(value) => session.commitRecipe({ ...recipe, strength: value / 100 })}
                format={(value) => (value === 0 ? 'Original' : `${Math.round(value)}%`)}
                compact
              />
            </View>
          </>
        ) : null}
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Keep original" variant="secondary" compact onPress={() => router.back()} style={styles.action} />
        <Button
          label="Edit"
          variant="secondary"
          compact
          icon={SlidersHorizontal}
          disabled={!recipe}
          onPress={() =>
            recipe &&
            router.push({ pathname: '/edit/[photoId]', params: { photoId: photoId ?? '', style: recipe.styleId, strength: String(recipe.strength) } })
          }
          style={styles.action}
        />
        <Button label="Save enhanced" icon={Sparkles} compact disabled={!recipe || session.status !== 'ready'} onPress={save} style={styles.actionPrimary} />
      </View>

      {jobId ? <ProcessingSheet jobId={jobId} onDone={onSaved} onDismiss={() => setJobId(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.black,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    height: 56,
  },
  titles: {
    flex: 1,
    alignItems: 'center',
  },
  preview: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loading: {
    position: 'absolute',
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.glassStrong,
  },
  tools: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  strength: {
    paddingHorizontal: spacing.xl,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  action: {
    flex: 1,
  },
  actionPrimary: {
    flex: 1.4,
  },
});
