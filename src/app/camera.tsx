import { Image } from 'expo-image';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { Eye, GraduationCap, PersonStanding, SwitchCamera } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector, useExclusiveGestures, usePinchGesture, useTapGesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { CameraEngine } from '@/camera/CameraEngine';
import { compositionHints } from '@/camera/composition';
import { useCameraPermissionState } from '@/camera/permissions';
import { BASIC_CAPABILITIES, type CameraCapabilities, type CameraEngineHandle, type CameraFacing, type CaptureFlash as CaptureFlashMode, type FaceBox } from '@/camera/types';
import { useDeviceLevel } from '@/camera/useDeviceLevel';
import { CameraTopBar } from '@/components/camera/CameraTopBar';
import { CaptureFlash, type CaptureFlashHandle } from '@/components/camera/CaptureFlash';
import { ExposureControl } from '@/components/camera/ExposureControl';
import { FaceGuides } from '@/components/camera/FaceGuides';
import { FocusRing } from '@/components/camera/FocusRing';
import { GridOverlay } from '@/components/camera/GridOverlay';
import { HintPill } from '@/components/camera/HintPill';
import { LevelIndicator } from '@/components/camera/LevelIndicator';
import { OverlayBar } from '@/components/camera/OverlayBar';
import { PermissionGate } from '@/components/camera/PermissionGate';
import { PoseOverlay } from '@/components/camera/PoseOverlay';
import { QuickSettings } from '@/components/camera/QuickSettings';
import { ShutterButton } from '@/components/camera/ShutterButton';
import { StyleSelector } from '@/components/camera/StyleSelector';
import { ZoomControl } from '@/components/camera/ZoomControl';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { toast } from '@/components/ui/Toast';
import { getPose } from '@/poses/library';
import type { StyleId } from '@/processing/presets';
import { useLibraryStore } from '@/state/library';
import { useOverlayStore } from '@/state/overlay';
import { useSettingsStore, type AspectRatio, type FlashSetting, type GridType, type TimerMode } from '@/state/settings';
import { assertSpaceFor, InsufficientStorageError } from '@/storage/files';
import { exportToGallery } from '@/storage/galleryExport';
import { commitCapture } from '@/storage/photoLibrary';
import { latestPhoto, type PhotoListItem } from '@/storage/photosRepo';
import { recordPoseUse } from '@/storage/posesRepo';
import { colors, radii, spacing } from '@/theme/tokens';
import { haptics } from '@/utils/haptics';
import { logStartupReport, mark, recordSample } from '@/utils/perf';

const TOP_BAR = 56;
const ASPECT_H_OVER_W: Record<AspectRatio, number> = { '4:3': 4 / 3, '16:9': 16 / 9, '1:1': 1 };
const GRID_ORDER: GridType[] = ['thirds', 'golden', 'center', 'diagonal', 'off'];
const FACE_ARM_STABLE_MS = 700;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const now = () => globalThis.performance?.now?.() ?? Date.now();

function captureErrorMessage(error: unknown): string {
  if (error instanceof InsufficientStorageError) return error.message;
  const message = error instanceof Error ? error.message : String(error);
  if (/permission/i.test(message)) return 'Camera permission was revoked. Allow camera access to keep shooting.';
  return 'The photo could not be taken. Please try again.';
}

function sameFaces(a: readonly FaceBox[], b: readonly FaceBox[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((face, i) => {
    const other = b[i];
    return !!other && Math.abs(face.x - other.x) < 0.015 && Math.abs(face.y - other.y) < 0.015 && Math.abs(face.width - other.width) < 0.015;
  });
}

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  return active;
}

export default function CameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const isFocused = useIsFocused();
  const appActive = useAppActive();
  const settings = useSettingsStore();
  const overlay = useOverlayStore();
  const photosVersion = useLibraryStore((state) => state.photosVersion);
  const permission = useCameraPermissionState();

  const [facing, setFacing] = useState<CameraFacing>('back');
  const [capabilities, setCapabilities] = useState<CameraCapabilities>(BASIC_CAPABILITIES);
  const [styleId, setStyleId] = useState<StyleId>(settings.defaultStyle);
  const [cleanMode, setCleanMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [armed, setArmed] = useState(false);
  const [faces, setFaces] = useState<FaceBox[]>([]);
  const [focus, setFocus] = useState({ x: 0, y: 0, token: 0 });
  const [lastPhoto, setLastPhoto] = useState<PhotoListItem | null>(null);

  const zoom = useSharedValue(1);
  const exposure = useSharedValue(0);
  const engineRef = useRef<CameraEngineHandle>(null);
  const flashRef = useRef<CaptureFlashHandle>(null);
  const capturing = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const faceSince = useRef<number | null>(null);
  const armedRef = useRef(false);

  const pose = overlay.poseId ? (getPose(overlay.poseId) ?? null) : null;
  const level = useDeviceLevel(isFocused && (settings.showLevel || settings.compositionHints));
  const faceGuidanceOn = settings.faceGuidance && capabilities.supportsFaceGuidance;

  useEffect(() => {
    mark('cameraMounted');
    mark('firstScreenRendered');
  }, []);

  useEffect(() => {
    let cancelled = false;
    latestPhoto()
      .then((photo) => {
        if (!cancelled) setLastPhoto(photo);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [photosVersion]);

  // Frame geometry: the preview is sized to exactly the area that will be captured.
  const frame = useMemo(() => {
    const ratio = ASPECT_H_OVER_W[settings.aspectRatio];
    const width = screenW;
    const height = Math.min(screenW * ratio, screenH - insets.top);
    const base43 = Math.min(screenW * (4 / 3), screenH - insets.top - TOP_BAR);
    let top = insets.top + TOP_BAR;
    // 16:9 is tall: start right below the status bar; the top bar floats over the preview.
    if (settings.aspectRatio === '16:9') top = insets.top;
    // 1:1 sits centred where the 4:3 frame would be.
    if (settings.aspectRatio === '1:1') top = insets.top + TOP_BAR + (base43 - height) / 2;
    return { width, height, top };
  }, [screenW, screenH, insets.top, settings.aspectRatio]);

  const flashModes = useMemo<FlashSetting[]>(() => {
    if (facing === 'front' && !capabilities.hasFlash) return ['off', 'on'];
    const modes: FlashSetting[] = ['off'];
    if (capabilities.hasFlash) modes.push('auto', 'on');
    if (capabilities.hasTorch) modes.push('torch');
    return modes;
  }, [facing, capabilities.hasFlash, capabilities.hasTorch]);
  const flash: FlashSetting = flashModes.includes(settings.flash) ? settings.flash : 'off';
  const timerModes = useMemo<TimerMode[]>(() => (faceGuidanceOn ? ['off', '3', '10', 'face'] : ['off', '3', '10']), [faceGuidanceOn]);
  const timerMode: TimerMode = timerModes.includes(settings.timer) ? settings.timer : 'off';
  const frontScreenFlash = facing === 'front' && !capabilities.hasFlash;
  const captureFlash: CaptureFlashMode = flash === 'torch' || frontScreenFlash ? 'off' : flash;

  const hints = useMemo(
    () =>
      settings.compositionHints
        ? compositionHints({
            faces: faceGuidanceOn ? faces : [],
            rollDeg: settings.showLevel || settings.compositionHints ? level.rollForHints : null,
            framing: pose?.framing ?? null,
            people: pose?.figures.length ?? 1,
          })
        : [],
    [settings.compositionHints, settings.showLevel, faceGuidanceOn, faces, level.rollForHints, pose],
  );

  const capture = useCallback(async () => {
    const engine = engineRef.current;
    if (capturing.current || !engine) return;
    capturing.current = true;
    setBusy(true);
    const started = now();
    try {
      assertSpaceFor(20 * 1024 * 1024);
      if (frontScreenFlash && flash === 'on') {
        flashRef.current?.setScreenFlash(true);
        await delay(160);
      }
      haptics.shutter();
      const shot = await engine.capture({ flash: captureFlash, shutterSound: settings.shutterSound });
      flashRef.current?.setScreenFlash(false);
      flashRef.current?.blink();
      recordSample('Shutter → JPEG on disk', now() - started);
      const photo = await commitCapture(
        shot.uri,
        {
          facing,
          zoom: Math.round(zoom.get() * 100) / 100,
          exposureBias: Math.round(exposure.get() * 10) / 10,
          flash,
          aspect: settings.aspectRatio,
          poseId: overlay.poseId,
          styleId,
        },
        shot.width && shot.height ? { width: shot.width, height: shot.height } : undefined,
      );
      recordSample('Shutter → saved & indexed', now() - started);
      setLastPhoto(photo);
      if (overlay.poseId) recordPoseUse(overlay.poseId).catch(() => undefined);
      if (settings.autoExportToGallery) {
        exportToGallery(photo.id, photo.originalUri).catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : 'Could not save to the gallery');
        });
      }
    } catch (error) {
      flashRef.current?.setScreenFlash(false);
      console.warn('[camera] capture failed', error);
      toast.error(captureErrorMessage(error));
    } finally {
      capturing.current = false;
      setBusy(false);
    }
  }, [captureFlash, exposure, facing, flash, frontScreenFlash, overlay.poseId, settings.aspectRatio, settings.autoExportToGallery, settings.shutterSound, styleId, zoom]);

  const stopTimer = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setCountdown(null);
    setArmed(false);
    armedRef.current = false;
    faceSince.current = null;
    deactivateKeepAwake('camera-timer');
  }, []);

  const startCountdown = useCallback(
    (seconds: number) => {
      if (timer.current) clearInterval(timer.current);
      activateKeepAwakeAsync('camera-timer').catch(() => undefined);
      let remaining = seconds;
      setCountdown(remaining);
      haptics.tap();
      timer.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          stopTimer();
          void capture();
        } else {
          setCountdown(remaining);
          haptics.tap();
        }
      }, 1000);
    },
    [capture, stopTimer],
  );

  const handleFaces = useCallback(
    (next: FaceBox[]) => {
      // Only re-render when the faces actually moved; detection reports several times a second.
      setFaces((current) => (sameFaces(current, next) ? current : next));
      // Hands-free: start a short countdown once a face has been steadily in frame.
      if (!armedRef.current) return;
      if (next.length === 0) {
        faceSince.current = null;
        return;
      }
      faceSince.current ??= Date.now();
      if (Date.now() - faceSince.current >= FACE_ARM_STABLE_MS) {
        armedRef.current = false;
        setArmed(false);
        startCountdown(3);
      }
    },
    [startCountdown],
  );

  // Leaving the screen or the app cancels any running timer.
  useFocusEffect(useCallback(() => () => stopTimer(), [stopTimer]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopTimer();
    });
    return () => subscription.remove();
  }, [stopTimer]);

  const onShutter = useCallback(() => {
    if (countdown != null || armed) {
      stopTimer();
      return;
    }
    if (busy) return;
    if (timerMode === 'off') void capture();
    else if (timerMode === 'face') {
      armedRef.current = true;
      faceSince.current = null;
      setArmed(true);
      activateKeepAwakeAsync('camera-timer').catch(() => undefined);
      toast.info('Hands-free: step into frame — the timer starts when a face is detected');
    } else startCountdown(Number(timerMode));
  }, [armed, busy, capture, countdown, startCountdown, stopTimer, timerMode]);

  const handleFocus = useCallback(
    (x: number, y: number) => {
      setFocus((current) => ({ x, y, token: current.token + 1 }));
      engineRef.current?.focusAt(x, y).catch(() => undefined);
    },
    [],
  );

  const pinchStart = useSharedValue(1);
  const minZoom = capabilities.minZoom;
  const maxZoom = capabilities.maxZoom;
  const pinch = usePinchGesture({
    enabled: !overlay.editing,
    onActivate: () => {
      'worklet';
      pinchStart.set(zoom.value);
    },
    onUpdate: (event) => {
      'worklet';
      zoom.set(Math.min(maxZoom, Math.max(minZoom, pinchStart.value * event.scale)));
    },
  });
  const tap = useTapGesture({
    enabled: !overlay.editing,
    maxDuration: 300,
    onActivate: (event) => {
      'worklet';
      scheduleOnRN(handleFocus, event.x, event.y);
    },
  });
  const cameraGestures = useExclusiveGestures(pinch, tap);

  const onCapabilities = useCallback((next: CameraCapabilities) => {
    setCapabilities(next);
    if (zoom.get() < next.minZoom || zoom.get() > next.maxZoom) zoom.set(1);
    exposure.set(0);
  }, [exposure, zoom]);

  const onPreviewStarted = useCallback(() => {
    mark('cameraPreviewStarted');
    logStartupReport();
  }, []);
  const onCameraError = useCallback((message: string) => {
    console.warn('[camera] error', message);
    toast.error('Camera error. Close other camera apps and try again.');
  }, []);

  const flipCamera = useCallback(() => {
    stopTimer();
    setFaces([]);
    zoom.set(1);
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  }, [stopTimer, zoom]);

  const cycleGrid = useCallback(() => {
    const index = GRID_ORDER.indexOf(settings.gridType);
    settings.update({ gridType: GRID_ORDER[(index + 1) % GRID_ORDER.length] as GridType });
  }, [settings]);

  const cameraActive = isFocused && appActive && permission.status === 'granted' && !showSettings;
  const showControls = !cleanMode;

  return (
    <View style={styles.screen}>
      {permission.status === 'granted' ? (
        <View style={[styles.frame, { top: frame.top, width: frame.width, height: frame.height }]}>
          <CameraEngine
            ref={engineRef}
            facing={facing}
            isActive={cameraActive}
            zoom={zoom}
            exposure={exposure}
            torch={flash === 'torch'}
            flash={captureFlash}
            aspect={settings.aspectRatio}
            quality={settings.captureQuality}
            photoHdr={settings.photoHdr}
            faceGuidance={faceGuidanceOn}
            onCapabilities={onCapabilities}
            onPreviewStarted={onPreviewStarted}
            onError={onCameraError}
            onFaces={handleFaces}
          />
          <GestureDetector gesture={cameraGestures}>
            <View style={StyleSheet.absoluteFill}>
              <GridOverlay type={settings.gridType} width={frame.width} height={frame.height} showCenterMark={settings.showCenterMark} />
              {faceGuidanceOn ? <FaceGuides faces={faces} width={frame.width} height={frame.height} /> : null}
              {settings.showLevel ? <LevelIndicator roll={level.roll} visible={level.visible} width={frame.width} /> : null}
              <FocusRing x={focus.x} y={focus.y} token={focus.token} />
            </View>
          </GestureDetector>
          {pose ? (
            <PoseOverlay
              pose={pose}
              width={frame.width}
              height={frame.height}
              opacity={settings.overlayOpacity}
              variant={settings.overlayStyle}
              mirrored={overlay.mirrored}
              editing={overlay.editing}
              resetToken={overlay.resetToken}
            />
          ) : null}
          <HintPill hints={hints} />
          {countdown != null ? (
            <View style={styles.countdown} pointerEvents="none">
              <AppText variant="display" style={styles.countdownText}>
                {countdown}
              </AppText>
            </View>
          ) : null}
          <CaptureFlash ref={flashRef} />
        </View>
      ) : permission.checked ? (
        <PermissionGate
          status={permission.status}
          onRequest={() => void permission.request()}
          onOpenSettings={permission.openSettings}
          onBrowsePoses={() => router.push('/poses')}
        />
      ) : null}

      {showControls ? (
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          {settings.aspectRatio === '16:9' ? (
            <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={StyleSheet.absoluteFill} pointerEvents="none" />
          ) : null}
          <CameraTopBar
            flash={flash}
            flashModes={flashModes}
            timer={timerMode}
            timerModes={timerModes}
            aspect={settings.aspectRatio}
            grid={settings.gridType}
            onFlash={(next) => settings.update({ flash: next })}
            onTimer={(next) => settings.update({ timer: next })}
            onAspect={(next) => settings.update({ aspectRatio: next })}
            onGrid={cycleGrid}
            onCleanMode={() => {
              setCleanMode(true);
              setShowSettings(false);
            }}
            onSettings={() => setShowSettings(true)}
            frontScreenFlash={frontScreenFlash}
          />
        </View>
      ) : null}

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md }]} pointerEvents="box-none">
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
        {showControls && pose ? (
          <OverlayBar
            poseName={pose.name}
            opacity={settings.overlayOpacity}
            editing={overlay.editing}
            mirrored={overlay.mirrored}
            onOpacity={(overlayOpacity) => settings.update({ overlayOpacity })}
            onToggleEditing={() => overlay.setEditing(!overlay.editing)}
            onToggleMirror={overlay.toggleMirrored}
            onReset={overlay.requestReset}
            onRemove={() => overlay.setPose(null)}
          />
        ) : null}
        {showControls && permission.status === 'granted' ? (
          <View style={styles.adjustRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={pose ? `Pose library. Current pose: ${pose.name}` : 'Open the pose library'}
              onPress={() => router.push('/poses')}
              style={styles.posePill}
            >
              <PersonStanding size={16} color={pose ? colors.accent : colors.text} strokeWidth={2} />
              <AppText variant="caption" style={styles.posePillText} numberOfLines={1}>
                {pose ? 'Change' : 'Poses'}
              </AppText>
            </Pressable>
            <ZoomControl zoom={zoom} presets={capabilities.zoomPresets} opticalStops={capabilities.opticalStops} />
            {capabilities.supportsExposure ? (
              <ExposureControl key={facing} exposure={exposure} min={capabilities.minExposure} max={capabilities.maxExposure} />
            ) : (
              <IconButton icon={GraduationCap} label="Composition tips" glass size={38} iconSize={18} onPress={() => router.push('/learn')} />
            )}
          </View>
        ) : null}
        {showControls ? (
          <View style={styles.styleRow}>
            <StyleSelector value={styleId} onChange={setStyleId} />
          </View>
        ) : null}
        <View style={styles.shutterRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={lastPhoto ? 'Open the last photo' : 'Open the gallery'}
            onPress={() => (lastPhoto ? router.push({ pathname: '/review/[photoId]', params: { photoId: lastPhoto.id } }) : router.push('/gallery'))}
            style={styles.thumb}
          >
            {lastPhoto ? (
              <Image
                source={{ uri: lastPhoto.thumbUri ?? lastPhoto.editUri ?? lastPhoto.originalUri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={150}
                recyclingKey={lastPhoto.id}
              />
            ) : null}
          </Pressable>
          <ShutterButton onPress={onShutter} busy={busy} countdown={countdown} armed={armed} />
          {cleanMode ? (
            <IconButton icon={Eye} label="Show camera controls" glass size={52} onPress={() => setCleanMode(false)} />
          ) : (
            <IconButton icon={SwitchCamera} label={facing === 'back' ? 'Switch to front camera' : 'Switch to rear camera'} glass size={52} onPress={flipCamera} />
          )}
        </View>
      </View>

      {showSettings ? (
        <>
          <Pressable style={styles.scrim} onPress={() => setShowSettings(false)} accessibilityLabel="Close camera settings" />
          <QuickSettings capabilities={capabilities} onClose={() => setShowSettings(false)} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.black,
  },
  frame: {
    position: 'absolute',
    left: 0,
    overflow: 'hidden',
    backgroundColor: '#050506',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  adjustRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  posePill: {
    height: 34,
    maxWidth: 110,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.glass,
  },
  posePillText: {
    fontWeight: '600',
  },
  styleRow: {
    height: 30,
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: colors.hairlineStrong,
  },
  countdown: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownText: {
    fontSize: 96,
    lineHeight: 110,
    fontWeight: '200',
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 12,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
  },
});
