/**
 * Scene analysis → automatic corrections ("Smart Natural").
 *
 * This is classical image statistics on a small downscaled copy (≈112×84 px), not a neural
 * network: luminance histogram percentiles, a grey-pixel white-balance estimate, clipping and haze
 * heuristics, and ISO-based noise estimates. Every correction is partial and clamped so the result
 * stays close to what the camera captured.
 */
import { castFromNeutralMeans, isSkinTone, linearToSrgb, srgb8ToLinear, whiteBalanceGains } from './color';
import type { NumericKey, ParamDeltas } from './params';

export interface SceneStats {
  pixelCount: number;
  meanLuma: number;
  medianLuma: number;
  p005: number;
  p995: number;
  clippedHighlights: number;
  deepShadows: number;
  meanSaturation: number;
  neutralFraction: number;
  /** Estimated colour cast as WB-slider units that would neutralise it. */
  castTemperature: number;
  castTint: number;
}

export interface AnalysisInput {
  /** RGBA8888, row-major, unpremultiplied (alpha ignored). */
  pixels: Uint8Array;
  width: number;
  height: number;
  /** From EXIF when available; drives noise reduction. */
  iso?: number | null;
}

export interface AnalysisResult {
  stats: SceneStats;
  auto: ParamDeltas;
}

function percentile(histogram: Uint32Array, total: number, fraction: number): number {
  const target = total * fraction;
  let cumulative = 0;
  for (let i = 0; i < histogram.length; i++) {
    cumulative += histogram[i] ?? 0;
    if (cumulative >= target) return i / (histogram.length - 1);
  }
  return 1;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function noiseFromIso(iso: number | null | undefined, medianLuma: number): { luminance: number; color: number } {
  if (iso != null && Number.isFinite(iso) && iso > 0) {
    const stops = Math.log2(Math.max(iso, 50) / 100);
    return { luminance: clamp(4 + 12 * stops, 2, 55), color: clamp(14 + 10 * stops, 10, 65) };
  }
  // Unknown ISO: dark scenes are almost always high-ISO on phones.
  return medianLuma < 0.18 ? { luminance: 22, color: 40 } : { luminance: 6, color: 18 };
}

/** Maximum saturation (in sRGB terms) for a pixel to count as grey under the hypothesised light. */
const GREY_SATURATION = 0.2;

interface WhiteBalanceEstimate {
  temperature: number;
  tint: number;
  confidence: number;
  neutralFraction: number;
}

/**
 * Two-pass grey-pixel estimate: hypothesise the illuminant from all mid-tones (grey world),
 * then keep only pixels that become near-grey under that hypothesis and are not skin. Their mean
 * gives the final estimate; few such pixels means low confidence.
 */
function estimateWhiteBalance(linear: Float32Array, skin: Uint8Array, midCount: number, totalCount: number): WhiteBalanceEstimate {
  if (midCount === 0) return { temperature: 0, tint: 0, confidence: 0, neutralFraction: 0 };
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let k = 0; k < midCount; k++) {
    sumR += linear[k * 3] ?? 0;
    sumG += linear[k * 3 + 1] ?? 0;
    sumB += linear[k * 3 + 2] ?? 0;
  }
  const raw = castFromNeutralMeans(sumR / midCount, sumG / midCount, sumB / midCount);
  // Real illuminant casts left in phone JPEGs are modest; anything larger is scene colour
  // (a blue wall, a sunset), so the hypothesis is limited to a plausible range.
  const hypothesis = { temperature: clamp(raw.temperature, -90, 90), tint: clamp(raw.tint, -60, 60) };
  const [gr, gg, gb] = whiteBalanceGains(hypothesis.temperature, hypothesis.tint);

  let nR = 0;
  let nG = 0;
  let nB = 0;
  let n = 0;
  for (let k = 0; k < midCount; k++) {
    if (skin[k]) continue;
    const r = linearToSrgb((linear[k * 3] ?? 0) * gr);
    const g = linearToSrgb((linear[k * 3 + 1] ?? 0) * gg);
    const b = linearToSrgb((linear[k * 3 + 2] ?? 0) * gb);
    const max = Math.max(r, g, b);
    if (max <= 0.05 || max >= 0.97) continue;
    if ((max - Math.min(r, g, b)) / max < GREY_SATURATION) {
      nR += linear[k * 3] ?? 0;
      nG += linear[k * 3 + 1] ?? 0;
      nB += linear[k * 3 + 2] ?? 0;
      n++;
    }
  }
  const neutralFraction = n / Math.max(1, totalCount);
  if (neutralFraction >= 0.03) {
    return { ...castFromNeutralMeans(nR / n, nG / n, nB / n), confidence: clamp(neutralFraction / 0.2, 0.35, 1), neutralFraction };
  }
  return { ...hypothesis, confidence: 0.15, neutralFraction };
}

export function analyzeScene({ pixels, width, height, iso }: AnalysisInput): AnalysisResult {
  const count = Math.min(width * height, Math.floor(pixels.length / 4));
  const histogram = new Uint32Array(256);
  const midLinear = new Float32Array(count * 3);
  const midSkin = new Uint8Array(count);
  let midCount = 0;
  let lumaSum = 0;
  let satSum = 0;
  let clipped = 0;
  let deep = 0;

  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const r8 = pixels[o] ?? 0;
    const g8 = pixels[o + 1] ?? 0;
    const b8 = pixels[o + 2] ?? 0;
    const r = r8 / 255;
    const g = g8 / 255;
    const b = b8 / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const bin = Math.round(luma * 255);
    histogram[bin] = (histogram[bin] ?? 0) + 1;
    lumaSum += luma;
    const max = Math.max(r, g, b);
    // Near-white pixels: a single saturated channel (a vivid blue sky) is not a blown highlight.
    if (luma >= 0.96) clipped++;
    if (luma < 0.1) deep++;
    if (luma > 0.12 && luma < 0.92) {
      satSum += max > 0.04 ? (max - Math.min(r, g, b)) / max : 0;
      midLinear[midCount * 3] = srgb8ToLinear(r8);
      midLinear[midCount * 3 + 1] = srgb8ToLinear(g8);
      midLinear[midCount * 3 + 2] = srgb8ToLinear(b8);
      midSkin[midCount] = isSkinTone(r, g, b) ? 1 : 0;
      midCount++;
    }
  }

  const safeCount = Math.max(1, count);
  const meanLuma = lumaSum / safeCount;
  const medianLuma = percentile(histogram, count, 0.5);
  const p005 = percentile(histogram, count, 0.005);
  const p995 = percentile(histogram, count, 0.995);
  const clippedHighlights = clipped / safeCount;
  const deepShadows = deep / safeCount;
  const meanSaturation = midCount > 0 ? satSum / midCount : 0;
  const wb = estimateWhiteBalance(midLinear, midSkin, midCount, count);

  const auto: ParamDeltas = {};
  const set = (key: NumericKey, value: number) => {
    if (Math.abs(value) >= 0.5 || (key === 'exposure' && Math.abs(value) >= 0.02) || key.startsWith('levels')) {
      auto[key] = value;
    }
  };

  // Grey-world reasoning fails on very colourful scenes, and strong casts are often intentional
  // (sunsets, stage light): correct both less.
  const colourfulness = clamp(1 - (meanSaturation - 0.35) / 0.3, 0, 1);
  const castMagnitude = Math.hypot(wb.temperature, wb.tint);
  const castDamping = castMagnitude > 150 ? 0.25 : castMagnitude > 70 ? 0.5 : 1;
  const wbStrength = wb.confidence * castDamping * colourfulness;
  // The camera's own auto white balance already ran; this only nudges what is left.
  set('temperature', clamp(wb.temperature * 0.35 * wbStrength, -20, 20));
  set('tint', clamp(wb.tint * 0.3 * wbStrength, -12, 12));

  // Exposure: bright, high-key scenes are meant to be bright, so there is a wide dead zone.
  // Brighten only clearly dark frames that have highlight headroom; darken only frames with
  // genuinely blown highlights.
  const targetLinear = 0.16;
  const medianLinear = srgb8ToLinear(medianLuma * 255);
  if (medianLuma < 0.25 && p995 < 0.92 && medianLinear > 0.0005) {
    // Very dark frames are often intentional (night, stage); the Low light style goes further.
    const maxBoost = medianLuma < 0.08 ? 0.3 : 0.6;
    set('exposure', clamp(Math.log2(targetLinear / medianLinear) * 0.5, 0, maxBoost));
  } else if (clippedHighlights > 0.03 && medianLuma > 0.55) {
    set('exposure', -clamp(clippedHighlights * 4, 0.1, 0.5));
  }

  // Levels: only stretch when the histogram leaves headroom (washed-out or dull images).
  if (p005 > 0.025) set('levelsBlack', clamp(p005 * 0.5, 0, 0.04));
  if (p995 < 0.95 && p995 > 0.5) set('levelsWhite', clamp(Math.max(p995 * 1.03, 0.9) - 1, -0.1, 0));

  if (clippedHighlights > 0.008) set('highlights', -clamp(clippedHighlights * 500, 10, 45));
  else if (p995 > 0.96) set('highlights', -10);
  if (deepShadows > 0.12) set('shadows', deepShadows > 0.5 ? 12 : clamp(deepShadows * 80, 8, 25));

  if (meanSaturation < 0.16) set('vibrance', 12);
  else if (meanSaturation > 0.5) set('vibrance', -6);

  // Haze: lifted blacks + low contrast + muted colour.
  if (p005 > 0.1 && p995 - p005 < 0.65 && meanSaturation < 0.22) set('dehaze', 15);

  const noise = noiseFromIso(iso, medianLuma);
  set('luminanceNoise', noise.luminance);
  set('colorNoise', noise.color);

  return {
    stats: {
      pixelCount: count,
      meanLuma,
      medianLuma,
      p005,
      p995,
      clippedHighlights,
      deepShadows,
      meanSaturation,
      neutralFraction: wb.neutralFraction,
      castTemperature: wb.temperature,
      castTint: wb.tint,
    },
    auto,
  };
}
