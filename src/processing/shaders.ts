/**
 * SkSL sources for the processing pipeline and helpers that turn PipelineParams into uniforms.
 * Shaders work on 8-bit sRGB-encoded input; colour maths that must happen in linear light
 * (white balance, exposure, dehaze) linearises explicitly.
 */
import { whiteBalanceGains } from './color';
import type { PipelineParams } from './params';

const COMMON = /* glsl */ `
const float3 LUMA = float3(0.2126, 0.7152, 0.0722);

float3 toLinear(float3 c) {
  float3 lo = c / 12.92;
  float3 hi = pow((c + 0.055) / 1.055, float3(2.4));
  return mix(lo, hi, step(float3(0.04045), c));
}

float3 toSrgb(float3 c) {
  c = clamp(c, 0.0, 1.0);
  float3 lo = c * 12.92;
  float3 hi = 1.055 * pow(c, float3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(float3(0.0031308), c));
}

float3 toYcc(float3 c) {
  float y = dot(c, float3(0.299, 0.587, 0.114));
  return float3(y, (c.b - y) * 0.564, (c.r - y) * 0.713);
}

float3 fromYcc(float3 v) {
  float r = v.x + 1.403 * v.z;
  float b = v.x + 1.773 * v.y;
  float g = (v.x - 0.299 * r - 0.114 * b) / 0.587;
  return float3(r, g, b);
}
`;

/**
 * Pass 1 — edge-aware noise reduction. Luma and chroma are filtered separately: chroma noise is
 * blotchy and low-frequency (wider kernel, stronger), luma noise carries texture (narrow kernel,
 * range-limited so edges and fine detail survive).
 */
export const DENOISE_SKSL = /* glsl */ `
uniform shader image;
uniform float lumaStrength;
uniform float chromaStrength;
uniform float stride;
${COMMON}
half4 main(float2 p) {
  float4 c0 = image.eval(p);
  float3 y0 = toYcc(c0.rgb);
  float sigmaY = mix(0.012, 0.06, lumaStrength);
  float sigmaC = mix(0.025, 0.11, chromaStrength);
  float ySum = 0.0;
  float yW = 0.0;
  float2 cSum = float2(0.0);
  float cW = 0.0;
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      float2 o = float2(float(i), float(j));
      float spatial = exp(-dot(o, o) / 4.5);
      float3 s = toYcc(image.eval(p + o * stride).rgb);
      float dy = s.x - y0.x;
      float wy = spatial * exp(-(dy * dy) / (2.0 * sigmaY * sigmaY));
      ySum += s.x * wy;
      yW += wy;
      float3 sc = toYcc(image.eval(p + o * stride * 2.0).rgb);
      float dyc = sc.x - y0.x;
      float2 dc = sc.yz - y0.yz;
      float wc = spatial * exp(-(dyc * dyc) / (8.0 * sigmaY * sigmaY + 0.002)) * exp(-dot(dc, dc) / (2.0 * sigmaC * sigmaC));
      cSum += sc.yz * wc;
      cW += wc;
    }
  }
  float y = mix(y0.x, ySum / max(yW, 1e-5), lumaStrength);
  float2 cc = mix(y0.yz, cSum / max(cW, 1e-5), chromaStrength);
  return half4(half3(clamp(fromYcc(float3(y, cc)), 0.0, 1.0)), 1.0);
}
`;

/** Base-layer prep (low resolution): luminance and dark channel, blurred afterwards. */
export const BASE_SKSL = /* glsl */ `
uniform shader image;
half4 main(float2 p) {
  float3 c = image.eval(p).rgb;
  float y = dot(c, float3(0.2126, 0.7152, 0.0722));
  float dark = min(c.r, min(c.g, c.b));
  return half4(half(y), half(dark), 0.0, 1.0);
}
`;

/**
 * Pass 3 — colour, tone, local contrast, sharpening and look. `image` is the denoised tile,
 * `blurred` its small-radius blur (unsharp-mask reference), `base` the global low-res base layer.
 */
export const MAIN_SKSL = /* glsl */ `
uniform shader image;
uniform shader blurred;
uniform shader base;
uniform float2 tileOrigin;
uniform float2 imageSize;
uniform float2 baseScale;
uniform float exposureGain;
uniform float3 wbGains;
uniform float levelsBlack;
uniform float levelsWhite;
uniform float contrast;
uniform float highlights;
uniform float shadows;
uniform float clarity;
uniform float dehaze;
uniform float vibrance;
uniform float saturation;
uniform float skinProtect;
uniform float sharpen;
uniform float sharpenThreshold;
uniform float fade;
uniform float vignette;
uniform float mono;
uniform float3 shadowTint;
uniform float3 highlightTint;
${COMMON}
float skinMask(float3 c) {
  float y = dot(c, float3(0.299, 0.587, 0.114));
  float cb = (c.b - y) * 0.564 + 0.5;
  float cr = (c.r - y) * 0.713 + 0.5;
  return smoothstep(0.27, 0.32, cb) * (1.0 - smoothstep(0.48, 0.53, cb))
       * smoothstep(0.51, 0.545, cr) * (1.0 - smoothstep(0.66, 0.70, cr))
       * smoothstep(0.10, 0.18, y) * (1.0 - smoothstep(0.92, 0.98, y));
}

float levels(float v) {
  return clamp((v - levelsBlack) / max(levelsWhite - levelsBlack, 0.1), 0.0, 1.0);
}

float hash(float2 p) {
  return fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453);
}

half4 main(float2 p) {
  float2 g = p + tileOrigin;
  float3 rgb = image.eval(p).rgb;
  float skin = skinMask(rgb) * skinProtect;

  // 1. Detail: thresholded, clamped luminance unsharp mask (no halos, no noise amplification).
  float detail = dot(rgb, LUMA) - dot(blurred.eval(p).rgb, LUMA);
  detail = sign(detail) * max(abs(detail) - sharpenThreshold, 0.0);
  detail = clamp(detail, -0.05, 0.05);
  float lumaIn = dot(rgb, LUMA);
  rgb += detail * sharpen * (1.0 - 0.65 * skin) * smoothstep(0.02, 0.12, lumaIn);

  // 2. White balance and exposure in linear light. Blown whites stay white: neither the colour
  //    correction nor a negative exposure may turn clipped areas (sky, sun, lamps) grey or tinted.
  float3 linIn = toLinear(clamp(rgb, 0.0, 1.0));
  float3 lin = linIn * wbGains * exposureGain;
  float clipIn = smoothstep(0.9, 0.985, min(rgb.r, min(rgb.g, rgb.b)));
  lin = mix(lin, max(lin, linIn), clipIn);

  // 3. Dehaze from the blurred dark channel (dark-channel prior, simplified).
  float3 b = base.eval(g * baseScale).rgb;
  if (dehaze > 0.0) {
    float haze = smoothstep(0.04, 0.55, b.g) * dehaze * 0.55;
    lin = max((lin - 0.85 * haze) / max(1.0 - haze, 0.3), 0.0);
  }

  float3 v = toSrgb(lin);
  v = float3(levels(v.r), levels(v.g), levels(v.b));

  // 4. Shadows / highlights / local contrast, driven by luminance blended with the base layer.
  float y = dot(v, LUMA);
  float yBase = levels(toSrgb(toLinear(float3(b.r)) * exposureGain).r);
  float ym = mix(y, yBase, 0.5);
  float sMask = 1.0 - smoothstep(0.0, 0.6, ym);
  float yNew = y * exp2(shadows * 1.4 * sMask * sMask);
  float hMask = smoothstep(0.35, 1.0, ym);
  yNew = yNew + highlights * 0.7 * hMask * yNew * (1.0 - yNew);
  float local = clamp(y - yBase, -0.25, 0.25);
  yNew = yNew + clarity * 0.6 * local * 4.0 * yNew * (1.0 - yNew) * (1.0 - 0.5 * skin);
  yNew = clamp(yNew, 0.0, 1.0);
  v = y > 0.002 ? v * (yNew / y) : v + (yNew - y);

  // 5. Contrast: gentle per-channel S-curve around mid-grey.
  v = clamp(v, 0.0, 1.0);
  v = v + 2.0 * contrast * v * (1.0 - v) * (2.0 * v - 1.0);

  // 6. Vibrance / saturation, protected on skin.
  float yc = dot(v, LUMA);
  float mx = max(v.r, max(v.g, v.b));
  float mn = min(v.r, min(v.g, v.b));
  float sat = (mx - mn) / max(mx, 1e-4);
  float protect = 1.0 - 0.85 * skin;
  // Near-greys are left alone so vibrance cannot amplify a residual colour cast.
  float vib = vibrance * protect * smoothstep(0.03, 0.12, sat);
  float satGain = (1.0 + vib * (1.0 - sat)) * (1.0 + saturation * (saturation > 0.0 ? protect : 1.0));
  v = yc + (v - yc) * max(satGain, 0.0);

  // 7. Split toning (luminance-neutral tint vectors).
  float yt = clamp(dot(v, LUMA), 0.0, 1.0);
  v += shadowTint * (1.0 - smoothstep(0.0, 0.55, yt)) + highlightTint * smoothstep(0.45, 1.0, yt);

  // 8. Monochrome (panchromatic-style channel mix).
  float bw = dot(v, float3(0.30, 0.59, 0.11));
  v = mix(v, float3(bw), mono);

  // 9. Fade (lifted blacks) and vignette.
  v = fade * 0.13 + v * (1.0 - fade * 0.13);
  float2 uv = (g / imageSize - 0.5) * 2.0;
  uv.x *= imageSize.x / max(imageSize.y, 1.0) * 0.75;
  float d = length(uv);
  v *= 1.0 - vignette * 0.42 * smoothstep(0.45, 1.35, d);

  // 10. Sub-LSB dither to avoid banding in smooth gradients after tone changes.
  v += (hash(g) - 0.5) / 255.0;
  return half4(half3(clamp(v, 0.0, 1.0)), 1.0);
}
`;

export interface DenoiseUniforms {
  lumaStrength: number;
  chromaStrength: number;
  stride: number;
}

export function denoiseUniforms(params: PipelineParams, longSide: number): DenoiseUniforms {
  return {
    lumaStrength: Math.min(1, params.luminanceNoise / 100),
    chromaStrength: Math.min(1, params.colorNoise / 100),
    // Keep the kernel's physical size roughly constant across resolutions.
    stride: Math.max(1, longSide / 3000),
  };
}

export function needsDenoise(params: PipelineParams): boolean {
  return params.luminanceNoise > 0.5 || params.colorNoise > 0.5;
}

export { whiteBalanceGains };

function hueToRgb(hueDegrees: number): [number, number, number] {
  const h = (((hueDegrees % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const table: [number, number, number][] = [
    [1, x, 0],
    [x, 1, 0],
    [0, 1, x],
    [0, x, 1],
    [x, 0, 1],
    [1, 0, x],
  ];
  return table[Math.floor(h) % 6] ?? [1, 0, 0];
}

/** Luminance-neutral tint vector for split toning; `amount` 0..100. */
export function tintVector(hueDegrees: number, amount: number): [number, number, number] {
  const [r, g, b] = hueToRgb(hueDegrees);
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const scale = (amount / 100) * 0.09;
  return [(r - y) * scale, (g - y) * scale, (b - y) * scale];
}

export interface MainUniformContext {
  tileOrigin: [number, number];
  imageSize: [number, number];
  baseScale: [number, number];
}

export function mainUniforms(params: PipelineParams, context: MainUniformContext): Record<string, number[]> {
  return {
    tileOrigin: context.tileOrigin,
    imageSize: context.imageSize,
    baseScale: context.baseScale,
    exposureGain: [2 ** params.exposure],
    wbGains: whiteBalanceGains(params.temperature, params.tint),
    levelsBlack: [params.levelsBlack],
    levelsWhite: [params.levelsWhite],
    contrast: [(params.contrast / 100) * 0.5],
    highlights: [params.highlights / 100],
    shadows: [params.shadows / 100],
    clarity: [params.clarity / 100],
    dehaze: [params.dehaze / 100],
    vibrance: [params.vibrance / 100],
    saturation: [params.saturation / 100],
    skinProtect: [params.skinProtection / 100],
    sharpen: [(params.sharpness / 100) * 1.6],
    sharpenThreshold: [0.004 + (params.luminanceNoise / 100) * 0.006],
    fade: [params.fade / 100],
    vignette: [params.vignette / 100],
    mono: [params.mono / 100],
    shadowTint: tintVector(params.splitShadowHue, params.splitShadowAmount),
    highlightTint: tintVector(params.splitHighlightHue, params.splitHighlightAmount),
  };
}

/** Sigma (px) of the unsharp-mask reference blur at a given processing resolution. */
export function sharpenSigma(longSide: number): number {
  return Math.max(0.8, Math.min(2.2, longSide / 2600));
}

export interface UniformIntrospection {
  getUniformCount(): number;
  getUniformName(index: number): string;
  getUniform(index: number): { columns: number; rows: number; slot: number };
  getUniformFloatCount(): number;
}

/**
 * Packs named uniform values into the flat float array Skia expects, using the compiled
 * effect's own uniform table so declaration order can never drift from the JS side.
 */
export function packUniforms(effect: UniformIntrospection, values: Record<string, number[] | DenoiseUniforms[keyof DenoiseUniforms]>): number[] {
  const out = new Array<number>(effect.getUniformFloatCount()).fill(0);
  for (let i = 0; i < effect.getUniformCount(); i++) {
    const name = effect.getUniformName(i);
    const info = effect.getUniform(i);
    const size = info.columns * info.rows;
    const raw = values[name];
    if (raw == null) throw new Error(`Missing uniform "${name}"`);
    const list = typeof raw === 'number' ? [raw] : raw;
    if (list.length !== size) throw new Error(`Uniform "${name}" expects ${size} floats, got ${list.length}`);
    for (let k = 0; k < size; k++) out[info.slot + k] = list[k] ?? 0;
  }
  return out;
}
