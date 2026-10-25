import { analyzeScene, noiseFromIso } from '../analysis';
import { castFromNeutralMeans, linearToSrgb, srgb8ToLinear, whiteBalanceGains } from '../color';

/** Builds an RGBA buffer where `fill(x, y)` returns 0..255 sRGB values. */
function image(width: number, height: number, fill: (x: number, y: number) => [number, number, number]): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      const o = (y * width + x) * 4;
      pixels[o] = r;
      pixels[o + 1] = g;
      pixels[o + 2] = b;
      pixels[o + 3] = 255;
    }
  }
  return pixels;
}

/** A neutral grey ramp (plus a little texture) with an optional per-channel linear-light cast. */
function greyScene(cast: [number, number, number] = [1, 1, 1], brightness = 1) {
  return image(96, 72, (x, y) => {
    const v = 40 + ((x * 3 + y * 2) % 170);
    const lin = srgb8ToLinear(v) * brightness;
    return cast.map((c) => Math.round(linearToSrgb(lin * c) * 255)) as [number, number, number];
  });
}

describe('white balance estimation', () => {
  it('leaves a neutral scene alone', () => {
    const { auto, stats } = analyzeScene({ pixels: greyScene(), width: 96, height: 72 });
    expect(Math.abs(auto.temperature ?? 0)).toBeLessThan(1);
    expect(Math.abs(auto.tint ?? 0)).toBeLessThan(1);
    expect(stats.neutralFraction).toBeGreaterThan(0.5);
  });

  it('warms a blue cast and cools an orange cast', () => {
    const blue = analyzeScene({ pixels: greyScene([0.8, 0.95, 1.25]), width: 96, height: 72 });
    const orange = analyzeScene({ pixels: greyScene([1.3, 1.0, 0.75]), width: 96, height: 72 });
    expect(blue.auto.temperature).toBeGreaterThan(5);
    expect(orange.auto.temperature).toBeLessThan(-5);
  });

  it('inverts the shader gain model (estimated correction neutralises the cast)', () => {
    const cast: [number, number, number] = [0.85, 1.05, 1.2];
    const { temperature, tint } = castFromNeutralMeans(cast[0], cast[1], cast[2]);
    const gains = whiteBalanceGains(temperature, tint);
    const corrected = cast.map((c, i) => c * (gains[i] as number));
    expect(corrected[0]).toBeCloseTo(corrected[1] as number, 5);
    expect(corrected[2]).toBeCloseTo(corrected[1] as number, 5);
  });

  it('corrects strong (probably intentional) casts only partially and within limits', () => {
    const { auto } = analyzeScene({ pixels: greyScene([2.2, 1, 0.4]), width: 96, height: 72 });
    expect(auto.temperature).toBeGreaterThanOrEqual(-40);
    expect(Math.abs(auto.temperature ?? 0)).toBeLessThan(40);
  });
});

describe('colourful scenes are not mistaken for colour casts', () => {
  it('leaves a saturated blue scene almost untouched', () => {
    const blue = image(96, 72, (x, y) => [20 + (x % 12), 40 + (y % 12), 225 + (x % 20)]);
    const { auto } = analyzeScene({ pixels: blue, width: 96, height: 72 });
    expect(Math.abs(auto.temperature ?? 0)).toBeLessThan(3);
    expect(Math.abs(auto.tint ?? 0)).toBeLessThan(3);
  });

  it('does not treat one saturated channel as blown highlights', () => {
    const vivid = image(96, 72, () => [12, 40, 255]);
    const { auto, stats } = analyzeScene({ pixels: vivid, width: 96, height: 72 });
    expect(stats.clippedHighlights).toBe(0);
    expect(auto.highlights).toBeUndefined();
  });
});

describe('exposure and tone', () => {
  it('brightens an underexposed scene and darkens an overexposed one', () => {
    const dark = analyzeScene({ pixels: greyScene([1, 1, 1], 0.15), width: 96, height: 72 });
    const bright = analyzeScene({ pixels: image(96, 72, (x) => [230 + (x % 20), 230 + (x % 20), 230 + (x % 20)]), width: 96, height: 72 });
    expect(dark.auto.exposure).toBeGreaterThan(0.2);
    expect(dark.auto.exposure).toBeLessThanOrEqual(0.8);
    expect(bright.auto.exposure ?? 0).toBeLessThan(0);
  });

  it('leaves a bright, high-key scene without blown highlights at its exposure', () => {
    const highKey = image(96, 72, (x, y) => [150 + ((x + y) % 60), 175 + ((x + y) % 50), 190 + ((x + y) % 40)]);
    const { auto } = analyzeScene({ pixels: highKey, width: 96, height: 72 });
    expect(auto.exposure).toBeUndefined();
  });

  it('recovers highlights when many pixels clip', () => {
    const clipped = image(96, 72, (x) => (x < 30 ? [255, 255, 255] : [120, 110, 100]));
    const { auto, stats } = analyzeScene({ pixels: clipped, width: 96, height: 72 });
    expect(stats.clippedHighlights).toBeGreaterThan(0.25);
    expect(auto.highlights).toBeLessThan(-10);
  });

  it('lifts shadows when a large area is very dark', () => {
    const shadowy = image(96, 72, (x) => (x < 40 ? [8, 8, 10] : [140, 135, 130]));
    expect(analyzeScene({ pixels: shadowy, width: 96, height: 72 }).auto.shadows).toBeGreaterThan(8);
  });

  it('handles an all-black frame without NaNs', () => {
    const { auto, stats } = analyzeScene({ pixels: new Uint8Array(96 * 72 * 4), width: 96, height: 72 });
    for (const value of Object.values(auto)) expect(Number.isFinite(value)).toBe(true);
    expect(stats.meanLuma).toBe(0);
  });
});

describe('noise estimate', () => {
  it('increases monotonically with ISO and stays bounded', () => {
    const isos = [50, 100, 400, 1600, 6400, 25600];
    const values = isos.map((iso) => noiseFromIso(iso, 0.4));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!.luminance).toBeGreaterThanOrEqual(values[i - 1]!.luminance);
      expect(values[i]!.color).toBeGreaterThanOrEqual(values[i - 1]!.color);
    }
    expect(values.at(-1)!.luminance).toBeLessThanOrEqual(55);
  });

  it('assumes more noise for dark frames when ISO is unknown', () => {
    expect(noiseFromIso(undefined, 0.1).luminance).toBeGreaterThan(noiseFromIso(undefined, 0.5).luminance);
  });
});
