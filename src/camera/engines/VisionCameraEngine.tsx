/**
 * Full camera engine (development build / release APK), built on VisionCamera v5.
 * Never imported in Expo Go — see camera/CameraEngine.tsx.
 */
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, type ReactElement } from 'react';
import { StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Camera, useCameraDevice, usePhotoOutput, type CameraOutput, type CameraRef, type Constraint } from 'react-native-vision-camera';
import { createFaceDetectorOutput, type Face } from 'react-native-vision-camera-face-detector';

import type { AspectRatio } from '@/state/settings';

import { zoomPresetsFor, type CameraEngineProps, type FaceBox } from '../types';

/** Portrait target sizes (~12 MP). 1:1 is captured at 4:3 and centre-cropped on output. */
const TARGETS: Record<AspectRatio, { width: number; height: number }> = {
  '4:3': { width: 3000, height: 4000 },
  '16:9': { width: 2250, height: 4000 },
  '1:1': { width: 3000, height: 4000 },
};

const FACE_THROTTLE_MS = 160;

function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

export default function VisionCameraEngine({
  ref,
  facing,
  isActive,
  zoom,
  exposure,
  torch,
  aspect,
  quality,
  photoHdr,
  faceGuidance,
  style,
  onCapabilities,
  onPreviewStarted,
  onError,
  onFaces,
}: CameraEngineProps): ReactElement | null {
  const device = useCameraDevice(facing);
  const cameraRef = useRef<CameraRef>(null);
  const layout = useRef({ width: 1, height: 1 });
  const lastFaces = useRef(0);
  const onFacesRef = useRef(onFaces);
  useLayoutEffect(() => {
    onFacesRef.current = onFaces;
  }, [onFaces]);

  const photoOutput = usePhotoOutput({
    targetResolution: TARGETS[aspect],
    containerFormat: 'jpeg',
    quality: 0.95,
    qualityPrioritization: quality,
  });

  const handleFaces = useCallback((faces: Face[]) => {
    const now = Date.now();
    if (now - lastFaces.current < FACE_THROTTLE_MS) return;
    lastFaces.current = now;
    const camera = cameraRef.current;
    const callback = onFacesRef.current;
    if (!camera || !callback) return;
    const { width, height } = layout.current;
    const boxes: FaceBox[] = [];
    for (const face of faces) {
      const { x, y, width: w, height: h } = face.bounds;
      const corners = [
        camera.convertCameraPointToViewPoint({ x, y }),
        camera.convertCameraPointToViewPoint({ x: x + w, y: y + h }),
      ];
      const minX = Math.min(corners[0]!.x, corners[1]!.x);
      const minY = Math.min(corners[0]!.y, corners[1]!.y);
      const maxX = Math.max(corners[0]!.x, corners[1]!.x);
      const maxY = Math.max(corners[0]!.y, corners[1]!.y);
      boxes.push({
        x: minX / width,
        y: minY / height,
        width: (maxX - minX) / width,
        height: (maxY - minY) / height,
        rollAngle: face.rollAngle,
        yawAngle: face.yawAngle,
      });
    }
    callback(boxes);
  }, []);

  // Created with stable dependencies: the package hook re-creates its output on every render.
  const faceOutput = useMemo<CameraOutput | null>(() => {
    if (!faceGuidance) return null;
    try {
      // handleFaces only runs from native face-detection callbacks, never during render.
      // eslint-disable-next-line react-hooks/refs
      return createFaceDetectorOutput({
        performanceMode: 'fast',
        runLandmarks: false,
        runContours: false,
        runClassifications: false,
        minFaceSize: 0.08,
        trackingEnabled: false,
        cameraFacing: facing,
        autoMode: true,
        outputResolution: 'preview',
        onFacesDetected: handleFaces,
        onError: (error: Error) => console.warn('[faces]', error.message),
      });
    } catch (error) {
      console.warn('[faces] face detection unavailable', error);
      return null;
    }
  }, [faceGuidance, facing, handleFaces]);

  const outputs = useMemo(() => (faceOutput ? [photoOutput, faceOutput] : [photoOutput]), [photoOutput, faceOutput]);
  const constraints = useMemo<Constraint[]>(
    () => [{ resolutionBias: photoOutput }, ...(photoHdr ? [{ photoHDR: true }] : [])],
    [photoOutput, photoHdr],
  );

  useEffect(() => {
    if (!device || !onCapabilities) return;
    const { optical, presets } = zoomPresetsFor(device.minZoom, device.maxZoom, device.zoomLensSwitchFactors ?? []);
    onCapabilities({
      engine: 'vision-camera',
      hasFlash: device.hasFlash,
      hasTorch: device.hasTorch,
      supportsExposure: device.supportsExposureBias,
      minExposure: device.minExposureBias,
      maxExposure: device.maxExposureBias,
      minZoom: device.minZoom,
      maxZoom: Math.min(device.maxZoom, 10),
      opticalStops: optical,
      zoomPresets: presets,
      supportsFocus: device.supportsFocusMetering,
      supportsPhotoHdr: device.supportsPhotoHDR,
      supportsFaceGuidance: true,
    });
  }, [device, onCapabilities]);

  useImperativeHandle(
    ref,
    () => ({
      async capture({ flash, shutterSound }) {
        const { filePath } = await photoOutput.capturePhotoToFile(
          { flashMode: device?.hasFlash ? flash : 'off', enableShutterSound: shutterSound },
          {},
        );
        return { uri: toFileUri(filePath) };
      },
      async focusAt(x, y) {
        if (!device?.supportsFocusMetering || !cameraRef.current) return false;
        try {
          await cameraRef.current.focusTo({ x, y });
          return true;
        } catch {
          return false;
        }
      },
    }),
    [device, photoOutput],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    layout.current = { width: Math.max(1, event.nativeEvent.layout.width), height: Math.max(1, event.nativeEvent.layout.height) };
  }, []);

  const handleError = useCallback((error: Error) => onError?.(error.message), [onError]);

  if (!device) return null;
  return (
    <Camera
      ref={cameraRef}
      style={[StyleSheet.absoluteFill, style]}
      device={device}
      isActive={isActive}
      outputs={outputs}
      constraints={constraints}
      zoom={zoom}
      exposure={device.supportsExposureBias ? exposure : undefined}
      torchMode={torch && device.hasTorch ? 'on' : 'off'}
      orientationSource="device"
      mirrorMode="auto"
      resizeMode="cover"
      onLayout={onLayout}
      onPreviewStarted={onPreviewStarted}
      onError={handleError}
    />
  );
}
