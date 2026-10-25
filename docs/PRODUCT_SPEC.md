# PoseLens AI — Product Specification (MVP)

*Working name; rename in `app.config.ts` (`APP_NAME`).*

## Vision
A photography-first Android camera that helps people without photography training take better
photos: it shows **where to stand and how to pose**, guides **composition** while framing, and
produces **natural-looking enhanced copies** on the device — never uploading photos.

## Target users
- Travellers and casual photographers taking photos of friends/partners.
- Solo creators shooting themselves on a tripod or propped phone.
- Anyone who finds manual "pro" camera controls intimidating but wants better results.

## Principles
1. **The camera is always ready.** Fast start, responsive shutter, no blocking loaders.
2. **Natural over dramatic.** Enhancements stay believable: no plastic skin, halos or fake detail.
3. **Private by default.** All processing on-device. The release APK has no INTERNET permission.
4. **Never lose a photo.** Originals are saved atomically and never modified; edits are copies.
5. **Honest capabilities.** Optical vs digital zoom is labelled; unsupported hardware controls are hidden, not faked.

## MVP scope

### P0 — must ship
| Area | Feature |
|---|---|
| Onboarding | 3-step intro, camera permission request with denial/recovery path, privacy statement |
| Camera | Full-screen preview, capture, front/rear switch, zoom (pinch + lens chips, optical/digital label), flash off/auto/on + torch where supported, exposure compensation where supported, aspect ratio 4:3 / 16:9 / 1:1, timer 3 s / 10 s, tap-to-focus, clean mode |
| Composition | Grid (thirds, golden, centre cross, diagonals), live level/horizon indicator, centre guide |
| Pose assistant | Library with 15 categories, pose detail, live overlay with opacity, move/scale/rotate, mirror, lock; overlay never captured |
| Storage | Originals in app storage (atomic write), SQLite metadata, recovery of interrupted saves |
| Processing | Natural default profile + 8 styles, adjustable strength and per-stage sliders, GPU pipeline at full resolution, enhanced copy saved separately |
| Review & compare | Post-capture review, before/after split slider, undo, restore original, save enhanced copy |
| Gallery | Grid of local photos, detail view, metadata/resolution, favourite, delete (confirmed), export to device gallery |
| Settings | Grid/level/overlay defaults, capture quality, processing defaults, export quality, storage info, diagnostics (measured timings) |

### P1 — ship if time allows (included in this build where marked ✅)
- ✅ Face-position & headroom guidance (ML Kit, native build only)
- ✅ Hands-free timer: countdown starts automatically when a face is detected
- ✅ Pose favourites, recently used poses, suggested poses for current orientation
- ✅ Composition tutorial screen
- ✅ Front-camera "screen flash"
- ✅ Batch enhancement of selected gallery photos (sequential, cancellable)
- Albums (deferred — favourites cover the MVP need)

### Future (not in MVP — explicitly not implemented)
- Live style preview on the camera feed (needs a GPU frame renderer — VisionCamera Skia preview).
- Body-pose matching score (MoveNet/BlazePose via TFLite frame processor).
- Multi-frame HDR / night stacking, burst selection, RAW (DNG) capture and editing.
- On-device super-resolution model; optional cloud processing (would require explicit consent UI).
- Accounts, sync, shared pose libraries (needs a backend — see `ARCHITECTURE.md` §9).

## Pose library content
15 categories: Outdoor, Indoor, Beach, Temple & cultural, Travel, Portrait, Full-body, Couple, Group,
Sitting, Standing, Walking, Fashion, Social media, Low light. Each pose carries: name, categories,
original vector illustration (generated from a skeletal model, no third-party images), short
instructions, camera distance, framing, orientation, difficulty, composition tip, camera height,
and optional hand/body hints.

## Image processing stages (all individually adjustable)
1. White balance (auto grey-world estimate + temperature/tint)
2. Exposure & contrast (auto levels from histogram)
3. Highlight & shadow recovery (luminance-masked, local base layer)
4. Vibrance & saturation with skin-tone protection
5. Noise reduction (edge-aware, separate luma/chroma)
6. Detail (thresholded unsharp mask, reduced on skin)
7. Local contrast / dehaze (low-frequency base layer)
8. Style look (tone curve, split toning, monochrome mix, vignette)
9. Output: sRGB JPEG, quality setting, EXIF copied from original with orientation normalised

"Auto" is **statistical scene analysis** (histogram, grey-world, saturation statistics, ISO from
EXIF) — not a neural network. The UI calls it "Smart Natural", not "AI".

## Success metrics (targets; measured values in the final report)
| Metric | Target |
|---|---|
| App shell visible (JS start → first screen) | < 2 s on a mid-range phone |
| Camera preview started after launch | measured separately (device dependent) |
| Shutter → thumbnail visible | < 1 s |
| Full-res (12 MP) enhanced copy | < 4 s on a mid-range phone, UI stays interactive |
| Crash-free capture/save | no photo lost on app kill during save |

## Non-goals
Video recording, social sharing feeds, beauty filters / face reshaping, cloud AI by default.
