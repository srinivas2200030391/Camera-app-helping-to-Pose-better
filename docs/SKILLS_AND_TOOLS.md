# Skills and Tools Report

Snapshot of the development environment for PoseLens AI, taken 2026-10-25 on the build machine
(Windows 11, Intel i5-1240P, 7.7 GB RAM). Every "verified" entry below was checked with a command;
nothing is listed as installed unless the install command succeeded and a follow-up check confirmed it.

## 1. Claude Code skills and plugins

### Newly installed for this project (project scope, recorded in `.claude/settings.json`)

| Skill / plugin | Purpose for this app | Status | Installation method | Verification |
|---|---|---|---|---|
| `expo@anthropic-plugin-directory` (Expo official, v1.12.5) — 24 skills incl. `expo-router`, `expo-dev-client`, `expo-animation`, `expo-design-system`, `expo-native-ui`, `expo-module`, `expo-upgrade`, `eas-*` | Expo SDK 58 APIs, routing, dev builds, animation, design tokens, native modules | Required | `claude plugin install expo@anthropic-plugin-directory --scope project` (bundled CLI 2.1.310) | `claude plugin list` → enabled; `claude plugin details` lists 24 skills, 1 MCP server, 2 hooks |
| `building-react-native-apps@callstack-agent-skills` (Callstack, v0.2.0) — `react-native-best-practices`, `react-navigation`, `upgrading-react-native`, … | RN performance profiling and optimisation guidance | Optional (recommended) | `claude plugin marketplace add callstackincubator/agent-skills --scope project` then `claude plugin install … --scope project` | Enabled, but **0 skills load on Windows** (symlinks, see below) → `react-native-best-practices` installed directly into `.claude/skills/`, validated |
| `testing-react-native-apps@callstack-agent-skills` (Callstack, v0.2.0) — `react-native-testing`, `agent-device`, `dogfood`, `github-actions` | Test authoring, device automation, QA flows | Optional | same marketplace, `--scope project` | Same symlink issue → `react-native-testing` installed directly into `.claude/skills/`, validated |
| `react-native-vision-camera` + `react-native-vision-camera-realtime` (Margelo — the VisionCamera authors) | VisionCamera **v5** API (a full rewrite: outputs, constraints, in-memory `Photo`) | Required | Copied from `github.com/margelo/react-native-skills` (commit pinned in `.claude/skills/MARGELO_SOURCE_COMMIT.txt`) into `.claude/skills/`. The repo's documented installer is `npx skills add margelo/react-native-skills`; copying the folders is the equivalent manual install and avoids running a third-party installer. | `claude plugin validate .claude/skills` → "Validation passed" |

Safety review performed before installing:
- All four sources are first-party maintainers (Expo, Callstack, Margelo) and were cloned and read before install.
- The Expo plugin ships two helper scripts (`eas-workflows/scripts/fetch.js`, `expo-ui/scripts/list-components.js`) — both read-only (cached HTTP GET / reading `node_modules`).
- The Expo plugin registers two hooks (`PostToolUse`, `UserPromptExpansion`) that run `skill-event.cjs`. That script is **opt-in telemetry and exits immediately unless telemetry is explicitly enabled** (`if (!telemetryActive()) return 0`). No data is sent by default.
- The Expo plugin also declares the hosted Expo MCP server (`https://mcp.expo.dev/mcp`); it needs an Expo account login and is unused by this project.
- License note: Expo and Callstack skills are MIT. The Margelo repository has no LICENSE file; the copies are for local use as the authors intend. Do not redistribute `.claude/skills/react-native-vision-camera*` publicly without checking with Margelo.

Newly installed skills load in the **next** Claude Code session. During the first session their content was read directly from the cloned sources and applied (VisionCamera v5 quickstart, capture-and-controls, outputs-and-constraints; Expo AGENTS guidance).

**Verification after a session restart:** the Expo skills (`expo:*`, 24) and both Margelo VisionCamera skills appeared in Claude Code's skill list. The two Callstack plugins showed as *enabled* but `claude plugin details` reported **0 skills**: the Callstack repository links its skills with git symlinks, and Windows checkouts (`core.symlinks=false`) turn them into one-line text files. Workaround applied: `react-native-best-practices` and `react-native-testing` were copied from the marketplace clone into `.claude/skills/` (Markdown only; MIT; source commit in `.claude/skills/CALLSTACK_SOURCE_COMMIT.txt`) and pass `claude plugin validate .claude/skills`. On macOS/Linux, or with `git config --global core.symlinks true` plus Windows Developer Mode, the plugins work as published.

### Already available (synced from claude.ai) and relevant

| Skill | Use in this project |
|---|---|
| `engineering:architecture`, `engineering:system-design` | Architecture decisions in `ARCHITECTURE.md` |
| `engineering:testing-strategy`, `engineering:debug`, `engineering:code-review` | Test plan, build debugging, review |
| `design:design-system`, `design:ux-copy`, `design:accessibility-review` | Tokens, microcopy, contrast and touch-target checks |
| `anthropic-skills:norman-ui-design` | Usability heuristics for the camera UI |
| `engineering:documentation` | Docs in `docs/` |

### Evaluated and not installed
- `react-native-mmkv`, `react-native-nitro-fetch`, `build-nitro-modules` (Margelo): not needed — settings use `expo-sqlite/kv-store`, no networking, no custom Nitro module yet.
- `migrating-to-react-native` (Callstack): not applicable (greenfield app).
- Claude Code has no marketplace skill for Skia or computational photography; the processing pipeline was designed from first principles and Skia's type definitions.

## 2. Development toolchain

| Tool | Found | Required | Notes |
|---|---|---|---|
| Node.js | v23.7.0 | ≥ 20.19 | Works; Node 23 is not an LTS line — prefer Node 22 LTS for long-term use. npm 10.9.2. |
| Expo CLI | `npx expo` (SDK 58, `@expo/cli` 58.1.x) | yes | No global install needed. |
| Expo SDK | 58.0.19 | — | React Native 0.88.0, React 19.3.0, TypeScript 6.0. |
| EAS CLI | not installed | optional | `npx eas-cli@latest` on demand; needs an Expo account. |
| Git | 2.43.0 | yes | Repository initialised (nothing committed). |
| JDK | JDK 19 (on PATH), JDK 11 (JAVA_HOME), JDK 8 | JDK 17+ | **`JAVA_HOME` points to JDK 11, which AGP 9 rejects.** Builds run with `JAVA_HOME=C:\Program Files\Java\jdk-19`. Installing JDK 17 or 21 LTS is recommended. |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk` | yes | platform-tools (adb), emulator, platforms 33/34, build-tools 30–34, x86_64 images 33/34. `ANDROID_HOME` not set — `scripts/build-apk.mjs` finds the SDK automatically. |
| SDK components for RN 0.88 | not present | yes | compileSdk 37, build-tools 37.0.0, NDK 27.1.12297006, CMake — downloaded automatically by the Android Gradle Plugin (license hashes present). |
| Gradle / AGP | wrapper 9.4.1 / AGP 9.2.1 | yes | Downloaded by the wrapper. |
| Emulator acceleration | WHPX available | optional | `emulator -accel-check` reports WHPX usable. |
| Long paths | `LongPathsEnabled=1` | recommended | Avoids the 260-char limit in CMake/ninja builds. |
| Python 3.12 + Pillow 10.4, Chrome | present | optional | Used for icon generation and rendering pose contact sheets. |
| expo-doctor | 1.18.19 via `npx` | recommended | `npx expo-doctor` → **18/18 checks passed**. |

## 3. Libraries chosen (and why)

| Capability | Choice | Expo Go? | Rationale |
|---|---|---|---|
| Camera (full) | `react-native-vision-camera` 5.2.3 + `react-native-nitro-modules` 0.37.1 + `react-native-nitro-image` 0.15.2 | No (dev build) | Exposure bias, lens-switch zoom factors, flash/torch capability flags, photo HDR constraint, quality prioritisation, tap-to-focus. |
| Camera (fallback) | `expo-camera` 58 | Yes | Used only inside Expo Go. **Excluded from Android native builds** (`expo.autolinking.android.exclude`) because it pins CameraX 1.6.0 while VisionCamera pins 1.7.0-alpha03. |
| Face position guidance | `react-native-vision-camera-face-detector` 2.1.0 (Google ML Kit, bundled model) | No | Native camera output; runs on-device, no network. |
| Image processing | `@shopify/react-native-skia` 2.14.0 (GPU SkSL shaders) | Yes | Full-resolution offscreen rendering, JPEG encoding. |
| Gestures / animation | `react-native-gesture-handler` 3.3 (hooks API), `react-native-reanimated` 4.7.1, `react-native-worklets` 0.13 | Yes | UI-thread overlay transforms and sliders. |
| Storage | `expo-sqlite` (metadata + kv-store settings), `expo-file-system` (class API) | Yes | Local-first. |
| Gallery export | `expo-media-library` (`Asset.create`) | Partial | Android Expo Go has restricted media access; fully works in dev/release builds. |
| Level / horizon | `expo-sensors` (Accelerometer) | Yes | |

## 4. Alternatives if a tool is unavailable

- **No local Android SDK/JDK**: use EAS cloud builds — `npx eas-cli@latest login`, then `npx eas-cli@latest build -p android --profile preview` (APK) or `--profile development` (dev client). Requires a free Expo account; nothing is uploaded until you run it.
- **No emulator acceleration**: test on a physical phone via USB (`adb install`) — see `ANDROID_TESTING.md`.
- **Skills not loaded in a new session**: re-run `claude plugin list` in the project folder; project-scoped plugins load only when Claude Code is opened in `D:\AI Camera`.
