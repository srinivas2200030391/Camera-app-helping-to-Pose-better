/**
 * Camera permission, unified across engines.
 * - granted: ready
 * - undetermined: we may ask
 * - denied: the user said no, but the system still allows asking again
 * - blocked: only system settings can grant it now
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { isExpoGo } from '@/utils/platform';

export type CameraPermissionStatus = 'granted' | 'undetermined' | 'denied' | 'blocked';

export interface CameraPermissionState {
  status: CameraPermissionStatus;
  request: () => Promise<boolean>;
  openSettings: () => void;
}

function openSettings(): void {
  Linking.openSettings().catch(() => undefined);
}

interface Snapshot {
  status: CameraPermissionStatus;
}

interface Backend {
  get(): Promise<Snapshot>;
  request(): Promise<Snapshot>;
}

function createBackend(): Backend {
  /* eslint-disable @typescript-eslint/no-require-imports */
  if (isExpoGo) {
    const { Camera } = require('expo-camera') as typeof import('expo-camera');
    const map = (response: { granted: boolean; canAskAgain: boolean; status: string }): Snapshot => ({
      status: response.granted ? 'granted' : response.status === 'undetermined' ? 'undetermined' : response.canAskAgain ? 'denied' : 'blocked',
    });
    return {
      get: async () => map(await Camera.getCameraPermissionsAsync()),
      request: async () => map(await Camera.requestCameraPermissionsAsync()),
    };
  }
  const { VisionCamera } = require('react-native-vision-camera') as typeof import('react-native-vision-camera');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const read = (): Snapshot => {
    const status = VisionCamera.cameraPermissionStatus;
    if (status === 'authorized') return { status: 'granted' };
    if (status === 'not-determined') return { status: 'undetermined' };
    return { status: status === 'restricted' ? 'blocked' : 'denied' };
  };
  let refusals = 0;
  return {
    get: async () => read(),
    request: async () => {
      const granted = await VisionCamera.requestCameraPermission();
      if (granted) return { status: 'granted' };
      // Android cannot tell "denied" from "don't ask again". The dialog appears at most twice,
      // so after a second refusal only system settings can grant access.
      refusals++;
      return { status: refusals >= 2 ? 'blocked' : 'denied' };
    },
  };
}

let backend: Backend | null = null;
const getBackend = () => (backend ??= createBackend());

export function useCameraPermissionState(): CameraPermissionState & { checked: boolean } {
  const [status, setStatus] = useState<CameraPermissionStatus>('undetermined');
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    const apply = (next: CameraPermissionStatus) => {
      if (!alive) return;
      // Keep "blocked" (learned from a refused request) when the system only reports "denied".
      setStatus((previous) => (previous === 'blocked' && next === 'denied' ? 'blocked' : next));
      setChecked(true);
    };
    const check = () => {
      getBackend()
        .get()
        .then((snapshot) => apply(snapshot.status))
        .catch(() => apply('denied'));
    };
    check();
    // Re-check when returning from system settings.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  const request = useCallback(async () => {
    const snapshot = await getBackend().request();
    setStatus(snapshot.status);
    setChecked(true);
    return snapshot.status === 'granted';
  }, []);

  return { status, checked, request, openSettings };
}
