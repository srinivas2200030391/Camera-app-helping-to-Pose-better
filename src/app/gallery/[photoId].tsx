import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, Columns2, Download, Heart, ImageOff, SlidersHorizontal, Trash2, Undo2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImageCompare } from '@/components/photo/ImageCompare';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { toast } from '@/components/ui/Toast';
import { getPose } from '@/poses/library';
import { describeExposure, type ExifSummary } from '@/processing/exif';
import { getStyle, isStyleId } from '@/processing/presets';
import { useLibraryStore } from '@/state/library';
import { exportToGallery, GalleryPermissionError } from '@/storage/galleryExport';
import { deleteEdit, deletePhoto, readExifFromFile } from '@/storage/photoLibrary';
import { getPhoto, listEdits, restoreOriginal, updatePhoto, type EditRecord, type PhotoListItem } from '@/storage/photosRepo';
import { colors, radii, spacing } from '@/theme/tokens';
import { formatBytes, formatDateTime, formatEv, formatMegapixels, formatZoom } from '@/utils/format';

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <AppText variant="caption" color={colors.textSecondary}>
        {label}
      </AppText>
      <AppText variant="caption" style={styles.infoValue}>
        {value}
      </AppText>
    </View>
  );
}

export default function PhotoDetailScreen() {
  const { photoId } = useLocalSearchParams<{ photoId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const photosVersion = useLibraryStore((state) => state.photosVersion);
  const [photo, setPhoto] = useState<PhotoListItem | null | undefined>(undefined);
  const [edits, setEdits] = useState<EditRecord[]>([]);
  const [exif, setExif] = useState<ExifSummary | null>(null);
  const [compare, setCompare] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!photoId) return;
    let cancelled = false;
    Promise.all([getPhoto(photoId), listEdits(photoId)])
      .then(([record, editList]) => {
        if (cancelled) return;
        setPhoto(record);
        setEdits(editList);
        if (record && record.status === 'ready') setExif(readExifFromFile(record.originalUri));
      })
      .catch(() => {
        if (!cancelled) setPhoto(null);
      });
    return () => {
      cancelled = true;
    };
  }, [photoId, photosVersion]);

  const current = useMemo(() => edits.find((edit) => edit.id === photo?.currentEditId) ?? null, [edits, photo?.currentEditId]);
  const shownUri = current?.uri ?? photo?.originalUri ?? null;
  const shownW = current?.width ?? photo?.width ?? 3;
  const shownH = current?.height ?? photo?.height ?? 4;
  const aspect = shownW > 0 && shownH > 0 ? shownW / shownH : 3 / 4;
  const viewerH = Math.min(height * 0.55, width / aspect);

  const toggleFavorite = useCallback(() => {
    if (!photo) return;
    updatePhoto(photo.id, { isFavorite: !photo.isFavorite }).catch(() => toast.error('Could not update favourites'));
  }, [photo]);

  if (photo === null) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Photo" />
        <EmptyState icon={ImageOff} title="Photo not found" message="It may have been deleted." actionLabel="Back to gallery" onAction={() => router.back()} />
      </View>
    );
  }
  if (!photo || !shownUri) return <View style={styles.screen} />;

  const exportShown = async () => {
    setExporting(true);
    try {
      await exportToGallery(photo.id, shownUri);
      toast.success(current ? 'Enhanced copy saved to your gallery' : 'Original saved to your gallery');
    } catch (error) {
      toast.error(error instanceof GalleryPermissionError ? error.message : 'Could not save to the gallery');
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete photo?', 'The original and all enhanced copies are removed from PoseLens. Exported copies in your gallery stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deletePhoto(photo.id)
            .then(() => router.back())
            .catch(() => toast.error('Could not delete the photo'));
        },
      },
    ]);
  };

  const confirmDeleteEdit = (edit: EditRecord) => {
    Alert.alert('Delete this enhanced copy?', 'The original photo is not affected.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete copy', style: 'destructive', onPress: () => void deleteEdit(photo.id, edit.id).catch(() => toast.error('Could not delete the copy')) },
    ]);
  };

  const pose = photo.poseId ? getPose(photo.poseId) : undefined;
  const styleName = isStyleId(current?.styleId) ? getStyle(current.styleId).name : null;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={formatDateTime(photo.createdAt)}
        subtitle={current ? `Enhanced · ${styleName ?? 'custom'}` : 'Original'}
        right={
          <IconButton
            icon={Heart}
            label={photo.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
            active={photo.isFavorite}
            color={photo.isFavorite ? colors.accent : undefined}
            onPress={toggleFavorite}
          />
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        <View style={[styles.viewer, { height: viewerH }]}>
          {photo.status === 'missing' ? (
            <EmptyState icon={AlertTriangle} title="File missing" message="The original file for this photo could not be found on the device." />
          ) : compare && current ? (
            <ImageCompare beforeUri={photo.originalUri} afterUri={current.uri} width={width} height={viewerH} aspect={aspect} />
          ) : (
            <Image source={{ uri: shownUri }} style={StyleSheet.absoluteFill} contentFit={photo.aspect === '1:1' && !current ? 'cover' : 'contain'} transition={150} />
          )}
        </View>

        <View style={styles.controls}>
          {current ? <Chip label="Compare" icon={Columns2} selected={compare} onPress={() => setCompare((c) => !c)} /> : null}
          {current ? (
            <Chip
              label="Restore original"
              icon={Undo2}
              onPress={() => {
                setCompare(false);
                restoreOriginal(photo.id)
                  .then(() => toast.success('Showing the original. Enhanced copies are kept below.'))
                  .catch(() => toast.error('Could not restore the original'));
              }}
            />
          ) : null}
        </View>

        {edits.length > 0 ? (
          <View style={styles.section}>
            <AppText variant="label" uppercase color={colors.textTertiary} style={styles.sectionTitle}>
              Versions
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.versions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Use the original"
                accessibilityState={{ selected: !current }}
                onPress={() => void restoreOriginal(photo.id)}
                style={[styles.version, !current && styles.versionActive]}
              >
                <Image source={{ uri: photo.thumbUri ?? photo.originalUri }} style={styles.versionImage} contentFit="cover" />
                <AppText variant="caption">Original</AppText>
              </Pressable>
              {edits.map((edit) => (
                <Pressable
                  key={edit.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Enhanced copy, ${isStyleId(edit.styleId) ? getStyle(edit.styleId).name : 'custom'}. Long press to delete.`}
                  accessibilityState={{ selected: current?.id === edit.id }}
                  onPress={() => void updatePhoto(photo.id, { currentEditId: edit.id })}
                  onLongPress={() => confirmDeleteEdit(edit)}
                  style={[styles.version, current?.id === edit.id && styles.versionActive]}
                >
                  <Image source={{ uri: edit.uri }} style={styles.versionImage} contentFit="cover" recyclingKey={edit.id} />
                  <AppText variant="caption" numberOfLines={1}>
                    {isStyleId(edit.styleId) ? getStyle(edit.styleId).name : 'Custom'}
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={[styles.section, styles.info]}>
          <AppText variant="label" uppercase color={colors.textTertiary}>
            Details
          </AppText>
          <InfoRow label="Resolution" value={shownW && shownH ? `${shownW} × ${shownH} · ${formatMegapixels(shownW, shownH)}` : null} />
          <InfoRow label="File size" value={formatBytes(current?.fileSize ?? photo.fileSize)} />
          <InfoRow label="Original" value={photo.width ? `${photo.width} × ${photo.height} · ${formatBytes(photo.fileSize)}` : formatBytes(photo.fileSize)} />
          <InfoRow label="Exposure" value={exif ? describeExposure(exif) : null} />
          <InfoRow label="Device" value={exif?.make || exif?.model ? [exif?.make, exif?.model].filter(Boolean).join(' ') : null} />
          <InfoRow label="Camera" value={photo.facing ? `${photo.facing === 'front' ? 'Front' : 'Rear'} · ${formatZoom(photo.zoom ?? 1)}${photo.exposureBias ? ` · ${formatEv(photo.exposureBias)} EV` : ''}` : null} />
          <InfoRow label="Frame" value={photo.aspect} />
          <InfoRow label="Pose guide" value={pose?.name} />
          <InfoRow label="Gallery" value={photo.exportedAt ? `Exported ${formatDateTime(photo.exportedAt)}` : 'Private to PoseLens'} />
          {photo.source === 'recovered' ? <InfoRow label="Note" value="Recovered after an interrupted save" /> : null}
        </View>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          label="Edit"
          icon={SlidersHorizontal}
          compact
          disabled={photo.status !== 'ready'}
          onPress={() => router.push({ pathname: '/edit/[photoId]', params: { photoId: photo.id } })}
          style={styles.action}
        />
        <Button label="Save to gallery" icon={Download} variant="secondary" compact loading={exporting} onPress={() => void exportShown()} style={styles.action} />
        <IconButton icon={Trash2} label="Delete photo" color={colors.danger} onPress={confirmDelete} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  viewer: {
    backgroundColor: colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controls: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  versions: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  version: {
    width: 84,
    gap: 4,
    padding: 3,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  versionActive: {
    borderColor: colors.accent,
  },
  versionImage: {
    width: 74,
    height: 74,
    borderRadius: radii.sm,
  },
  info: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
  },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  action: {
    flex: 1,
  },
});
