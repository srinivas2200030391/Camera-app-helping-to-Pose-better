import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, spacing } from '@/theme/tokens';
import { haptics } from '@/utils/haptics';

import { AppText } from './AppText';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
  glass?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Chip({ label, selected, onPress, icon: Icon, glass, style, accessibilityLabel }: ChipProps) {
  const fg = selected ? colors.accentText : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected }}
      onPress={
        onPress
          ? () => {
              haptics.tap();
              onPress();
            }
          : undefined
      }
      style={({ pressed }) => [
        styles.chip,
        glass && styles.glass,
        selected && styles.selected,
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {Icon ? <Icon size={14} color={fg} strokeWidth={2} /> : null}
      <AppText variant="caption" color={fg} style={{ fontWeight: '600' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  glass: {
    backgroundColor: colors.glass,
  },
  selected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
});
