import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { AlertTriangle, Camera, CheckCircle2, Circle, Download, Heart, Sparkles, Trash2 } from 'lucide-react-native';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { toast } from '@/components/ui/Toast';
import { enqueueEnhancement, useJobsStore } from '@/processing/jobs';
import { createRecipe } from '@/processing/params';
import { isStyleId } from '@/processing/presets';
import { useLibraryStore } from '@/state/library';
import { useSettingsStore } from '@/state/settings';
import { exportToGallery, GalleryPermissionError } from '@/storage/galleryExport';
import { deletePhoto, displayUri } from '@/storage/photoLibrary';
import { listPhotos, type PhotoFilter, type PhotoListItem } from '@/storage/photosRepo';
import { colors, radii, spacing } from '@/theme/tokens';

const COLUMNS = 3;
const GAP = 2;

interface TileProps {
  photo: PhotoListItem;
  size: number;
  selecting: boolean;
  selected: boolean;
  onPress: (photo: PhotoListItem) => void;
  onLongPress: (photo: PhotoListItem) => void;
}

const Tile = memo(function Tile({ photo, size, selecting, selected, onPress, onLongPress }: TileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Photo from ${new Date(photo.createdAt).toLocaleString()}${photo.editUri ? ', enhanced' : ''}${photo.isFavorite ? ', favourite' : ''}`}
      accessibilityState={{ selected }}
      onPress={() => onPress(photo)}
      onLongPress={() => onLongPress(photo)}
      style={{ width: size, height: size }}
    >
      <Image
        source={{ uri: photo.thumbUri ?? displayUri(photo) }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        recyclingKey={photo.id}
        transition={100}
      />
      {selecting ? <View style={[StyleSheet.absoluteFill, selected && styles.selectedTint]} /> : null}
      <View style={styles.badges} pointerEvents="none">
        {photo.status === 'missing' ? <AlertTriangle size={14} color={colors.warning} /> : null}
        {photo.editUri ? <Sparkles size={13} color={colors.white} /> : null}
        {photo.isFavorite ? <Heart size={13} color={colors.accent} fill={colors.accent} /> : null}
      </View>
      {selecting ? (
        <View style={styles.check} pointerEvents="none">
          {selected ? <CheckCircle2 size={22} color={colors.accent} fill={colors.black} /> : <Circle size={22} color={colors.white} />}
        </View>
      ) : null}
    </Pressable>
  );
});

export default function GalleryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const settings = useSettingsStore();
  const photosVersion = useLibraryStore((state) => state.photosVersion);
  const [filter, setFilter] = useState<PhotoFilter>('all');
  const [photos, setPhotos] = useState<PhotoListItem[] | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const jobs = useJobsStore((state) => state.jobs);

  useEffect(() => {
    let cancelled = false;
    listPhotos(filter)
      .then((items) => {
        if (!cancelled) setPhotos(items);
      })
      .catch(() => {
        if (!cancelled) setPhotos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, photosVersion]);

  const size = (width - GAP * (COLUMNS - 1)) / COLUMNS;
  const batch = useMemo(() => {
    if (batchIds.length === 0) return null;
    const states = batchIds.map((id) => jobs[id]);
    const finished = states.filter((job) => job && (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled')).length;
    const progress = states.reduce((sum, job) => sum + (job ? (job.status === 'done' ? 1 : job.progress) : 0), 0) / batchIds.length;
    return { finished, total: batchIds.length, progress, failed: states.filter((job) => job?.status === 'failed').length };
  }, [batchIds, jobs]);

  // Announce and clear a batch when its last job settles (reacting to job-store updates).
  useEffect(() => {
    if (batchIds.length === 0) return;
    return useJobsStore.subscribe((state) => {
      const settled = batchIds.map((id) => state.jobs[id]).filter((job) => job && job.status !== 'queued' && job.status !== 'running');
      if (settled.length < batchIds.length) return;
      const failed = settled.filter((job) => job?.status === 'failed').length;
      toast.success(`Enhanced ${batchIds.length - failed} of ${batchIds.length} photos`);
      setBatchIds([]);
    });
  }, [batchIds]);

  const toggle = useCallback((photo: PhotoListItem) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(photo.id)) next.delete(photo.id);
      else next.add(photo.id);
      return next;
    });
  }, []);

  const onPress = useCallback(
    (photo: PhotoListItem) => {
      if (selecting) toggle(photo);
      else router.push({ pathname: '/gallery/[photoId]', params: { photoId: photo.id } });
    },
    [router, selecting, toggle],
  );
  const onLongPress = useCallback(
    (photo: PhotoListItem) => {
      setSelecting(true);
      toggle(photo);
    },
    [toggle],
  );

  const exitSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const chosen = (photos ?? []).filter((photo) => selected.has(photo.id));

  const enhanceSelected = () => {
    const ids = chosen
      .filter((photo) => photo.status === 'ready')
      .map((photo) =>
        enqueueEnhancement(photo.id, createRecipe(isStyleId(photo.styleId) ? photo.styleId : settings.defaultStyle, null, photo.aspect === '1:1' ? '1:1' : null), {
          quality: settings.exportQuality,
          keepMetadata: settings.keepMetadata,
        }),
      );
    setBatchIds(ids);
    exitSelection();
  };

  const exportSelected = async () => {
    let saved = 0;
    for (const photo of chosen) {
      try {
        await exportToGallery(photo.id, displayUri(photo));
        saved++;
      } catch (error) {
        toast.error(error instanceof GalleryPermissionError ? error.message : 'Some photos could not be exported');
        break;
      }
    }
    if (saved > 0) toast.success(`Saved ${saved} photo${saved === 1 ? '' : 's'} to your gallery`);
    exitSelection();
  };

  const deleteSelected = () => {
    Alert.alert(`Delete ${chosen.length} photo${chosen.length === 1 ? '' : 's'}?`, 'Originals and enhanced copies are removed from PoseLens. Exported copies in your gallery stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Promise.all(chosen.map((photo) => deletePhoto(photo.id)))
            .catch(() => toast.error('Some photos could not be deleted'))
            .finally(exitSelection);
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={selecting ? `${selected.size} selected` : 'Gallery'}
        subtitle={selecting ? undefined : photos ? `${photos.length} photo${photos.length === 1 ? '' : 's'} · stored privately on this device` : undefined}
        onBack={selecting ? exitSelection : undefined}
        right={
          photos && photos.length > 0 ? (
            <Button label={selecting ? 'Done' : 'Select'} variant="ghost" compact onPress={selecting ? exitSelection : () => setSelecting(true)} />
          ) : null
        }
      />
      <View style={styles.filters}>
        <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Favourites" icon={Heart} selected={filter === 'favorites'} onPress={() => setFilter('favorites')} />
        <Chip label="Enhanced" icon={Sparkles} selected={filter === 'edited'} onPress={() => setFilter('edited')} />
      </View>
      {batch ? (
        <View style={styles.batch}>
          <AppText variant="caption" color={colors.textSecondary}>
            Enhancing {Math.min(batch.finished + 1, batch.total)} of {batch.total} — on this device
          </AppText>
          <ProgressBar progress={batch.progress} />
        </View>
      ) : null}
      {photos && photos.length === 0 ? (
        <EmptyState
          icon={Camera}
          title={filter === 'all' ? 'No photos yet' : 'Nothing here yet'}
          message={filter === 'all' ? 'Photos you take with PoseLens appear here. They stay private until you export them.' : 'Try a different filter.'}
          actionLabel="Open camera"
          onAction={() => router.dismissTo('/camera')}
        />
      ) : (
        <FlatList
          data={photos ?? []}
          numColumns={COLUMNS}
          keyExtractor={(photo) => photo.id}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ gap: GAP, paddingBottom: insets.bottom + (selecting ? 90 : spacing.xl) }}
          renderItem={({ item }) => (
            <Tile photo={item} size={size} selecting={selecting} selected={selected.has(item.id)} onPress={onPress} onLongPress={onLongPress} />
          )}
          initialNumToRender={18}
          windowSize={7}
          removeClippedSubviews
        />
      )}
      {selecting ? (
        <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button label="Enhance" icon={Sparkles} compact disabled={chosen.length === 0} onPress={enhanceSelected} style={styles.action} />
          <Button label="Export" icon={Download} variant="secondary" compact disabled={chosen.length === 0} onPress={() => void exportSelected()} style={styles.action} />
          <Button label="Delete" icon={Trash2} variant="danger" compact disabled={chosen.length === 0} onPress={deleteSelected} style={styles.action} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  batch: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  badges: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    flexDirection: 'row',
    gap: 4,
  },
  selectedTint: {
    backgroundColor: 'rgba(255,200,97,0.22)',
    borderWidth: 2,
    borderColor: colors.accent,
  },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  action: {
    flex: 1,
  },
});
