# Android Testing Guide

Three ways to run PoseLens AI on an Android phone, from quickest to most complete:

| Path | Needs a PC build? | Camera features | Use it for |
|---|---|---|---|
| **A. Install the APK** | No (prebuilt) | Full (VisionCamera, face guidance, exposure, HDR) | Trying the app; real-world testing |
| **B. Development build + Metro** | Yes (once) | Full | Changing code with live reload |
| **C. Expo Go** | No | Basic (expo-camera: no exposure, tap-focus or face guidance) | Quick UI checks only |

Commands below are for **Windows PowerShell** unless marked; the project lives in `D:\AI Camera`.

---

## Prerequisites (for building)

| Tool | Version | Check |
|---|---|---|
| Node.js | 20.19+ (22 LTS recommended) | `node -v` |
| JDK | **17 or newer** (17/21 LTS recommended) | `java -version` |
| Android SDK | platform-tools; the build downloads SDK 37, build-tools 37, NDK 27.1 and CMake | `adb version` |
| Free disk | ~15 GB (Gradle caches + NDK) | |
| RAM | 8 GB works with the settings below | |

Point `JAVA_HOME` at a JDK 17+ **for the current terminal** (this machine has JDK 19 installed; its default `JAVA_HOME` is JDK 11, which the Android Gradle Plugin rejects):

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-19"
```

`ANDROID_HOME` is optional — `scripts/build-apk.mjs` finds `%LOCALAPPDATA%\Android\Sdk` automatically.

---

## A. Build and install the standalone APK

The release APK embeds the JavaScript bundle, so it runs without a PC or network. It is signed with
the Expo template's debug key: fine for side-loading and testing, **not** for the Play Store.

### 1. Build

```powershell
cd "D:\AI Camera"
npm install
$env:JAVA_HOME = "C:\Program Files\Java\jdk-19"
npm run build:apk
```

`npm run build:apk` runs `expo prebuild` (applying `app.config.ts` and the config plugins) and then
`gradlew :app:assembleRelease --max-workers=2`. The first build downloads ~2 GB and compiles a lot of
C++ (Skia, VisionCamera, Reanimated): expect **45–90 minutes** on an 8 GB laptop; later builds are
incremental (a few minutes when only JavaScript changed).

Output (one APK per CPU architecture):

```
artifacts\poselens-arm64-v8a-release.apk   ← almost every phone from the last 7+ years
artifacts\poselens-x86_64-release.apk      ← Android emulators on Intel/AMD PCs
```

### 2. Install on the phone

**Over USB (recommended)**

1. On the phone: *Settings → About phone →* tap *Build number* 7 times; then *Settings → System →
   Developer options →* enable **USB debugging**.
2. Connect the cable, accept the "Allow USB debugging?" prompt.
3. Install:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices                      # the phone must be listed as "device"
& $adb install -r "D:\AI Camera\artifacts\poselens-arm64-v8a-release.apk"
```

**Without a cable:** copy the `.apk` to the phone (Drive, USB storage, e-mail to yourself), open it
in the Files app and allow *Install unknown apps* for that app when prompted.

### 3. First run

- The intro screens ask for camera access. If you refuse twice, Android stops asking — use
  *Open settings* on the camera screen.
- Photos are stored privately in the app. Turn on *Settings → Gallery → Save new photos to the
  gallery* (or use *Save to gallery* on a photo) to export them.
- The release build has **no Internet permission**. Verify with:
  `& $adb shell dumpsys package com.poselens.camera | Select-String "android.permission"`

---

## B. Development build with live reload

Use this when changing code. The debug APK contains the native code; JavaScript is served by Metro
from your PC.

```powershell
cd "D:\AI Camera"
$env:JAVA_HOME = "C:\Program Files\Java\jdk-19"
npm run build:apk:dev-client
& $adb install -r "D:\AI Camera\artifacts\poselens-arm64-v8a-debug.apk"
npm run start:dev-client
```

Then open **PoseLens AI** on the phone:

- **Same Wi-Fi:** the dev launcher lists the running server, or scan the QR code shown by Metro.
- **USB:** forward the Metro port and connect to `http://localhost:8081`:
  `& $adb reverse tcp:8081 tcp:8081`

Alternatively `npx expo run:android` builds, installs and starts Metro in one step (it uses the
same `android/` project; set `JAVA_HOME` first).

### Cloud builds (no local SDK needed)

```bash
npx eas-cli@latest login                                   # free Expo account
npx eas-cli@latest build -p android --profile preview      # standalone APK (like path A)
npx eas-cli@latest build -p android --profile development  # dev client (like path B)
```

EAS prints a download link / QR code when the build finishes. Nothing is uploaded until you run
these commands.

---

## C. Expo Go (quick look, reduced camera)

```powershell
cd "D:\AI Camera"
npm install
npm run start:go
```

Scan the QR code with **Expo Go** (it must support **SDK 58** — update it from the Play Store).
In Expo Go the app automatically uses `expo-camera`: preview, capture, zoom, flash/torch, front/rear
work; exposure compensation, tap-to-focus, photo HDR, lens stops and face guidance are hidden
because they need native modules that Expo Go does not contain. Gallery export may be limited by
Expo Go's Android media permissions.

---

## Automated checks

```powershell
npm run typecheck   # TypeScript (strict, noUncheckedIndexedAccess)
npm run lint        # ESLint (eslint-config-expo, React Compiler rules)
npm test            # Jest: unit + storage integration + Skia shader tests (CanvasKit)
npm run check       # all three
```

Optional visual review of the processing pipeline on your own photos (writes before/after JPEGs for
every style to `artifacts/test-output/`):

```powershell
$env:POSELENS_SAMPLE_DIR = "C:\path\to\some\jpegs"; npx jest -t "visual review"
```

---

## Manual test checklist (physical phone)

Mark each item on your device; the emulator cannot reproduce real camera hardware.

**Permissions & lifecycle**
- [ ] First launch → intro → *Allow camera & start* → preview appears.
- [ ] Deny camera twice → camera screen shows *Open settings*; granting in settings and returning
      restarts the preview without relaunching.
- [ ] Press Home during a 10 s timer → timer cancels; return → camera resumes.
- [ ] Receive a call / open another camera app → return → preview recovers.

**Camera**
- [ ] Front/rear switch; zoom chips show *OPTICAL* only on real lens stops, *DIGITAL* in between.
- [ ] Pinch to zoom, tap to focus (ring appears), exposure slider changes brightness (rear camera).
- [ ] Flash off/auto/on and torch (only offered if the hardware has them); front camera "screen flash".
- [ ] 4:3, 16:9 and 1:1 frames; the saved photo matches the framed area.
- [ ] Grid types, level turns gold when straight (also in landscape orientation), clean mode.
- [ ] Timer 3 s / 10 s; hands-free mode starts the countdown when a face appears.

**Pose overlay**
- [ ] Pick a pose → overlay appears; opacity slider, mirror, move/scale/rotate in edit mode, reset.
- [ ] Take a photo with the overlay visible → **the overlay is not in the saved photo**.

**Photos & processing**
- [ ] Thumbnail appears after capture; review screen shows the enhanced preview; hold to see the original.
- [ ] Change style/strength → *Save enhanced* → progress → detail screen shows *Enhanced*.
- [ ] Compare slider, *Restore original*, version history, delete a copy (original stays).
- [ ] Editor sliders, undo/redo, reset; leaving with changes asks to discard.
- [ ] Gallery filters, multi-select batch enhance / export / delete.
- [ ] *Save to gallery* → photo appears in the phone's Photos app (album "PoseLens AI").
- [ ] Airplane mode on: everything above still works.

**Robustness**
- [ ] Force-stop the app right after pressing the shutter → relaunch → the photo is present
      (re-registered by startup recovery if the save was interrupted).
- [ ] Fill storage to < 50 MB free → capture shows "Not enough free storage…" instead of failing silently.
- [ ] Settings → Diagnostics shows startup and processing timings for your phone.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `JAVA_HOME … is JDK 11` / "Android Gradle plugin requires Java 17" | `$env:JAVA_HOME = "C:\Program Files\Java\jdk-19"` (or any JDK 17+) in the same terminal |
| `LLVM ERROR: out of memory`, Gradle daemon disappeared | Close heavy apps and run `$env:POSELENS_GRADLE_WORKERS = "1"; npm run build:apk`. C++ jobs per module are already capped (`plugins/withNativeBuildParallelism.js`). |
| `EBUSY: resource busy or locked, rmdir …\android` during prebuild | A terminal or Explorer window has `android\` open — close it and retry |
| Path/“Filename longer than 260 characters” errors | Enable Windows long paths (already on here) or move the project to a shorter path |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | A copy signed with another key is installed: `& $adb uninstall com.poselens.camera` (deletes app data) |
| `INSTALL_FAILED_NO_MATCHING_ABIS` | 32-bit phone: add `'armeabi-v7a'` to `BUILD_ARCHS` in `app.config.ts`, rebuild |
| Black preview | Another app holds the camera, or the emulator lacks a camera format — test on a real phone |
| Dev client cannot reach Metro | Same Wi-Fi, or USB + `adb reverse tcp:8081 tcp:8081`; allow Node through Windows Firewall |
| Expo Go says the project is incompatible | Update Expo Go; this project uses SDK 58 |
| Face guidance / exposure missing | Expected in Expo Go; use the APK or dev build |
| Changes to `app.config.ts` or native packages have no effect | Rebuild with `npm run build:apk` (runs prebuild); for a full regeneration `node scripts/build-apk.mjs release --clean` |
