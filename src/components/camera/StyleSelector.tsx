import { memo, useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { STYLES, type StyleId } from '@/processing/presets';
import { colors, spacing } from '@/theme/tokens';
import { haptics } from '@/utils/haptics';

export interface StyleSelectorProps {
  value: StyleId;
  onChange: (style: StyleId) => void;
}

/** Camera-mode-style selector for the look applied after capture. */
function StyleSelectorImpl({ value, onChange }: StyleSelectorProps) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const positions = useRef<Record<string, number>>({});

  useEffect(() => {
    const x = positions.current[value];
    if (x != null) scrollRef.current?.scrollTo({ x: Math.max(0, x - 120), animated: true });
  }, [value]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      accessibilityRole="tablist"
      accessibilityLabel="Photo style, applied after capture"
    >
      {STYLES.map((style) => {
        const selected = style.id === value;
        return (
          <Pressable
            key={style.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${style.name}: ${style.description}`}
            onLayout={(event) => {
              positions.current[style.id] = event.nativeEvent.layout.x;
            }}
            onPress={() => {
              if (selected) return;
              haptics.tap();
              onChange(style.id);
            }}
            style={styles.item}
            hitSlop={{ top: 8, bottom: 8 }}
          >
            <AppText variant="label" uppercase color={selected ? colors.accent : colors.textSecondary}>
              {style.name}
            </AppText>
            <View style={[styles.dot, selected && styles.dotSelected]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export const StyleSelector = memo(StyleSelectorImpl);

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
    alignItems: 'center',
  },
  item: {
    alignItems: 'center',
    gap: 5,
    paddingVertical: spacing.xs,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  dotSelected: {
    backgroundColor: colors.accent,
  },
});
