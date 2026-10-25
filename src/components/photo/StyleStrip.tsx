import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { STYLES, type StyleId } from '@/processing/presets';
import { colors, radii, spacing } from '@/theme/tokens';
import { haptics } from '@/utils/haptics';

export interface StyleStripProps {
  value: StyleId;
  onChange: (style: StyleId) => void;
}

function StyleStripImpl({ value, onChange }: StyleStripProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content} accessibilityRole="tablist" accessibilityLabel="Styles">
      {STYLES.map((style) => {
        const selected = style.id === value;
        return (
          <Pressable
            key={style.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${style.name}. ${style.description}`}
            onPress={() => {
              if (selected) return;
              haptics.tap();
              onChange(style.id);
            }}
            style={styles.item}
          >
            <View style={[styles.swatchRing, selected && styles.swatchRingSelected]}>
              <LinearGradient colors={style.swatch} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.swatch} />
            </View>
            <AppText variant="caption" color={selected ? colors.accent : colors.textSecondary} style={selected ? styles.selectedText : undefined}>
              {style.name}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export const StyleStrip = memo(StyleStripImpl);

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  item: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 62,
  },
  swatchRing: {
    padding: 2,
    borderRadius: radii.md + 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  swatchRingSelected: {
    borderColor: colors.accent,
  },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
  },
  selectedText: {
    fontWeight: '600',
  },
});
