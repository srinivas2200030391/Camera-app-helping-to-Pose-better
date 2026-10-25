import {
  EyeOff,
  Flashlight,
  Grid3x3,
  Settings2,
  Timer,
  TimerOff,
  Zap,
  ZapOff,
  type LucideIcon,
} from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui/IconButton';
import type { AspectRatio, FlashSetting, GridType, TimerMode } from '@/state/settings';
import { colors, radii, spacing } from '@/theme/tokens';

export interface CameraTopBarProps {
  flash: FlashSetting;
  flashModes: readonly FlashSetting[];
  timer: TimerMode;
  timerModes: readonly TimerMode[];
  aspect: AspectRatio;
  grid: GridType;
  onFlash: (next: FlashSetting) => void;
  onTimer: (next: TimerMode) => void;
  onAspect: (next: AspectRatio) => void;
  onGrid: () => void;
  onCleanMode: () => void;
  onSettings: () => void;
  frontScreenFlash: boolean;
}

const FLASH_ICON: Record<FlashSetting, LucideIcon> = { off: ZapOff, auto: Zap, on: Zap, torch: Flashlight };
const FLASH_LABEL: Record<FlashSetting, string> = { off: 'Flash off', auto: 'Flash auto', on: 'Flash on', torch: 'Torch on' };
const FLASH_BADGE: Record<FlashSetting, string | undefined> = { off: undefined, auto: 'A', on: undefined, torch: undefined };
const TIMER_BADGE: Record<TimerMode, string | undefined> = { off: undefined, '3': '3s', '10': '10s', face: 'AUTO' };
const TIMER_LABEL: Record<TimerMode, string> = {
  off: 'Timer off',
  '3': 'Timer 3 seconds',
  '10': 'Timer 10 seconds',
  face: 'Hands-free: starts when a face is detected',
};
const ASPECTS: AspectRatio[] = ['4:3', '16:9', '1:1'];

function cycle<T>(values: readonly T[], current: T): T {
  const index = values.indexOf(current);
  return values[(index + 1) % values.length] as T;
}

function CameraTopBarImpl(props: CameraTopBarProps) {
  const { flash, flashModes, timer, timerModes, aspect, grid } = props;
  return (
    <View style={styles.bar}>
      <View style={styles.group}>
        {flashModes.length > 1 ? (
          <IconButton
            icon={FLASH_ICON[flash]}
            label={props.frontScreenFlash && flash === 'on' ? 'Screen flash on' : FLASH_LABEL[flash]}
            badge={FLASH_BADGE[flash]}
            active={flash !== 'off'}
            onPress={() => props.onFlash(cycle(flashModes, flash))}
          />
        ) : null}
        <IconButton
          icon={timer === 'off' ? TimerOff : Timer}
          label={TIMER_LABEL[timer]}
          badge={TIMER_BADGE[timer]}
          active={timer !== 'off'}
          onPress={() => props.onTimer(cycle(timerModes, timer))}
        />
        <IconButton
          icon={RATIO_ICONS[aspect]}
          label={`Aspect ratio ${aspect}`}
          badge={aspect}
          onPress={() => props.onAspect(cycle(ASPECTS, aspect))}
        />
        <IconButton icon={Grid3x3} label={`Grid: ${grid}`} active={grid !== 'off'} onPress={props.onGrid} />
        <IconButton icon={EyeOff} label="Clean mode: hide controls" onPress={props.onCleanMode} />
      </View>
      <IconButton icon={Settings2} label="Camera settings" onPress={props.onSettings} />
    </View>
  );
}

/** Aspect icons drawn as frames of the right proportions (same props contract as Lucide icons). */
function makeRatioIcon(widthOverHeight: number): LucideIcon {
  function RatioIcon({ size = 22, color = colors.text }: { size?: number; color?: string }) {
    const h = size * (widthOverHeight >= 1 ? 0.7 : 0.82);
    const w = h * widthOverHeight;
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: w, height: h, borderWidth: 1.8, borderColor: color, borderRadius: 3 }} />
      </View>
    );
  }
  return RatioIcon as unknown as LucideIcon;
}

const RATIO_ICONS: Record<AspectRatio, LucideIcon> = {
  '4:3': makeRatioIcon(3 / 4),
  '16:9': makeRatioIcon(9 / 16),
  '1:1': makeRatioIcon(1),
};

export const CameraTopBar = memo(CameraTopBarImpl);

const styles = StyleSheet.create({
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
  },
});
