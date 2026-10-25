# PoseLens AI — Delivery Report

Date: 2026-10-25 · Build machine: Windows 11, Intel i5-1240P, 7.7 GB RAM · Expo SDK 58 / React Native 0.88

## 1. Summary

A complete Expo/React Native Android camera app was built: a VisionCamera v5 camera with pose
overlays and composition guidance, an on-device GPU image-processing pipeline (Skia SkSL shaders)
with eight adjustable styles, a private local photo library with versioned enhanced copies, and
ten-plus screens with a consistent dark design system. Everything runs offline; the release APK has
no Internet permission.

## 2. Architecture and technology

| Area | Choice |
|---|---|
| App | Expo SDK 58, Expo Router (file-based, `src/app`), TypeScript strict + `noUncheckedIndexedAccess` |
| Camera | VisionCamera 5.2.3 (Nitro) in native builds; expo-camera fallback in Expo Go; one engine contract |
| Face guidance | react-native-vision-camera-face-detector 2.1.0 (ML Kit bundled model, on-device) |
| Processing | @shopify/react-native-skia 2.14: 3-pass tiled GPU pipeline (denoise → USM reference → colour/tone/look), ≤4096 px |
| Interaction | Reanimated 4.7, Gesture Handler 3.3 hooks API, react-native-worklets 0.13 |
| Storage | expo-sqlite (metadata, migrations, kv-store settings), expo-file-system class API (atomic writes), expo-media-library export |
| State | zustand stores; high-frequency values in Reanimated shared values |
| Icons/graphics | lucide-react-native (SVG, no font loading), react-native-svg pose figures generated from a skeletal model |
| Build | Config plugins: ABI splits, offline release manifest, Gradle memory, C++ job pools; `scripts/build-apk.mjs` |

Details: [ARCHITECTURE.md](ARCHITECTURE.md).

## 3. Skills and tools

Installed and verified (project scope): Expo official plugin (24 skills), Margelo VisionCamera v5
skills (2), Callstack `react-native-best-practices` and `react-native-testing` (installed directly
because the Callstack plugins load 0 skills on Windows — git symlinks). All appear in Claude Code's
skill list after a session restart. Full report: [SKILLS_AND_TOOLS.md](SKILLS_AND_TOOLS.md).
