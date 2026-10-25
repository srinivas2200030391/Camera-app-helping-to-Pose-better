/**
 * Processing parameter model.
 *
 * Final pipeline parameters are resolved from an EditRecipe:
 *   value = neutral + strength × (auto + styleDelta) + userAdjustment
 * so "strength 0" always reproduces the original, styles stay reversible, and a user's manual
 * tweak survives switching style or strength (it is stored as a delta).
 */
import { hashString, stableStringify } from '@/utils/math';

import { getStyle, type StyleId } from './presets';

export const NUMERIC_KEYS = [
  'exposure',
  'contrast',
  'highlights',
  'shadows',
  'levelsBlack',
  'levelsWhite',
  'temperature',
  'tint',
  'vibrance',
  'saturation',
  'skinProtection',
  'luminanceNoise',
  'colorNoise',
  'sharpness',
  'clarity',
  'dehaze',
  'fade',
  'vignette',
  'mono',
  'splitShadowAmount',
  'splitHighlightAmount',
] as const;

export type NumericKey = (typeof NUMERIC_KEYS)[number];

export type ParamGroup = 'light' | 'color' | 'detail' | 'look' | 'internal';

export interface ParamSpec {
  label: string;
  group: ParamGroup;
  min: number;
  max: number;
  neutral: number;
  step: number;
  /** Shown next to the value, e.g. "EV". */
  unit?: string;
  description?: string;
}

export const PARAM_SPECS: Record<NumericKey, ParamSpec> = {
  exposure: { label: 'Exposure', group: 'light', min: -2, max: 2, neutral: 0, step: 0.05, unit: 'EV' },
  contrast: { label: 'Contrast', group: 'light', min: -100, max: 100, neutral: 0, step: 1 },
  highlights: { label: 'Highlights', group: 'light', min: -100, max: 100, neutral: 0, step: 1, description: 'Negative values recover bright areas' },
  shadows: { label: 'Shadows', group: 'light', min: -100, max: 100, neutral: 0, step: 1, description: 'Positive values open up dark areas' },
  levelsBlack: { label: 'Black point', group: 'internal', min: 0, max: 0.2, neutral: 0, step: 0.005 },
  levelsWhite: { label: 'White point', group: 'internal', min: 0.8, max: 1, neutral: 1, step: 0.005 },
  temperature: { label: 'Temperature', group: 'color', min: -100, max: 100, neutral: 0, step: 1, description: 'Cooler ← → Warmer' },
  tint: { label: 'Tint', group: 'color', min: -100, max: 100, neutral: 0, step: 1, description: 'Green ← → Magenta' },
  vibrance: { label: 'Vibrance', group: 'color', min: -100, max: 100, neutral: 0, step: 1, description: 'Boosts muted colours more than vivid ones' },
  saturation: { label: 'Saturation', group: 'color', min: -100, max: 100, neutral: 0, step: 1 },
  skinProtection: { label: 'Skin protection', group: 'color', min: 0, max: 100, neutral: 0, step: 1, description: 'Keeps skin tones natural when boosting colour and detail' },
  luminanceNoise: { label: 'Noise reduction', group: 'detail', min: 0, max: 100, neutral: 0, step: 1 },
  colorNoise: { label: 'Colour noise', group: 'detail', min: 0, max: 100, neutral: 0, step: 1 },
  sharpness: { label: 'Sharpness', group: 'detail', min: 0, max: 100, neutral: 0, step: 1, description: 'Enhances existing edges; it cannot recover detail that was not captured' },
  clarity: { label: 'Local contrast', group: 'detail', min: -100, max: 100, neutral: 0, step: 1 },
  dehaze: { label: 'Dehaze', group: 'detail', min: 0, max: 100, neutral: 0, step: 1 },
  fade: { label: 'Fade', group: 'look', min: 0, max: 100, neutral: 0, step: 1 },
  vignette: { label: 'Vignette', group: 'look', min: 0, max: 100, neutral: 0, step: 1 },
  mono: { label: 'Monochrome', group: 'look', min: 0, max: 100, neutral: 0, step: 1 },
  splitShadowAmount: { label: 'Shadow tone', group: 'look', min: 0, max: 100, neutral: 0, step: 1 },
  splitHighlightAmount: { label: 'Highlight tone', group: 'look', min: 0, max: 100, neutral: 0, step: 1 },
};

export const ADJUSTABLE_GROUPS: { id: Exclude<ParamGroup, 'internal'>; label: string; keys: NumericKey[] }[] = [
  { id: 'light', label: 'Light', keys: ['exposure', 'contrast', 'highlights', 'shadows'] },
  { id: 'color', label: 'Colour', keys: ['temperature', 'tint', 'vibrance', 'saturation', 'skinProtection'] },
  { id: 'detail', label: 'Detail', keys: ['sharpness', 'luminanceNoise', 'colorNoise', 'clarity', 'dehaze'] },
  { id: 'look', label: 'Look', keys: ['fade', 'vignette', 'mono', 'splitShadowAmount', 'splitHighlightAmount'] },
];

export type NumericParams = Record<NumericKey, number>;

export interface PipelineParams extends NumericParams {
  /** Hue (degrees) used for shadow split-toning; a style constant, not scaled by strength. */
  splitShadowHue: number;
  splitHighlightHue: number;
}

export type ParamDeltas = Partial<Record<NumericKey, number>>;

export type CropAspect = '4:3' | '16:9' | '1:1' | null;

export interface EditRecipe {
  styleId: StyleId;
  /** 0 = original, 1 = full style. */
  strength: number;
  /** Scene-analysis suggestions (see analysis.ts); null until analysed. */
  auto: ParamDeltas | null;
  /** Manual slider tweaks, stored as deltas on top of the style. */
  adjustments: ParamDeltas;
  /** Centre crop applied on output; null keeps the captured frame. */
  crop: CropAspect;
}

export const NEUTRAL_PARAMS: PipelineParams = {
  ...(Object.fromEntries(NUMERIC_KEYS.map((key) => [key, PARAM_SPECS[key].neutral])) as NumericParams),
  splitShadowHue: 200,
  splitHighlightHue: 40,
};

export function clampParam(key: NumericKey, value: number): number {
  const spec = PARAM_SPECS[key];
  if (!Number.isFinite(value)) return spec.neutral;
  return Math.min(spec.max, Math.max(spec.min, value));
}

export function createRecipe(styleId: StyleId, auto: ParamDeltas | null = null, crop: CropAspect = null): EditRecipe {
  return { styleId, strength: 1, auto, adjustments: {}, crop };
}

/** Parameters before manual adjustments — what the sliders are relative to. */
export function resolveBaseParams(recipe: Pick<EditRecipe, 'styleId' | 'strength' | 'auto'>): PipelineParams {
  const style = getStyle(recipe.styleId);
  const strength = Math.min(1, Math.max(0, recipe.strength));
  const result: PipelineParams = { ...NEUTRAL_PARAMS };
  for (const key of NUMERIC_KEYS) {
    const contribution = (recipe.auto?.[key] ?? 0) + (style.deltas[key] ?? 0);
    result[key] = clampParam(key, PARAM_SPECS[key].neutral + strength * contribution);
  }
  result.splitShadowHue = style.shadowHue ?? NEUTRAL_PARAMS.splitShadowHue;
  result.splitHighlightHue = style.highlightHue ?? NEUTRAL_PARAMS.splitHighlightHue;
  return result;
}

export function resolveParams(recipe: EditRecipe): PipelineParams {
  const base = resolveBaseParams(recipe);
  for (const key of NUMERIC_KEYS) {
    const delta = recipe.adjustments[key];
    if (delta) base[key] = clampParam(key, base[key] + delta);
  }
  return base;
}

/** Sets a parameter to an absolute value by storing the matching delta. */
export function withAdjustment(recipe: EditRecipe, key: NumericKey, value: number): EditRecipe {
  const base = resolveBaseParams(recipe)[key];
  const delta = clampParam(key, value) - base;
  const adjustments = { ...recipe.adjustments };
  if (Math.abs(delta) < PARAM_SPECS[key].step / 2) delete adjustments[key];
  else adjustments[key] = delta;
  return { ...recipe, adjustments };
}

export function isIdentity(params: PipelineParams): boolean {
  return NUMERIC_KEYS.every((key) => Math.abs(params[key] - PARAM_SPECS[key].neutral) < 1e-6);
}

export function recipeHash(recipe: EditRecipe): string {
  return hashString(stableStringify(recipe));
}

export function serializeRecipe(recipe: EditRecipe): string {
  return JSON.stringify(recipe);
}

/** Parses a stored recipe defensively; unknown or corrupt data yields null. */
export function parseRecipe(json: string | null | undefined): EditRecipe | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<EditRecipe>;
    if (typeof value.styleId !== 'string' || typeof value.strength !== 'number') return null;
    const sanitize = (deltas: unknown): ParamDeltas => {
      const out: ParamDeltas = {};
      if (deltas && typeof deltas === 'object') {
        for (const key of NUMERIC_KEYS) {
          const v = (deltas as Record<string, unknown>)[key];
          if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
        }
      }
      return out;
    };
    return {
      styleId: getStyle(value.styleId as StyleId).id,
      strength: Math.min(1, Math.max(0, value.strength)),
      auto: value.auto ? sanitize(value.auto) : null,
      adjustments: sanitize(value.adjustments),
      crop: value.crop === '4:3' || value.crop === '16:9' || value.crop === '1:1' ? value.crop : null,
    };
  } catch {
    return null;
  }
}
