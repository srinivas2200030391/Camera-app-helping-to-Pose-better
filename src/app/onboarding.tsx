import { useRouter } from 'expo-router';
import { Camera, ChevronRight, ShieldCheck } from 'lucide-react-native';
import type React from 'react';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import Animated, { interpolate, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Path } from 'react-native-svg';

import { useCameraPermissionState } from '@/camera/permissions';
import { PoseFigure } from '@/components/pose/PoseFigure';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { SettingRow } from '@/components/ui/SettingRow';
import { APP_NAME } from '@/config/brand';
import { getPose } from '@/poses/library';
import { useSettingsStore } from '@/state/settings';
import { colors, radii, spacing } from '@/theme/tokens';

interface Page {
  key: string;
  poseId: string;
  eyebrow: string;
  title: string;
  body: string;
}

const PAGES: Page[] = [
  {
    key: 'pose',
    poseId: 'hand-on-hip',
    eyebrow: 'Pose assistant',
    title: 'Know exactly how to pose',
    body: '38 original poses for travel, couples, groups and more — layered right over the live camera.',
  },
  {
    key: 'frame',
    poseId: 'archway',
    eyebrow: 'Composition',
    title: 'Frame it right, every time',
    body: 'Grids, a live level and gentle hints for headroom and distance help you line up the shot.',
  },
  {
    key: 'enhance',
    poseId: 'classic-headshot',
    eyebrow: 'Natural enhancement',
    title: 'Better photos that still look real',
    body: 'Smart white balance, light and noise cleanup — processed on your phone. Originals are always kept.',
  },
];

function FrameBrackets({ width, height }: { width: number; height: number }) {
  const c = 22;
  const d = [
    `M0,${c} L0,0 L${c},0`,
    `M${width - c},0 L${width},0 L${width},${c}`,
    `M${width},${height - c} L${width},${height} L${width - c},${height}`,
    `M${c},${height} L0,${height} L0,${height - c}`,
  ].join(' ');
  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={colors.accent} strokeWidth={2.5} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function GridLines({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height}>
      {[1, 2].map((i) => (
        <Line key={`v${i}`} x1={(width * i) / 3} y1={0} x2={(width * i) / 3} y2={height} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      ))}
      {[1, 2].map((i) => (
        <Line key={`h${i}`} x1={0} y1={(height * i) / 3} x2={width} y2={(height * i) / 3} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      ))}
    </Svg>
  );
}

interface LayerProps {
  index: number;
  factor: number;
  scrollX: SharedValue<number>;
  width: number;
  padded?: boolean;
  children: React.ReactNode;
}

/** One depth layer: moves faster (front) or slower (back) than the page while swiping. */
function ParallaxLayer({ index, factor, scrollX, width, padded, children }: LayerProps) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(scrollX.value, [(index - 1) * width, index * width, (index + 1) * width], [factor * 60, 0, -factor * 60]) },
    ],
  }));
  return <Animated.View style={[StyleSheet.absoluteFill, padded && { padding: spacing.lg }, style]}>{children}</Animated.View>;
}

function Art({ index, page, scrollX, width }: { index: number; page: Page; scrollX: SharedValue<number>; width: number }) {
  const artW = Math.min(width - spacing.xxxl * 2, 300);
  const artH = (artW * 4) / 3;
  const pose = useMemo(() => getPose(page.poseId), [page.poseId]);
  const common = { index, scrollX, width };
  return (
    <View style={[styles.art, { width: artW, height: artH }]}>
      <ParallaxLayer {...common} factor={0.4}>
        <GridLines width={artW} height={artH} />
      </ParallaxLayer>
      {pose ? (
        <ParallaxLayer {...common} factor={1}>
          <PoseFigure figures={pose.figures} width={artW} height={artH} variant="card" color="rgba(255,255,255,0.92)" />
        </ParallaxLayer>
      ) : null}
      <ParallaxLayer {...common} factor={1.8} padded>
        <FrameBrackets width={artW - spacing.lg * 2} height={artH - spacing.lg * 2} />
      </ParallaxLayer>
    </View>
  );
}

function Dot({ index, scrollX, width }: { index: number; scrollX: SharedValue<number>; width: number }) {
  const style = useAnimatedStyle(() => {
    const t = interpolate(scrollX.value, [(index - 1) * width, index * width, (index + 1) * width], [0, 1, 0], 'clamp');
    return { width: 6 + 16 * t, opacity: 0.35 + 0.65 * t };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const settings = useSettingsStore();
  const permission = useCameraPermissionState();
  const scrollX = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const [page, setPage] = useState(0);
  const finishing = useRef(false);
  const lastPage = PAGES.length; // permission step

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.set(event.contentOffset.x);
  });

  const goTo = (index: number) => {
    (scrollRef.current as unknown as ScrollViewInstance | null)?.scrollTo({ x: index * width, animated: true });
    setPage(index);
  };

  const finish = async () => {
    if (finishing.current) return;
    finishing.current = true;
    if (permission.status !== 'granted') await permission.request();
    settings.update({ onboardingComplete: true });
    router.replace('/camera');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Camera size={16} color={colors.accentText} strokeWidth={2.4} />
        </View>
        <AppText variant="bodyStrong">{APP_NAME}</AppText>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}
        style={styles.pager}
      >
        {PAGES.map((item, index) => (
          <View key={item.key} style={[styles.page, { width }]}>
            <Art index={index} page={item} scrollX={scrollX} width={width} />
            <View style={styles.copy}>
              <AppText variant="label" uppercase color={colors.accent}>
                {item.eyebrow}
              </AppText>
              <AppText variant="display" align="center">
                {item.title}
              </AppText>
              <AppText variant="body" color={colors.textSecondary} align="center">
                {item.body}
              </AppText>
            </View>
          </View>
        ))}
        <View style={[styles.page, { width }]}>
          <View style={styles.privacyIcon}>
            <ShieldCheck size={34} color={colors.accent} strokeWidth={1.6} />
          </View>
          <View style={styles.copy}>
            <AppText variant="label" uppercase color={colors.accent}>
              Private by design
            </AppText>
            <AppText variant="display" align="center">
              Your photos stay on your phone
            </AppText>
            <AppText variant="body" color={colors.textSecondary} align="center">
              No account, no uploads. The camera is used only while the app is open. Photos stay private in {APP_NAME} until you export them.
            </AppText>
          </View>
          <View style={styles.option}>
            <SettingRow
              title="Also save new photos to my gallery"
              description="You can change this any time in Settings"
              value={settings.autoExportToGallery}
              onValueChange={(autoExportToGallery) => settings.update({ autoExportToGallery })}
            />
          </View>
        </View>
      </Animated.ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {[...PAGES, null].map((_, index) => (
            <Dot key={index} index={index} scrollX={scrollX} width={width} />
          ))}
        </View>
        {page < lastPage ? (
          <View style={styles.actions}>
            <Button label="Skip" variant="ghost" compact onPress={() => goTo(lastPage)} />
            <Button label="Next" icon={ChevronRight} compact onPress={() => goTo(page + 1)} />
          </View>
        ) : (
          <Button
            label={permission.status === 'granted' ? 'Open camera' : 'Allow camera & start'}
            icon={Camera}
            onPress={() => void finish()}
            style={styles.cta}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  pager: {
    flex: 1,
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
    gap: spacing.xxl,
  },
  art: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    overflow: 'hidden',
  },
  copy: {
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 360,
  },
  privacyIcon: {
    width: 84,
    height: 84,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentMuted,
  },
  option: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  footer: {
    paddingHorizontal: spacing.xxl,
    gap: spacing.xl,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cta: {
    alignSelf: 'stretch',
  },
});
