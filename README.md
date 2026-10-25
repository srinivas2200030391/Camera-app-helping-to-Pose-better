# PoseLens AI

An Android camera that shows **how to pose**, helps **frame the shot**, and makes **natural-looking
enhanced copies** of your photos — entirely on the phone. Built with Expo SDK 58 / React Native 0.88.

> Working name — change it in `app.config.ts` (`APP_NAME`, `ANDROID_PACKAGE`).

## Features

- **Camera** (VisionCamera v5): front/rear, pinch + lens-stop zoom with honest optical/digital labels,
  flash/auto/torch, exposure compensation, tap-to-focus, photo HDR where supported, 4:3 / 16:9 / 1:1,
  3 s / 10 s timer and a hands-free timer that starts when a face is detected, clean mode.
- **Composition**: thirds, golden, centre and diagonal grids, a live level that also works sideways,
  and face-based hints for headroom, distance and placement (Google ML Kit, on-device).
- **Pose assistant**: 38 original poses in 15 categories (outdoor, temple, couple, group, low light…),
  each with steps, distance, framing, camera height and lens advice; a movable, scalable, rotatable,
  mirrorable overlay that never ends up in the photo; favourites, recents and suggestions.
- **Processing** (Skia GPU shaders): scene analysis (“Smart Natural”) plus eight adjustable styles,
  white balance, exposure, highlight/shadow recovery, skin-protected vibrance, edge-aware noise
  reduction, thresholded sharpening, local contrast/dehaze, split toning and B&W. Before/after
  comparison, undo/redo, strength, full-resolution tiled export with EXIF preserved.
- **Library**: originals saved atomically and never modified, enhanced copies as versions, restore
  original, favourites, batch enhance/export/delete, startup recovery of interrupted saves.
- **Private**: no account, no cloud; the release APK has no Internet permission.

## Quick start

```powershell
npm install
npm run start:go            # Expo Go: UI + basic camera (see docs for limits)
```

Full camera features need the native build — see **[docs/ANDROID_TESTING.md](docs/ANDROID_TESTING.md)**:

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-19"   # any JDK 17+
npm run build:apk                                  # → artifacts\poselens-arm64-v8a-release.apk
```

## Scripts

| Command | What it does |
|---|---|
| `npm run start:go` / `start:dev-client` | Metro for Expo Go / for the development build |
| `npm run build:apk` | Prebuild + standalone release APK into `artifacts/` |
| `npm run build:apk:dev-client` | Development-client APK (live reload via Metro) |
| `npm run check` | Type-check, lint and all tests |

## Documentation

- [Product spec](docs/PRODUCT_SPEC.md) · [Architecture](docs/ARCHITECTURE.md) · [UI/UX design](docs/UI_UX_DESIGN.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md) · [Skills & tools](docs/SKILLS_AND_TOOLS.md) · [Android testing](docs/ANDROID_TESTING.md)

## Project layout

```
src/app/         screens (Expo Router)
src/camera/      camera engines (VisionCamera / expo-camera), level, composition hints
src/processing/  parameters, presets, EXIF, scene analysis, SkSL shaders, renderer, job queue
src/poses/       skeletal pose model, 38-pose library, figure geometry, suggestions
src/storage/     SQLite repositories, atomic file storage, recovery, gallery export
src/components/  design system (ui/), camera, pose and photo components
plugins/         Expo config plugins (ABI splits, offline release manifest, build memory limits)
```
