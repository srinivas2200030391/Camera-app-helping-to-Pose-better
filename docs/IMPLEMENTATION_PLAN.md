# Implementation Plan

Ordered so that a buildable, testable app exists early and risk is retired first.

| Phase | Work | Exit criteria |
|---|---|---|
| 0. Environment | Inspect toolchain, install/verify skills, scaffold Expo SDK 58, native deps, config plugins, kick off first native build | `docs/SKILLS_AND_TOOLS.md`; Gradle build running |
| 1. Foundations | Tokens, UI primitives, utils, settings store, SQLite + migrations, file layer with atomic writes, recovery | Unit tests for files/repos/recovery logic pass |
| 2. Processing core | Params model, presets, EXIF parser/injector, scene analysis, SkSL shaders, Skia renderer (preview + tiled full-res), job queue | Unit tests for params/presets/EXIF/analysis pass; renderer type-checks |
| 3. Poses | Skeleton FK model, 36 poses across 15 categories, figure geometry, suggestions; contact-sheet render to review figures | Geometry tests pass; contact sheet reviewed visually |
| 4. Camera | Engine contract, VisionCamera engine, expo-camera fallback, level, face guidance, composition maths, camera screen + controls + overlay gestures | Camera screen type-checks; composition tests pass |
| 5. Screens | Onboarding, pose library/category/detail, review, editor, gallery, photo detail, settings, learn | All routes reachable; typecheck + lint clean |
| 6. Assets & polish | App icon, adaptive icon, splash; accessibility labels; empty/error states | Icons render in launcher |
| 7. Verification | `npm run check`; release APK build; install on emulator; smoke test (launch, permissions, capture, save, gallery, edit, export); measure timings | APK in `artifacts/`; results recorded |
| 8. Docs | `ANDROID_TESTING.md` (exact commands), README, final report | Docs match what was actually run |

## Testing approach
- **Unit (Jest, jest-expo preset):** processing params & presets, EXIF parse/inject round-trip,
  analysis maths on synthetic pixel buffers, composition guidance maths, pose library integrity
  (every pose valid, every category populated, keypoints in frame), figure geometry, storage logic with
  mocked `expo-file-system`/`expo-sqlite` (atomic commit, recovery decisions, low-storage refusal).
- **Static:** `tsc --noEmit` (strict + `noUncheckedIndexedAccess`), `expo lint`.
- **Build:** local Gradle release build via `scripts/build-apk.mjs`; manifest permissions checked with `aapt`.
- **Device/emulator smoke test:** scripted with `adb` (install, launch, grant permission, screenshot, logcat crash scan).
- **Manual (physical phone):** checklist in `ANDROID_TESTING.md` — camera denial, rotation, flash/torch,
  exposure, front/rear, overlay never in photo, kill app during save, low storage, large images.

## Risk register
| Risk | Mitigation |
|---|---|
| VisionCamera v5 / Nitro build issues on Windows | Build started first; fallback engine keeps app usable in Expo Go |
| CameraX version conflict (expo-camera vs VisionCamera) | expo-camera excluded from Android autolinking |
| GPU limits for large images | Tiled rendering, 4096 px processing cap, originals untouched |
| 8 GB build machine runs out of memory | Gradle/Kotlin heap caps, `--max-workers=4`, two ABIs only |
| JS thread blocked during JPEG encode | Step yields, UI-thread progress animation, documented |
| Cannot test on the user's physical phone | Emulator smoke test + diagnostics screen recording real-device timings |
