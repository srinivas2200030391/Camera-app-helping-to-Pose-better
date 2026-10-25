import type { Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { AspectRatio, CaptureQuality } from '@/state/settings';

export type CameraFacing = 'front' | 'back';
export type CaptureFlash = 'off' | 'auto' | 'on';

export interface CameraCapabilities {
  engine: 'vision-camera' | 'expo-camera';
  hasFlash: boolean;
  hasTorch: boolean;
  supportsExposure: boolean;
  minExposure: number;
  maxExposure: number;
  minZoom: number;
  maxZoom: number;
  /** Zoom factors served by a physical lens (no digital crop). Always includes 1 when in range. */
  opticalStops: number[];
  /** Suggested chips (optical stops plus common digital steps). */
  zoomPresets: number[];
  supportsFocus: boolean;
  supportsPhotoHdr: boolean;
  supportsFaceGuidance: boolean;
}

export const BASIC_CAPABILITIES: CameraCapabilities = {
  engine: 'expo-camera',
  hasFlash: true,
  hasTorch: true,
  supportsExposure: false,
  minExposure: 0,
  maxExposure: 0,
  minZoom: 1,
  maxZoom: 8,
  opticalStops: [1],
  zoomPresets: [1, 2, 4],
  supportsFocus: false,
  supportsPhotoHdr: false,
  supportsFaceGuidance: false,
};

export interface CapturedPhoto {
  /** file:// URI of the JPEG in a temporary location; the caller commits it to storage. */
  uri: string;
  /** Stored pixel size when the engine knows it. */
  width?: number;
  height?: number;
}

export interface CaptureOptions {
  flash: CaptureFlash;
  shutterSound: boolean;
}

/** A detected face in preview-view coordinates normalised to 0..1. */
export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rollAngle: number;
  yawAngle: number;
}

export interface CameraEngineHandle {
  capture(options: CaptureOptions): Promise<CapturedPhoto>;
  /** View coordinates in points. Resolves false when focusing is unsupported. */
  focusAt(x: number, y: number): Promise<boolean>;
}

export interface CameraEngineProps {
  ref?: Ref<CameraEngineHandle>;
  facing: CameraFacing;
  isActive: boolean;
  /** Zoom factor (1 = main lens). */
  zoom: SharedValue<number>;
  /** Exposure bias in EV. */
  exposure: SharedValue<number>;
  torch: boolean;
  /** Capture flash. VisionCamera applies it per capture; expo-camera needs it as a view prop. */
  flash: CaptureFlash;
  aspect: AspectRatio;
  quality: CaptureQuality;
  photoHdr: boolean;
  faceGuidance: boolean;
  style?: StyleProp<ViewStyle>;
  onCapabilities?: (capabilities: CameraCapabilities) => void;
  onPreviewStarted?: () => void;
  onError?: (message: string) => void;
  onFaces?: (faces: FaceBox[]) => void;
}

/** Builds lens chips from a device's capabilities. */
export function zoomPresetsFor(minZoom: number, maxZoom: number, switchFactors: readonly number[]): { optical: number[]; presets: number[] } {
  const inRange = (z: number) => z >= minZoom - 1e-3 && z <= maxZoom + 1e-3;
  const optical = new Set<number>();
  if (inRange(1)) optical.add(1);
  if (minZoom < 0.95) optical.add(Math.round(minZoom * 10) / 10);
  for (const factor of switchFactors) if (factor > 0 && inRange(factor)) optical.add(Math.round(factor * 10) / 10);
  const presets = new Set<number>(optical);
  for (const step of [2, 5]) if (inRange(step) && presets.size < 4) presets.add(step);
  const sort = (values: Set<number>) => [...values].sort((a, b) => a - b);
  return { optical: sort(optical), presets: sort(presets) };
}

export function isOpticalZoom(zoom: number, opticalStops: readonly number[]): boolean {
  return opticalStops.some((stop) => Math.abs(stop - zoom) < 0.05);
}
