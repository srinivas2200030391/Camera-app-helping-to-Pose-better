/**
 * Colour maths shared by scene analysis (CPU) and the shader uniforms (GPU), so the
 * white-balance estimate and its correction use exactly the same model.
 */

/** log2 white-balance gains per unit (100) of the temperature / tint sliders. */
export const WB_TEMPERATURE_STOPS = 0.5;
export const WB_TINT_STOPS = 0.35;

const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function srgb8ToLinear(value: number): number {
  return SRGB_TO_LINEAR[Math.min(255, Math.max(0, Math.round(value)))] ?? 0;
}

export function linearToSrgb(value: number): number {
  const v = Math.min(1, Math.max(0, value));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** Linear-light gains for the temperature/tint sliders, normalised to preserve luminance. */
export function whiteBalanceGains(temperature: number, tint: number): [number, number, number] {
  const t = (temperature / 100) * WB_TEMPERATURE_STOPS;
  const n = (tint / 100) * WB_TINT_STOPS;
  const r = 2 ** t;
  const g = 2 ** -n;
  const b = 2 ** -t;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [r / luminance, g / luminance, b / luminance];
}

/** Slider values that neutralise surfaces whose mean linear colour is (r, g, b). */
export function castFromNeutralMeans(r: number, g: number, b: number): { temperature: number; tint: number } {
  if (r <= 0 || g <= 0 || b <= 0) return { temperature: 0, tint: 0 };
  // Temperature balances red against blue; tint balances green against the R/B average.
  const temperatureStops = (Math.log2(g / r) - Math.log2(g / b)) / 2;
  const temperature = (temperatureStops / WB_TEMPERATURE_STOPS) * 100;
  const r2 = r * 2 ** temperatureStops;
  const b2 = b * 2 ** -temperatureStops;
  const tintStops = Math.log2((r2 + b2) / 2 / g);
  // Positive tint = less green; we need a green gain of +tintStops, i.e. tint = -tintStops.
  const tint = (-tintStops / WB_TINT_STOPS) * 100;
  return { temperature, tint };
}

/**
 * Broad YCbCr skin-tone test on 0..1 sRGB values (covers light to dark skin). Mirrors the
 * shader's smooth skin mask, as a hard threshold.
 */
export function isSkinTone(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = (b - y) * 0.564 + 0.5;
  const cr = (r - y) * 0.713 + 0.5;
  return cb > 0.3 && cb < 0.5 && cr > 0.53 && cr < 0.68 && y > 0.12 && y < 0.95;
}
