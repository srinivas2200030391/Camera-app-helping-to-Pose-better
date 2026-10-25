import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { colors, spacing } from '@/theme/tokens';
import { haptics } from '@/utils/haptics';

import { AppText } from './AppText';

export interface SettingRowProps {
  title: string;
  description?: string;
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  /** Custom right-hand content (ignored when `value` is provided). */
  accessory?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /** Shown instead of the description when the setting is unavailable. */
  unavailableReason?: string;
}

export function SettingRow({ title, description, value, onValueChange, accessory, onPress, disabled, unavailableReason }: SettingRowProps) {
  const isToggle = typeof value === 'boolean' && onValueChange;
  const content = (
    <View style={[styles.row, disabled && { opacity: 0.5 }]}>
      <View style={styles.text}>
        <AppText variant="body">{title}</AppText>
        {unavailableReason || description ? (
          <AppText variant="caption" color={unavailableReason ? colors.warning : colors.textSecondary}>
            {unavailableReason ?? description}
          </AppText>
        ) : null}
      </View>
      {isToggle ? (
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={(next) => {
            haptics.tap();
            onValueChange(next);
          }}
          trackColor={{ false: colors.surfacePressed, true: colors.accentMuted }}
          thumbColor={value ? colors.accent : colors.textSecondary}
          accessibilityLabel={title}
        />
      ) : (
        accessory
      )}
    </View>
  );
  if (onPress && !isToggle) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} disabled={disabled} style={({ pressed }) => pressed && { opacity: 0.7 }}>
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: spacing.sm,
    gap: spacing.lg,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
