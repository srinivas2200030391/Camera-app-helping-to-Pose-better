import {
  ADJUSTABLE_GROUPS,
  NUMERIC_KEYS,
  PARAM_SPECS,
  createRecipe,
  isIdentity,
  parseRecipe,
  recipeHash,
  resolveBaseParams,
  resolveParams,
  serializeRecipe,
  withAdjustment,
} from '../params';
import { STYLES, getStyle } from '../presets';

describe('style presets', () => {
  it.each(STYLES.map((style) => [style.id, style] as const))('%s only uses known keys within range', (_id, style) => {
    for (const [key, value] of Object.entries(style.deltas)) {
      expect(NUMERIC_KEYS).toContain(key);
      const spec = PARAM_SPECS[key as keyof typeof PARAM_SPECS];
      expect(spec.neutral + (value as number)).toBeGreaterThanOrEqual(spec.min);
      expect(spec.neutral + (value as number)).toBeLessThanOrEqual(spec.max);
    }
  });

  it('has the eight required styles with unique ids', () => {
    expect(STYLES.map((style) => style.id)).toEqual(['natural', 'warm', 'cool', 'portrait', 'landscape', 'cinematic', 'lowlight', 'mono']);
  });

  it('falls back to Natural for unknown ids', () => {
    expect(getStyle('nope' as never).id).toBe('natural');
  });

  it('keeps Natural restrained (no style pushes skin-unfriendly extremes)', () => {
    const natural = resolveParams(createRecipe('natural'));
    expect(Math.abs(natural.saturation)).toBeLessThanOrEqual(10);
    expect(natural.sharpness).toBeLessThanOrEqual(40);
    expect(natural.skinProtection).toBeGreaterThanOrEqual(50);
  });
});

describe('recipe resolution', () => {
  const auto = { exposure: 0.4, temperature: 12, luminanceNoise: 20 };

  it('strength 0 reproduces the original exactly, for every style', () => {
    for (const style of STYLES) {
      const recipe = { ...createRecipe(style.id, auto), strength: 0 };
      expect(isIdentity(resolveParams(recipe))).toBe(true);
    }
  });

  it('scales auto + style linearly with strength', () => {
    const full = resolveBaseParams({ styleId: 'warm', strength: 1, auto });
    const half = resolveBaseParams({ styleId: 'warm', strength: 0.5, auto });
    expect(half.temperature).toBeCloseTo(full.temperature / 2);
    expect(half.exposure).toBeCloseTo(full.exposure / 2);
  });

  it('stores manual adjustments as deltas that survive style changes', () => {
    let recipe = createRecipe('natural', auto);
    recipe = withAdjustment(recipe, 'exposure', 1.0);
    expect(resolveParams(recipe).exposure).toBeCloseTo(1.0);
    const delta = recipe.adjustments.exposure as number;
    const switched = { ...recipe, styleId: 'lowlight' as const };
    expect(resolveParams(switched).exposure).toBeCloseTo(resolveBaseParams(switched).exposure + delta);
  });

  it('removes a delta when the slider returns to the base value', () => {
    let recipe = withAdjustment(createRecipe('natural'), 'contrast', 30);
    recipe = withAdjustment(recipe, 'contrast', resolveBaseParams(recipe).contrast);
    expect(recipe.adjustments.contrast).toBeUndefined();
  });

  it('clamps to parameter ranges', () => {
    const recipe = withAdjustment(createRecipe('natural'), 'exposure', 99);
    expect(resolveParams(recipe).exposure).toBe(PARAM_SPECS.exposure.max);
    const params = resolveParams({ ...createRecipe('natural'), adjustments: { vignette: -500 } });
    expect(params.vignette).toBe(0);
  });

  it('exposes every adjustable key exactly once in the UI groups', () => {
    const keys = ADJUSTABLE_GROUPS.flatMap((group) => group.keys);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(PARAM_SPECS[key].group).not.toBe('internal');
  });
});

describe('recipe serialisation', () => {
  it('round-trips through JSON', () => {
    const recipe = withAdjustment(createRecipe('cinematic', { exposure: 0.2 }, '1:1'), 'fade', 40);
    expect(parseRecipe(serializeRecipe(recipe))).toEqual(recipe);
  });

  it('rejects corrupt data and sanitises unknown fields', () => {
    expect(parseRecipe('not json')).toBeNull();
    expect(parseRecipe(JSON.stringify({ foo: 1 }))).toBeNull();
    const parsed = parseRecipe(JSON.stringify({ styleId: 'bogus', strength: 7, auto: { exposure: 'x', tint: 3 }, adjustments: { evil: 1 }, crop: '2:1' }));
    expect(parsed).toEqual({ styleId: 'natural', strength: 1, auto: { tint: 3 }, adjustments: {}, crop: null });
  });

  it('hashes independently of key order', () => {
    const a = { ...createRecipe('natural'), adjustments: { exposure: 0.5, contrast: 10 } };
    const b = { ...createRecipe('natural'), adjustments: { contrast: 10, exposure: 0.5 } };
    expect(recipeHash(a)).toBe(recipeHash(b));
    expect(recipeHash(a)).not.toBe(recipeHash({ ...a, strength: 0.9 }));
  });
});
