# UI / UX Design

## 1. Direction
A dark, quiet, photography-first interface: the image is the brightest thing on screen. Controls
are restrained translucent "glass" surfaces with hairline borders (no real-time blur over the live
feed — it costs GPU time on every frame). One warm accent colour marks active state. Depth comes from
layering, soft shadows and subtle 3D tilt on cards — never from heavy effects.

## 2. Design tokens (`src/theme/tokens.ts`)
| Token | Value | Use |
|---|---|---|
| `bg` | `#0A0A0C` | app background |
| `surface` | `#141418` | sheets, cards |
| `surfaceRaised` | `#1C1C22` | pressed/raised cards |
| `glass` | `rgba(16,16,20,0.62)` | camera control backgrounds |
| `hairline` | `rgba(255,255,255,0.10)` | borders |
| `text` / `textSecondary` / `textTertiary` | `#F5F5F7` / `rgba(235,235,245,0.64)` / `rgba(235,235,245,0.38)` | |
| `accent` | `#FFC861` (warm gold) | active states, shutter ring, aligned level |
| `success` / `warning` / `danger` | `#4ADE80` / `#FBBF24` / `#F87171` | status |
| spacing | 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 | |
| radii | 8 · 12 · 16 · 22 · pill | |
| type | 11 caps label · 13 caption · 15 body · 17 title · 22 headline · 30 display | system font (Roboto) — no font download at startup |
| motion | 120 ms (press) · 220 ms (panels) · spring (damping 18, stiffness 220) | |

Accessibility: text ≥ 4.5:1 contrast on `bg`/`glass`; touch targets ≥ 44 dp; every icon button has an
`accessibilityLabel`; motion respects the OS "reduce motion" setting (`useReducedMotion`).

## 3. Main camera screen (portrait)

```
┌──────────────────────────────────────────┐
│ status bar (edge-to-edge, translucent)    │
│ [⚡] [⏱] [4:3] [#] [◐]              [⚙] │ top bar · glass pill · 44 dp icons
│ ┌──────────────────────────────────────┐ │
│ │ ░ Move back · Raise the camera      ░ │ │ composition hint pill (fades, max 1 line)
│ │                                      │ │
│ │        grid  ·  pose overlay         │ │ preview framed to aspect (4:3/16:9/1:1);
│ │   ────── level line (gold = level) ──│ │ outside-frame area dimmed
│ │                                      │ │
│ │          face box (subtle)           │ │
│ └──────────────────────────────────────┘ │
│   [pose: "Leaning wall" ⌄] [◑ 45%] [✥]  │ overlay bar (only when a pose is active)
│        ·5   [1×]   2   5     EV ±0.0     │ zoom stops + exposure chip
│  NATURAL  WARM  COOL  PORTRAIT  CINEMA…  │ style selector (scroll, snaps)
│  [thumb]        (  ◯  )         [⟲]      │ thumbnail · shutter 76 dp · flip
│  [Poses]                          [Help] │ pose library shortcut · tutorial
└──────────────────────────────────────────┘
```

Interaction model:
- **Tap preview** → focus + metering at point (focus ring animates); **pinch** → zoom.
- **Overlay edit mode** (✥ toggle): pan / pinch / rotate gestures move the pose overlay instead of the
  camera. Leaving edit mode locks the overlay. This keeps "guide" controls separate from "photo" controls.
- **Zoom chips** show the device's optical lens stops (e.g. ·5, 1×, 2×, 5×). Any value between stops
  shows "digital" next to the factor.
- **EV chip** expands to a tick-mark slider (−2 … +2 within device limits); double-tap resets.
- **Flash** cycles off → auto → on → torch (only states the hardware supports are offered).
- **Timer** cycles off → 3 s → 10 s → hands-free (native build: countdown starts when a face is detected).
- **Clean mode** (◐) hides everything except the shutter and a small "show controls" button.
- **Shutter**: press-in scale + haptic; capture freezes the shutter ring briefly; thumbnail flies in.
- Styles are applied **after capture** (labelled "applies after capture"); live preview of styles is a
  documented future enhancement.

## 4. Screen flow
```
Onboarding (first run) ─► Camera ◄───────────────────────────┐
                           │  ├─► Poses library ─► Category ─► Pose detail ─► "Use pose" ─┘
                           │  ├─► Review (after capture / thumbnail) ─► Editor ─► Save copy
                           │  ├─► Gallery ─► Photo detail (compare, info, export, delete) ─► Editor
                           │  ├─► Settings ─► Diagnostics
                           │  └─► Learn (composition tutorial)
```

| # | Screen | Key elements |
|---|---|---|
| 1 | Onboarding | 3 swipeable cards with layered parallax figure illustration; permission step; privacy promise |
| 2 | Camera | as above |
| 3 | Pose library | search, "Suggested for portrait", favourites row, recents row, category grid with tilt cards |
| 4 | Category browser | 2-column pose cards (figure illustration, name, difficulty dots, distance) |
| 5 | Pose detail | large illustration on a framing guide, instructions, distance/framing/orientation chips, hints, favourite, "Use pose" |
| 6 | Review | full image, before/after toggle, quick style strip, Keep / Edit / Delete |
| 7 | Editor | live preview with split compare, style strip + strength, stage sliders grouped (Light · Colour · Detail · Look), undo/redo, reset, save copy with progress + cancel |
| 8 | Gallery | 3-column grid, filter (All · Favourites · Edited), multi-select → batch enhance / export / delete |
| 9 | Photo detail | swipe between original/edited versions, compare slider, info panel (resolution, size, camera data), favourite, export, restore original, delete |
| 10 | Settings | camera, composition, processing, export, storage usage, diagnostics, privacy/about |
| + | Learn | short composition lessons with illustrated diagrams |

## 5. Pose illustrations
Original vector figures generated from a skeletal model (`poses/skeleton.ts`): proportional limbs with
rounded joints, soft head, subtle depth (far limbs drawn slightly darker). On camera they render as a
ghost silhouette (white 30 % fill + crisp outline) or outline-only, with adjustable opacity. Multi-person
poses tint each person slightly differently so couples/groups are readable.

## 6. Motion & "3D"
- Pose and category cards: press tilts the card toward the finger (rotateX/rotateY ≤ 6°) with a moving
  highlight — Reanimated on the UI thread, no 3D engine.
- Onboarding: three layers (grid, figure, frame) move at different rates while swiping (parallax).
- Panels slide/fade 220 ms; the level line eases colour from white → gold at |angle| < 1°.

## 7. Copy guidelines
Short, direct, encouraging. Hints are imperative and specific ("Step back a little", "Tilt phone
level"). Errors say what happened and what to do ("Not enough storage to save. Free up 50 MB and try
again."). Never claim AI capabilities the app does not have.
