import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, motion, touchTarget } from '@/theme/tokens';
import { haptics } from '@/utils/haptics';

import { AppText } from './AppText';

export interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  size?: number;
  iconSize?: number;
  active?: boolean;
  disabled?: boolean;
  /** Translucent dark background for use over the camera preview. */
  glass?: boolean;
  /** Small caption under or beside the icon (e.g. "AUTO", "3s"). */
  badge?: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
  hapticFeedback?: boolean;
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
  size = touchTarget,
  iconSize = 22,
  active = false,
  disabled = false,
  glass = false,
  badge,
  color,
  style,
  hapticFeedback = true,
}: IconButtonProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const tint = disabled ? colors.textTertiary : (color ?? (active ? colors.accent : colors.text));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      hitSlop={6}
      onPressIn={() => {
        scale.set(withSpring(0.88, motion.spring));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, motion.spring));
      }}
      onPress={() => {
        if (hapticFeedback) haptics.tap();
        onPress();
      }}
      style={style}
    >
      <Animated.View
        style={[
          styles.base,
          { width: size, height: size, borderRadius: size / 2 },
          glass && styles.glass,
          active && glass && styles.activeGlass,
          animatedStyle,
        ]}
      >
        <Icon size={iconSize} color={tint} strokeWidth={1.9} />
        {badge ? (
          <View style={styles.badge} pointerEvents="none">
            <AppText variant="label" color={active ? colors.accent : colors.textSecondary} style={styles.badgeText}>
              {badge}
            </AppText>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glass: {
    backgroundColor: colors.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  activeGlass: {
    backgroundColor: colors.accentMuted,
    borderColor: 'rgba(255,200,97,0.35)',
  },
  badge: {
    position: 'absolute',
    bottom: -2,
    right: -4,
    paddingHorizontal: 3,
    borderRadius: 6,
    backgroundColor: colors.glassStrong,
  },
  badgeText: {
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.4,
  },
});
