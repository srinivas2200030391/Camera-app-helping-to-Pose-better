/**
 * Style presets. Each is a set of parameter deltas applied on top of the scene-analysis
 * ("auto") corrections and scaled by the user's strength slider. Values are deliberately
 * restrained: the goal is a believable photo, not an effect.
 */
import type { ParamDeltas } from './params';

export type StyleId = 'natural' | 'warm' | 'cool' | 'portrait' | 'landscape' | 'cinematic' | 'lowlight' | 'mono';

export interface StyleDefinition {
  id: StyleId;
  name: string;
  description: string;
  deltas: ParamDeltas;
  shadowHue?: number;
  highlightHue?: number;
  /** Swatch colours for the style chip (purely cosmetic). */
  swatch: [string, string];
}

/** Shared base: gentle noise cleanup, skin protection and edge-aware sharpening. */
const NATURAL_BASE: ParamDeltas = {
  skinProtection: 70,
  luminanceNoise: 8,
  colorNoise: 20,
  sharpness: 22,
  vibrance: 8,
  clarity: 6,
};

export const STYLES: readonly StyleDefinition[] = [
  {
    id: 'natural',
    name: 'Natural',
    description: 'Balanced colour and exposure, true to the scene',
    deltas: { ...NATURAL_BASE },
    swatch: ['#D9C7A7', '#7F9CB0'],
  },
  {
    id: 'warm',
    name: 'Warm',
    description: 'Golden-hour warmth with soft highlights',
    deltas: { ...NATURAL_BASE, temperature: 18, tint: 4, vibrance: 12, splitHighlightAmount: 12, highlights: -8 },
    highlightHue: 38,
    swatch: ['#F2B66D', '#C97B4A'],
  },
  {
    id: 'cool',
    name: 'Cool',
    description: 'Crisp, clean tones with a cooler balance',
    deltas: { ...NATURAL_BASE, temperature: -16, tint: -2, contrast: 6, splitShadowAmount: 10 },
    shadowHue: 210,
    swatch: ['#9CC3E6', '#5B7FA3'],
  },
  {
    id: 'portrait',
    name: 'Portrait',
    description: 'Flattering skin, softer contrast, gentle vignette',
    deltas: {
      ...NATURAL_BASE,
      skinProtection: 90,
      sharpness: 12,
      clarity: -6,
      temperature: 6,
      shadows: 10,
      highlights: -10,
      contrast: -4,
      vignette: 14,
    },
    swatch: ['#E8B9A0', '#9E6F5C'],
  },
  {
    id: 'landscape',
    name: 'Landscape',
    description: 'Clearer skies, richer foliage, more depth',
    deltas: {
      ...NATURAL_BASE,
      skinProtection: 30,
      vibrance: 22,
      saturation: 4,
      clarity: 16,
      dehaze: 14,
      sharpness: 34,
      highlights: -25,
      shadows: 18,
      contrast: 8,
    },
    swatch: ['#7DB37A', '#4E86B8'],
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Teal shadows, warm highlights, filmic contrast',
    deltas: {
      ...NATURAL_BASE,
      contrast: 10,
      fade: 12,
      splitShadowAmount: 24,
      splitHighlightAmount: 18,
      saturation: -8,
      vignette: 22,
      highlights: -15,
    },
    shadowHue: 192,
    highlightHue: 32,
    swatch: ['#3E7C86', '#E3A15F'],
  },
  {
    id: 'lowlight',
    name: 'Low light',
    description: 'Brighter shadows with stronger noise cleanup',
    deltas: {
      ...NATURAL_BASE,
      exposure: 0.35,
      shadows: 28,
      highlights: -20,
      luminanceNoise: 40,
      colorNoise: 55,
      sharpness: 14,
      clarity: -4,
      vibrance: 6,
    },
    swatch: ['#4B4F7A', '#C9A15E'],
  },
  {
    id: 'mono',
    name: 'B&W',
    description: 'Rich black-and-white with deep contrast',
    deltas: {
      ...NATURAL_BASE,
      skinProtection: 0,
      mono: 100,
      contrast: 14,
      clarity: 10,
      sharpness: 30,
      vignette: 10,
    },
    swatch: ['#E6E6E6', '#3A3A3A'],
  },
];

export const STYLE_IDS = STYLES.map((style) => style.id);

export function getStyle(id: StyleId): StyleDefinition {
  return STYLES.find((style) => style.id === id) ?? (STYLES[0] as StyleDefinition);
}

export function isStyleId(value: unknown): value is StyleId {
  return typeof value === 'string' && STYLE_IDS.includes(value as StyleId);
}
