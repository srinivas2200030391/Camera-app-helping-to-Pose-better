/**
 * Basic camera engine for Expo Go, built on expo-camera. No exposure compensation, tap-to-focus
 * or face guidance (not exposed by expo-camera on Android); zoom is digital only.
 * Excluded from native Android builds (see package.json `expo.autolinking`), so it is only
 * required when running inside Expo Go.
 */
import { CameraView } from 'expo-camera';
import { useEffect, useImperativeHandle, useRef, useState, type ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { BASIC_CAPABILITIES, type CameraEngineProps } from '../types';

const MAX_ZOOM_FACTOR = BASIC_CAPABILITIES.maxZoom;

/** expo-camera zoom is 0..1 of the device range; approximate it from a zoom factor. */
function toExpoZoom(factor: number): number {
  return Math.min(1, Math.max(0, (factor - 1) / (MAX_ZOOM_FACTOR - 1)));
}

export default function ExpoCameraEngine({
  ref,
  facing,
  isActive,
  zoom,
  torch,
  flash,
  aspect,
  style,
  onCapabilities,
  onPreviewStarted,
  onError,
}: CameraEngineProps): ReactElement {
  const cameraRef = useRef<CameraView>(null);
  const [zoomValue, setZoomValue] = useState(0);

  useAnimatedReaction(
    () => Math.round(zoom.value * 20) / 20,
    (current, previous) => {
      if (current !== previous) scheduleOnRN(setZoomValue, toExpoZoom(current));
    },
  );

  useEffect(() => {
    onCapabilities?.(BASIC_CAPABILITIES);
  }, [onCapabilities, facing]);

  useImperativeHandle(
    ref,
    () => ({
      async capture({ shutterSound }) {
        const camera = cameraRef.current;
        if (!camera) throw new Error('Camera is not ready yet');
        const picture = await camera.takePictureAsync({ quality: 1, shutterSound, exif: false });
        if (!picture?.uri) throw new Error('The camera did not return a photo');
        return { uri: picture.uri, width: picture.width, height: picture.height };
      },
      async focusAt() {
        return false;
      },
    }),
    [],
  );

  return (
    <CameraView
      ref={cameraRef}
      style={[StyleSheet.absoluteFill, style]}
      facing={facing}
      active={isActive}
      zoom={zoomValue}
      enableTorch={torch}
      flash={flash}
      ratio={aspect === '16:9' ? '16:9' : '4:3'}
      animateShutter={false}
      onCameraReady={onPreviewStarted}
      onMountError={(event) => onError?.(event.message)}
    />
  );
}
