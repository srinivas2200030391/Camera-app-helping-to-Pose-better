import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';

import type { StyleId } from '@/processing/presets';

export type GridType = 'off' | 'thirds' | 'golden' | 'center' | 'diagonal';
export type AspectRatio = '4:3' | '16:9' | '1:1';
export type TimerMode = 'off' | '3' | '10' | 'face';
export type FlashSetting = 'off' | 'auto' | 'on' | 'torch';
export type CaptureQuality = 'speed' | 'balanced' | 'quality';
export type OverlayStyle = 'ghost' | 'outline';

export interface Settings {
  onboardingComplete: boolean;
  gridType: GridType;
  showLevel: boolean;
  showCenterMark: boolean;
  compositionHints: boolean;
  faceGuidance: boolean;
  aspectRatio: AspectRatio;
  timer: TimerMode;
  flash: FlashSetting;
  captureQuality: CaptureQuality;
  photoHdr: boolean;
  shutterSound: boolean;
  haptics: boolean;
  overlayOpacity: number;
  overlayStyle: OverlayStyle;
  defaultStyle: StyleId;
  exportQuality: number;
  keepMetadata: boolean;
  autoExportToGallery: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  onboardingComplete: false,
  gridType: 'thirds',
  showLevel: true,
  showCenterMark: false,
  compositionHints: true,
  faceGuidance: true,
  aspectRatio: '4:3',
  timer: 'off',
  flash: 'off',
  captureQuality: 'balanced',
  photoHdr: false,
  shutterSound: true,
  haptics: true,
  overlayOpacity: 0.55,
  overlayStyle: 'ghost',
  defaultStyle: 'natural',
  exportQuality: 0.95,
  keepMetadata: true,
  autoExportToGallery: false,
};

const STORAGE_KEY = 'settings.v1';

function load(): Settings {
  try {
    const raw = Storage.getItemSync(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // Unknown keys are dropped and missing keys fall back to defaults, so old installs stay valid.
    const merged: Settings = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const value = parsed[key];
      if (value !== undefined && typeof value === typeof DEFAULT_SETTINGS[key]) {
        (merged as unknown as Record<string, unknown>)[key] = value;
      }
    }
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persist(settings: Settings): void {
  try {
    Storage.setItemSync(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('[settings] failed to persist', error);
  }
}

interface SettingsStore extends Settings {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

function pickSettings(state: SettingsStore): Settings {
  const result = {} as Settings;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    (result as unknown as Record<string, unknown>)[key] = state[key];
  }
  return result;
}

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
  ...load(),
  update: (patch) => {
    set(patch);
    persist(pickSettings(get()));
  },
  reset: () => {
    // Keep onboarding state: resetting preferences should not replay the intro.
    const next = { ...DEFAULT_SETTINGS, onboardingComplete: get().onboardingComplete };
    set(next);
    persist(next);
  },
}));
