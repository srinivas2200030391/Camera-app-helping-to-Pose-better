import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import { AppText } from '@/components/ui/AppText';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { colors, radii, spacing } from '@/theme/tokens';

const W = 160;
const H = 110;
const STROKE = 'rgba(255,255,255,0.35)';
const ACCENT = colors.accent;

function Person({ x, y, s = 1, color = '#EDEDED' }: { x: number; y: number; s?: number; color?: string }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={6 * s} fill={color} />
      <Path d={`M${x - 9 * s},${y + 30 * s} Q${x},${y + 4 * s} ${x + 9 * s},${y + 30 * s} Z`} fill={color} />
    </G>
  );
}

const DIAGRAMS: Record<string, ReactNode> = {
  thirds: (
    <G>
      {[1, 2].map((i) => (
        <Line key={`v${i}`} x1={(W * i) / 3} y1={0} x2={(W * i) / 3} y2={H} stroke={STROKE} />
      ))}
      {[1, 2].map((i) => (
        <Line key={`h${i}`} x1={0} y1={(H * i) / 3} x2={W} y2={(H * i) / 3} stroke={STROKE} />
      ))}
      <Circle cx={W / 3} cy={H / 3} r={5} fill={ACCENT} />
      <Person x={W / 3} y={H / 3 + 6} />
    </G>
  ),
  headroom: (
    <G>
      <Rect x={6} y={6} width={66} height={H - 12} stroke={STROKE} fill="none" rx={4} />
      <Person x={39} y={14} s={1.6} color="#8A8A8A" />
      <Rect x={88} y={6} width={66} height={H - 12} stroke={ACCENT} fill="none" rx={4} />
      <Person x={121} y={34} s={1.6} />
    </G>
  ),
  horizon: (
    <G>
      <Line x1={6} y1={70} x2={74} y2={50} stroke="#8A8A8A" strokeWidth={2} />
      <Line x1={86} y1={60} x2={154} y2={60} stroke={ACCENT} strokeWidth={2} />
      <Path d="M86,60 L104,48 L118,60 Z" fill="rgba(255,255,255,0.25)" />
    </G>
  ),
  leading: (
    <G>
      <Line x1={10} y1={H} x2={W / 2 - 6} y2={42} stroke={STROKE} strokeWidth={2} />
      <Line x1={W - 10} y1={H} x2={W / 2 + 6} y2={42} stroke={STROKE} strokeWidth={2} />
      <Person x={W / 2} y={30} s={0.8} color={ACCENT} />
    </G>
  ),
  framing: (
    <G>
      <Path d={`M40,${H} L40,40 Q80,0 120,40 L120,${H}`} stroke={STROKE} strokeWidth={6} fill="none" />
      <Person x={80} y={62} s={0.9} color={ACCENT} />
    </G>
  ),
  lens: (
    <G>
      <Ellipse cx={40} cy={55} rx={20} ry={26} fill="#8A8A8A" />
      <Ellipse cx={40} cy={58} rx={7} ry={9} fill="#5A5A5A" />
      <Ellipse cx={120} cy={55} rx={17} ry={24} fill="#EDEDED" />
      <Ellipse cx={120} cy={58} rx={4} ry={5} fill="#BDBDBD" />
      <Line x1={70} y1={100} x2={92} y2={100} stroke={ACCENT} strokeWidth={2} />
    </G>
  ),
};

const LESSONS = [
  { key: 'thirds', title: 'Rule of thirds', body: 'Place eyes or the subject where the grid lines cross. It feels more natural than dead centre — turn on the Thirds grid.' },
  { key: 'headroom', title: 'Mind the headroom', body: 'Leave a little space above the head, not too much. With face guidance on, PoseLens tells you when it is off.' },
  { key: 'horizon', title: 'Keep the horizon level', body: 'A tilted horizon is the most common mistake. Watch the level line: it turns gold when you are straight.' },
  { key: 'leading', title: 'Use leading lines', body: 'Paths, railings and shorelines draw the eye. Let them run toward your subject.' },
  { key: 'framing', title: 'Frame within a frame', body: 'Doorways, arches and windows frame the subject and add depth — great at temples and old towns.' },
  { key: 'lens', title: 'Step back for portraits', body: 'Close-up wide-angle shots stretch faces. Step back and use 2× for flattering, natural proportions.' },
];

export default function LearnScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const diagramW = Math.min(width - spacing.lg * 4, 320);
  return (
    <View style={styles.screen}>
      <ScreenHeader title="Composition tips" subtitle="Six habits for better photos" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}>
        {LESSONS.map((lesson, index) => (
          <View key={lesson.key} style={styles.card}>
            <View style={styles.diagram}>
              <Svg width={diagramW} height={(diagramW * H) / W} viewBox={`0 0 ${W} ${H}`}>
                {DIAGRAMS[lesson.key]}
              </Svg>
            </View>
            <AppText variant="label" uppercase color={colors.accent}>
              Tip {index + 1}
            </AppText>
            <AppText variant="title">{lesson.title}</AppText>
            <AppText variant="body" color={colors.textSecondary}>
              {lesson.body}
            </AppText>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  diagram: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: '#17171C',
  },
});
