import { useRouter } from 'expo-router';
import { Search, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryCard } from '@/components/pose/CategoryCard';
import { PoseCard } from '@/components/pose/PoseCard';
import { AppText } from '@/components/ui/AppText';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { CATEGORIES } from '@/poses/categories';
import { getPose, getPoses, posesInCategory, searchPoses } from '@/poses/library';
import { suggestPoses, suggestionReason } from '@/poses/suggestions';
import type { Pose, PoseCategory } from '@/poses/types';
import { useLibraryStore } from '@/state/library';
import { useSettingsStore } from '@/state/settings';
import { listFavoritePoseIds, listRecentPoseIds } from '@/storage/posesRepo';
import { colors, radii, spacing } from '@/theme/tokens';

const GAP = spacing.md;

interface PoseRowProps {
  title: string;
  poses: Pose[];
  cardWidth: number;
  favoriteSet: ReadonlySet<string>;
  onOpen: (pose: Pose) => void;
  caption?: (pose: Pose) => string;
}

function PoseRow({ title, poses, cardWidth, favoriteSet, onOpen, caption }: PoseRowProps) {
  if (poses.length === 0) return null;
  return (
    <View style={styles.section}>
      <AppText variant="label" uppercase color={colors.textTertiary} style={styles.sectionTitle}>
        {title}
      </AppText>
      <FlatList
        horizontal
        data={poses}
        keyExtractor={(pose) => pose.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        renderItem={({ item }) => (
          <View style={{ width: cardWidth }}>
            <PoseCard pose={item} width={cardWidth} favorite={favoriteSet.has(item.id)} onPress={onOpen} />
            {caption ? (
              <AppText variant="caption" color={colors.accent} numberOfLines={1} style={styles.caption}>
                {caption(item)}
              </AppText>
            ) : null}
          </View>
        )}
        initialNumToRender={4}
        windowSize={3}
      />
    </View>
  );
}

export default function PoseLibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const aspect = useSettingsStore((state) => state.aspectRatio);
  const posesVersion = useLibraryStore((state) => state.posesVersion);
  const [query, setQuery] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listFavoritePoseIds(), listRecentPoseIds()])
      .then(([favorites, recents]) => {
        if (cancelled) return;
        setFavoriteIds(favorites);
        setRecentIds(recents);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [posesVersion]);

  const cardWidth = (width - spacing.lg * 2 - GAP) / 2;
  const rowCardWidth = Math.min(150, width * 0.38);
  // Read the clock once per visit; suggestions should not reshuffle while browsing.
  const [openedAt] = useState(() => new Date());
  const context = useMemo(
    () => ({ hour: openedAt.getHours(), aspect, favoriteIds, recentIds, day: Math.floor(openedAt.getTime() / 86_400_000) }),
    [openedAt, aspect, favoriteIds, recentIds],
  );
  const suggested = useMemo(() => suggestPoses(getPoses(), context), [context]);
  const favorites = useMemo(() => favoriteIds.map((id) => getPose(id)).filter((p): p is Pose => !!p), [favoriteIds]);
  const recents = useMemo(() => recentIds.map((id) => getPose(id)).filter((p): p is Pose => !!p), [recentIds]);
  const results = useMemo(() => (query.trim() ? searchPoses(query) : []), [query]);
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const openPose = useCallback((pose: Pose) => router.push({ pathname: '/poses/[poseId]', params: { poseId: pose.id } }), [router]);
  const openCategory = useCallback(
    (category: PoseCategory) => router.push({ pathname: '/poses/category/[categoryId]', params: { categoryId: category.id } }),
    [router],
  );

  const rowProps = { cardWidth: rowCardWidth, favoriteSet, onOpen: openPose };
  const captionFor = useCallback((pose: Pose) => suggestionReason(pose, context), [context]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Poses" subtitle={`${getPoses().length} poses · ${CATEGORIES.length} categories`} />
      <View style={styles.searchWrap}>
        <Search size={18} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search poses, e.g. beach, sitting, couple"
          placeholderTextColor={colors.textTertiary}
          style={styles.search}
          returnKeyType="search"
          accessibilityLabel="Search poses"
          autoCorrect={false}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} hitSlop={10}>
            <X size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {query.trim() ? (
        <FlatList
          data={results}
          key="results"
          numColumns={2}
          keyExtractor={(pose) => pose.id}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + spacing.xxl }]}
          renderItem={({ item }) => <PoseCard pose={item} width={cardWidth} favorite={favoriteSet.has(item.id)} onPress={openPose} />}
          ListEmptyComponent={
            <AppText variant="body" color={colors.textSecondary} align="center" style={{ marginTop: spacing.xxxl }}>
              No poses match “{query.trim()}”.
            </AppText>
          }
          keyboardShouldPersistTaps="handled"
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }} keyboardShouldPersistTaps="handled">
          <PoseRow title="Suggested for now" poses={suggested} caption={captionFor} {...rowProps} />
          <PoseRow title="Favourites" poses={favorites} {...rowProps} />
          <PoseRow title="Recently used" poses={recents} {...rowProps} />
          <View style={styles.section}>
            <AppText variant="label" uppercase color={colors.textTertiary} style={styles.sectionTitle}>
              Categories
            </AppText>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((category) => {
                const poses = posesInCategory(category.id);
                return (
                  <CategoryCard key={category.id} category={category} count={poses.length} preview={poses[0]} width={cardWidth} onPress={openCategory} />
                );
              })}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
    height: 46,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  search: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  row: {
    paddingHorizontal: spacing.lg,
    gap: GAP,
  },
  caption: {
    marginTop: spacing.xs,
  },
  grid: {
    paddingHorizontal: spacing.lg,
    gap: GAP,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    paddingHorizontal: spacing.lg,
  },
});
