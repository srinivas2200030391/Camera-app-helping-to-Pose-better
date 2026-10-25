/**
 * Picks the camera engine once per process. Only the module for the current environment is
 * required, so Expo Go never loads the Nitro/VisionCamera stack and native builds never load
 * expo-camera (which is excluded from Android autolinking).
 */
import type { ComponentType, ReactElement } from 'react';

import { isExpoGo } from '@/utils/platform';

import type { CameraEngineProps } from './types';

/* eslint-disable @typescript-eslint/no-require-imports */
const Engine: ComponentType<CameraEngineProps> = isExpoGo
  ? (require('./engines/ExpoCameraEngine') as { default: ComponentType<CameraEngineProps> }).default
  : (require('./engines/VisionCameraEngine') as { default: ComponentType<CameraEngineProps> }).default;
/* eslint-enable @typescript-eslint/no-require-imports */

export function CameraEngine(props: CameraEngineProps): ReactElement {
  return <Engine {...props} />;
}

export const cameraEngineName = isExpoGo ? 'expo-camera (Expo Go)' : 'VisionCamera';
