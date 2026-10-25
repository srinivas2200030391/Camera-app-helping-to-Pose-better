import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { isNearlyFlat, rollFromAccelerometer } from './composition';

const UPDATE_MS = 50;
const STATE_MS = 400;
const SMOOTHING = 0.22;

export interface DeviceLevel {
  /** Smoothed roll in degrees (UI-thread value for the level line). */
  roll: SharedValue<number>;
  /** 1 when the phone is held upright enough for the level to be meaningful. */
  visible: SharedValue<number>;
  /** Roll for hint logic, updated a few times per second; null when flat or unavailable. */
  rollForHints: number | null;
}

export function useDeviceLevel(enabled: boolean): DeviceLevel {
  const roll = useSharedValue(0);
  const visible = useSharedValue(0);
  const [rollForHints, setRollForHints] = useState<number | null>(null);
  const filtered = useRef<number | null>(null);
  const lastState = useRef(0);

  useEffect(() => {
    if (!enabled) {
      visible.set(0);
      return;
    }
    let subscription: { remove: () => void } | null = null;
    let cancelled = false;
    Accelerometer.isAvailableAsync()
      .then((available) => {
        if (!available || cancelled) return;
        Accelerometer.setUpdateInterval(UPDATE_MS);
        subscription = Accelerometer.addListener(({ x, y }) => {
          if (isNearlyFlat(x, y)) {
            visible.set(0);
            filtered.current = null;
            return;
          }
          const raw = rollFromAccelerometer(x, y, Platform.OS === 'ios' ? 'ios' : 'android');
          // Low-pass filter; unwrap across ±180° so the filter never sweeps the long way round.
          const previous = filtered.current ?? raw;
          let delta = raw - previous;
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;
          const next = previous + delta * SMOOTHING;
          filtered.current = next;
          roll.set(next);
          visible.set(1);
          const now = Date.now();
          if (now - lastState.current > STATE_MS) {
            lastState.current = now;
            setRollForHints(Math.round(next * 10) / 10);
          }
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled, roll, visible]);

  return { roll, visible, rollForHints: enabled ? rollForHints : null };
}
