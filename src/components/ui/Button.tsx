import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, motion, radii, spacing } from '@/theme/tokens';
import { haptics } from '@/utils/haptics';

import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.accent, fg: colors.accentText, border: colors.accent },
  secondary: { bg: colors.surfaceRaised, fg: colors.text, border: colors.hairline },
  ghost: { bg: 'transparent', fg: colors.text, border: colors.hairlineStrong },
  danger: { bg: colors.dangerMuted, fg: colors.danger, border: 'rgba(248,113,113,0.35)' },
};

export function Button({ label, onPress, variant = 'primary', icon: Icon, loading, disabled, compact, style, accessibilityHint }: ButtonProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const theme = VARIANTS[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPressIn={() => {
        scale.set(withSpring(0.97, motion.spring));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, motion.spring));
      }}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={style}
    >
      <Animated.View
        style={[
          styles.base,
          compact && styles.compact,
          { backgroundColor: theme.bg, borderColor: theme.border, opacity: inactive ? 0.55 : 1 },
          animated,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={theme.fg} size="small" />
        ) : (
          <View style={styles.row}>
            {Icon ? <Icon size={compact ? 16 : 18} color={theme.fg} strokeWidth={2} /> : null}
            <AppText variant={compact ? 'caption' : 'bodyStrong'} color={theme.fg} style={{ fontWeight: '600' }}>
              {label}
            </AppText>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: {
    minHeight: 38,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
