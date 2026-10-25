# Architecture

## 1. Overview

```
┌──────────────────────────── UI (src/app, src/components) ────────────────────────────┐
│ Expo Router screens · design-system components · Reanimated/RNGH interactions         │
└───────────────┬──────────────────────┬──────────────────────┬────────────────────────┘
                │                      │                      │
        ┌───────▼───────┐     ┌────────▼────────┐    ┌────────▼────────┐
        │ camera/       │     │ processing/     │    │ poses/          │
        │ engine facade │     │ params, presets │    │ skeleton model  │
        │ VisionCamera  │     │ analysis, EXIF  │    │ library, figure │
        │ | expo-camera │     │ Skia renderer   │    │ suggestions     │
        └───────┬───────┘     │ job queue       │    └─────────────────┘
                │             └────────┬────────┘
        ┌───────▼──────────────────────▼───────────────────────┐
        │ storage/  files (atomic writes) · SQLite repos ·      │
        │           recovery · gallery export                   │
        └──────────────────────────┬────────────────────────────┘
                                   │
        state/ (zustand): settings (kv-store persisted), camera UI, overlay, data version
```

Rules: screens never call native camera/Skia/SQLite APIs directly — they go through `camera/`,
`processing/` and `storage/`. Pure logic (params, presets, EXIF, composition, pose geometry,
analysis maths) has no React Native imports and is unit-tested in Node.

## 2. Directory layout

```
src/
  app/            Expo Router routes (screens only)
  components/     ui/ (design system) · camera/ · pose/ · photo/
  camera/         engine interface, VisionCamera + expo-camera engines, level, face guidance, composition maths
  poses/          types, categories, skeleton (forward kinematics), library data, figure geometry, suggestions
  processing/     params, presets, analysis, shaders (SkSL), renderer (Skia), exif, jobs
  storage/        db + migrations, files, photos/poses repos, recovery, export
  state/          zustand stores
  theme/          design tokens
  utils/          ids, formatting, perf marks, haptics, platform detection
plugins/          Expo config plugins (ABI splits, offline release manifest, Gradle memory)
scripts/          build-apk.mjs
```

## 3. Camera architecture

`camera/types.ts` defines a small engine contract used by the camera screen:

- `CameraCapabilities` — `hasFlash`, `hasTorch`, `supportsExposure` (+ min/max EV),
  `minZoom`/`maxZoom`, `opticalZoomStops`, `supportsFocus`, `supportsPhotoHdr`, `supportsFaceGuidance`.
- `CameraEngineHandle` — `capture(options) → CapturedPhoto` (file URI + metadata), `focusAt(x, y)`.
- `CameraEngineProps` — facing, zoom/exposure (Reanimated shared values), torch, flash, aspect, active.

Two implementations, chosen once at startup (`camera/engine.ts`):

| | VisionCamera engine (dev/release build) | expo-camera engine (Expo Go) |
|---|---|---|
| Exposure compensation | ✅ `exposure` shared value, gated by `supportsExposureBias` | ❌ hidden |
| Zoom | ✅ shared value, lens switch factors → optical stops | ✅ 0–1 linear, labelled digital |
| Flash / torch | ✅ per-capture `flashMode`, `torchMode` | ✅ `flash`, `enableTorch` |
| Tap to focus | ✅ `focusTo` | ❌ (Android) |
| Photo HDR | ✅ constraint when `supportsPhotoHDR` | ❌ |
| Face guidance | ✅ ML Kit output | ❌ |

The engine module for the other environment is never `require`d, so Expo Go never touches Nitro
modules and the native build never touches `expo-camera` (which is excluded from Android autolinking
to avoid a CameraX version conflict).

**Session lifecycle:** the `<Camera>` stays mounted; `isActive` follows screen focus and app state
(VisionCamera v5 guidance). Device switch (front/rear) reconfigures once; zoom/exposure changes go
through shared values without React re-renders.

**Capture flow**
```
shutter / timer / hands-free trigger
  → capture lock (no duplicate captures)
  → engine.capture()               VisionCamera: photoOutput.capturePhotoToFile() (temp JPEG)
  → files.commitOriginal(tmp)      move tmp → photos/originals/<id>.jpg (same-volume rename = atomic)
  → photosRepo.insert(status=ready)
  → thumbnail job (expo-image-manipulator, async native) → photosRepo.update(thumb)
  → UI: thumbnail animates in; camera stays live
```
The pose overlay, grid and hints are React views drawn above the preview. Captures come from the
camera pipeline (sensor → ISP → JPEG), never from a screenshot, so overlays cannot appear in photos.

## 4. Image processing pipeline

All default processing is on-device and offline (`processing/`).

```
original.jpg ──decode (Skia; applies EXIF orientation)──► upright SkImage (lazy)
      │                                   │
      │ EXIF (exif.ts): orientation, ISO, │
      │ exposure, lens, make/model        │
      ▼                                   ▼
 analysis.ts ◄── 96×72 thumbnail readback ─┤          (histogram, grey-world, saturation, clipping)
      │ auto params                        │
      ▼                                    ▼
 params = merge(auto, style preset × strength, user overrides)
                                           │
              base layer (≤512 px, blurred luma + dark channel) for local tone / dehaze
                                           │
      ┌──────────── per tile (≤2048 px + padding, display orientation) ───────────┐
      │ P0 draw oriented/scaled source region                                      │
      │ P1 edge-aware denoise (luma/chroma) — SkSL                                 │
      │ P2 small Gaussian (unsharp-mask reference) — Skia blur filter              │
      │ P3 colour + tone + local contrast + sharpen + style — SkSL                 │
      │ draw tile centre into CPU raster surface                                   │
      └────────────────────────────────────────────────────────────────────────────┘
                                           │
                 encode JPEG (quality setting) → inject original EXIF (orientation=1)
                                           │
                 tmp file → atomic move → photos/edits/<id>_<ts>.jpg → DB edit row
```

- **Preview path** uses the identical pipeline on a ≤1440 px proxy, re-rendered per slider change
  (throttled to animation frames), so the preview matches the saved result (WYSIWYG).
- **Orientation:** Skia's deferred decoder already applies the EXIF origin, so decoded pixels are
  upright (verified on CanvasKit; native RN Skia calls the same `SkImages::DeferredFromEncodedData`).
  The renderer therefore never rotates again; output EXIF is written with Orientation = 1.
- **"Natural" means close to the capture.** Scene analysis only nudges: white balance is a gentle,
  confidence-weighted correction that backs off on colourful scenes and strong (often intentional)
  casts; exposure has a wide dead zone (only clearly dark frames with headroom are brightened, only
  frames with blown highlights are darkened); blown whites stay white through colour and exposure
  changes; vibrance skips near-greys so it cannot amplify a residual cast. These rules came from
  reviewing renders of real photographs, where a stronger first version visibly flattened images.
- **Limits:** processing resolution is capped at 4096 px on the long side (covers the 12 MP default
  capture). Larger originals are kept untouched; their enhanced copies are downscaled to 4096 px.
- **Responsiveness:** heavy steps are separated by `await` yields so progress UI (driven on the UI
  thread) keeps animating; cancellation is checked between steps; temporary files are removed on
  cancel or failure. JPEG encoding of a 12 MP image is the longest single JS-thread step (~0.3–1 s).
- **Job queue (`jobs.ts`)**: one job at a time, de-duplicated by `photoId + paramsHash`, progress per
  stage, cancellable, survives screen changes. Jobs are not resumed after the app is killed — the
  original is safe and the user can re-run the edit (documented limitation; Android does not
  guarantee background execution).

## 5. Storage

**Files** (`Paths.document`, app-private, removed on uninstall):
```
photos/originals/<id>.jpg     never modified after commit
photos/edits/<id>_<ts>.jpg    enhanced copies (one per saved edit)
photos/thumbs/<id>_<ts>.jpg   480 px thumbnails (re-creatable; new name per refresh so image caches never show a stale thumbnail)
photos/tmp/                    in-flight writes; cleaned on startup
cache/previews/                reserved for preview caching (editor proxies currently live in memory)
```

**SQLite (`poselens.db`, `PRAGMA user_version` migrations)**
```sql
photos(id TEXT PK, created_at, original_uri, thumb_uri, width, height, file_size,
       facing, zoom, exposure_bias, flash, aspect, pose_id, style_id,
       current_edit_id, is_favorite, exported_at, status)
edits(id TEXT PK, photo_id → photos, created_at, uri, params_json, style_id, width, height, file_size)
pose_favorites(pose_id PK, created_at)
pose_recents(pose_id PK, used_at)
```
Settings use `expo-sqlite/kv-store` (synchronous reads at startup → no async flash of defaults).

**Integrity & recovery (`recovery.ts`, runs after first frame):**
- Delete orphaned `tmp/` files.
- Originals on disk without a DB row → re-registered as recovered photos (never silently dropped).
- DB rows whose original is missing → marked `missing` and shown with a warning (user decides).
- Missing thumbnails → regenerated lazily.

**Deletion** always asks for confirmation and removes the DB row first, then files.
**Low storage:** captures and saves check `Paths.availableDiskSpace` (refuse below 50 MB with a clear message).

## 6. State management
- `settings` store: persisted to kv-store, hydrated synchronously.
- `camera` store: facing, flash, timer, aspect, grid, clean mode (session UI state; selected values persisted).
- `overlay` store: selected pose, opacity, transform, mirrored, locked.
- `library` store: data version counter — repositories bump it after writes; list screens re-query.
- High-frequency values (zoom, exposure, overlay transform, level angle) live in Reanimated shared
  values, not React state, to avoid re-rendering the camera screen.

## 7. Permissions
| Permission | When requested | Denial handling |
|---|---|---|
| CAMERA | Onboarding / camera screen | Explanation card + "Open settings" when permanently denied |
| Photos (write) | First export to gallery | Export disabled with explanation; photos remain in app |
| VIBRATE | Install time (normal) | — |

Blocked via manifest: RECORD_AUDIO, location, ACTIVITY_RECOGNITION, READ_MEDIA_VIDEO/AUDIO.
Release builds additionally remove INTERNET, ACCESS_NETWORK_STATE, ACCESS_WIFI_STATE and
SYSTEM_ALERT_WINDOW (`plugins/withReleaseOfflineManifest.js`).

## 8. Performance strategy
- Initial route renders the camera immediately; pose data, gallery queries and recovery run after first frame.
- Pose thumbnails are vector (react-native-svg) and rendered only inside virtualised lists.
- Camera screen re-renders only on discrete state changes; continuous values use shared values.
- Thumbnails/proxies are downscaled copies; originals are never downscaled.
- `utils/perf.ts` records marks (JS start, first render, preview started, capture timings, processing
  stage timings); Settings → Diagnostics shows the measurements from the user's own device.

## 9. Expo compatibility matrix
| Feature | Expo Go | Dev build / release APK |
|---|---|---|
| UI, poses, overlay, grid, level, gallery, settings | ✅ | ✅ |
| Camera preview + capture | ✅ basic (expo-camera) | ✅ full (VisionCamera) |
| Exposure comp., tap-focus, photo HDR, lens stops | ❌ | ✅ |
| Face guidance / hands-free trigger | ❌ | ✅ |
| Skia processing pipeline | ✅ | ✅ |
| Export to gallery | ⚠️ limited on Android | ✅ |
| Offline (no INTERNET permission) | ❌ (Expo Go) | ✅ release only |

## 10. Future backend (not built)
The app is local-first; a backend becomes useful only for accounts/sync, shared pose libraries or
opt-in cloud processing. Seams prepared for that:
- Repositories (`storage/*Repo.ts`) are the only DB access points → add a sync adapter behind them.
- Photos have stable UUIDs and `created_at`; edits are immutable rows → straightforward to sync.
- Pose library is data, not code paths → can be fetched from a server and cached.
- Any cloud processing must be a separate, explicitly consented job type; the release build would need
  the INTERNET permission restored deliberately.
