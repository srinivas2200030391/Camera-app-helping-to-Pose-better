import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PoseCard } from '@/components/pose/PoseCard';
import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { getCategory, isCategoryId } from '@/poses/categories';
import { posesInCategory } from '@/poses/library';
import type { Difficulty, Pose } from '@/poses/types';
import { useLibraryStore } from '@/state/library';
import { listFavoritePoseIds } from '@/storage/posesRepo';
import { colors, spacing } from '@/theme/tokens';
import { SearchX } from 'lucide-react-native';

const GAP = spacing.md;

export default function CategoryScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const posesVersion = useLibraryStore((state) => state.posesVersion);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    listFavoritePoseIds()
      .then((ids) => setFavorites(new Set(ids)))
      .catch(() => undefined);
  }, [posesVersion]);

  const category = isCategoryId(categoryId) ? getCategory(categoryId) : undefined;
  const poses = useMemo(() => {
    if (!category) return [];
    const all = posesInCategory(category.id);
    return difficulty ? all.filter((pose) => pose.difficulty === difficulty) : all;
  }, [category, difficulty]);
  const cardWidth = (width - spacing.lg * 2 - GAP) / 2;
  const openPose = useCallback((pose: Pose) => router.push({ pathname: '/poses/[poseId]', params: { poseId: pose.id } }), [router]);

  if (!category) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Poses" />
        <EmptyState icon={SearchX} title="Category not found" message="This category does not exist." actionLabel="All poses" onAction={() => router.replace('/poses')} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={category.name} subtitle={category.description} />
      <FlatList
        data={poses}
        numColumns={2}
        keyExtractor={(pose) => pose.id}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + spacing.xxl }]}
        ListHeaderComponent={
          <View style={styles.filters}>
            <Chip label="All levels" selected={difficulty === null} onPress={() => setDifficulty(null)} />
            <Chip label="Easy" selected={difficulty === 1} onPress={() => setDifficulty(1)} />
            <Chip label="Medium" selected={difficulty === 2} onPress={() => setDifficulty(2)} />
            <Chip label="Advanced" selected={difficulty === 3} onPress={() => setDifficulty(3)} />
          </View>
        }
        ListEmptyComponent={
          <AppText variant="body" color={colors.textSecondary} align="center" style={{ marginTop: spacing.xxl }}>
            No poses at this level yet.
          </AppText>
        }
        renderItem={({ item }) => <PoseCard pose={item} width={cardWidth} favorite={favorites.has(item.id)} onPress={openPose} />}
        initialNumToRender={6}
        windowSize={5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  grid: {
    paddingHorizontal: spacing.lg,
    gap: GAP,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
});
