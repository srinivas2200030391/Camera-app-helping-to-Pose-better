import { FlipHorizontal2, Lock, Move, RotateCcw, X } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { Slider } from '@/components/ui/Slider';
import { colors, radii, spacing } from '@/theme/tokens';

export interface OverlayBarProps {
  poseName: string;
  opacity: number;
  editing: boolean;
  mirrored: boolean;
  onOpacity: (value: number) => void;
  onToggleEditing: () => void;
  onToggleMirror: () => void;
  onReset: () => void;
  onRemove: () => void;
}

/** Controls for the pose guide only — kept visually separate from the photo controls. */
function OverlayBarImpl(props: OverlayBarProps) {
  return (
    <View style={styles.bar}>
      <View style={styles.head}>
        <AppText variant="label" uppercase color={colors.textTertiary}>
          Pose guide
        </AppText>
        <AppText variant="caption" numberOfLines={1} style={styles.name}>
          {props.poseName}
        </AppText>
        <IconButton icon={X} label="Remove pose guide" size={34} iconSize={18} onPress={props.onRemove} />
      </View>
      <View style={styles.row}>
        <View style={styles.slider}>
          <Slider
            label="Opacity"
            value={Math.round(props.opacity * 100)}
            min={10}
            max={100}
            step={5}
            origin={10}
            resetValue={55}
            onChange={(value) => props.onOpacity(value / 100)}
            format={(value) => `${Math.round(value)}%`}
            compact
          />
        </View>
        <IconButton icon={FlipHorizontal2} label="Mirror pose guide" active={props.mirrored} size={38} iconSize={19} onPress={props.onToggleMirror} />
        <IconButton
          icon={props.editing ? Lock : Move}
          label={props.editing ? 'Lock pose guide position' : 'Move, scale or rotate the pose guide'}
          active={props.editing}
          size={38}
          iconSize={19}
          onPress={props.onToggleEditing}
        />
        <IconButton icon={RotateCcw} label="Reset pose guide position" size={38} iconSize={19} onPress={props.onReset} />
      </View>
      {props.editing ? (
        <AppText variant="caption" color={colors.accent} align="center">
          Drag, pinch or twist on the preview to place the guide
        </AppText>
      ) : null}
    </View>
  );
}

export const OverlayBar = memo(OverlayBarImpl);

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.glassStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  slider: {
    flex: 1,
    marginRight: spacing.xs,
  },
});
