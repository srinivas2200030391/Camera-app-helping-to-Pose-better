/**
 * Runs the real SkSL pipeline on CanvasKit (Skia compiled to WASM) — the same shaders the app
 * runs on the phone's GPU. Optional: set POSELENS_SAMPLE_DIR to a folder of JPEGs to also write
 * before/after renders for every style into artifacts/test-output/ for visual review.
 */
import * as fs from 'fs';
import * as path from 'path';

import { AlphaType, ColorType, ImageFormat, Skia } from '@shopify/react-native-skia';

import { injectExif, readExif } from '../exif';
import { NEUTRAL_PARAMS, createRecipe, resolveParams, type PipelineParams } from '../params';
import { STYLES } from '../presets';
import {
  PreviewRenderer,
  ProcessingCancelledError,
  analyzeSource,
  computeGeometry,
  decodeSource,
  getEffects,
  planTiles,
  renderToJpeg,
} from '../renderer';
import { buildExifSegment } from './fixtures';

// CanvasKit renders on the CPU, so full pipeline runs take seconds rather than milliseconds.
jest.setTimeout(120_000);

const SCENE_SKSL = `
uniform float2 size;
uniform float3 tintMul;
uniform float noiseAmp;
half4 main(float2 p) {
  float2 uv = p / size;
  float3 c = uv.y < 0.5 ? mix(float3(0.50, 0.66, 0.92), float3(0.82, 0.88, 0.98), uv.y * 2.0) : float3(0.33, 0.42, 0.24);
  if (uv.x > 0.08 && uv.x < 0.32 && uv.y > 0.58 && uv.y < 0.82) c = float3(0.46);
  if (uv.x > 0.42 && uv.x < 0.62 && uv.y > 0.55 && uv.y < 0.86) c = float3(0.84, 0.62, 0.50);
  if (uv.x > 0.72 && uv.x < 0.9 && uv.y > 0.6 && uv.y < 0.8) c = float3(0.85, 0.15, 0.12);
  float n = fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453) - 0.5;
  c = c * tintMul + n * noiseAmp;
  return half4(half3(clamp(c, 0.0, 1.0)), 1.0);
}`;

function sceneJpeg(width: number, height: number, cast: [number, number, number] = [1, 1, 1], noiseAmp = 0.03): Uint8Array {
  const effect = Skia.RuntimeEffect.Make(SCENE_SKSL);
  if (!effect) throw new Error('scene shader failed to compile');
  const surface = Skia.Surface.Make(width, height);
  if (!surface) throw new Error('no surface');
  const paint = Skia.Paint();
  paint.setShader(effect.makeShader([width, height, ...cast, noiseAmp]));
  surface.getCanvas().drawPaint(paint);
  return surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, 95);
}

function decodePixels(jpeg: Uint8Array): { pixels: Uint8Array; width: number; height: number } {
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(jpeg));
  if (!image) throw new Error('decode failed');
  const width = image.width();
  const height = image.height();
  const pixels = image.readPixels(0, 0, { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  if (!(pixels instanceof Uint8Array)) throw new Error('readPixels failed');
  return { pixels, width, height };
}

function regionMean(img: { pixels: Uint8Array; width: number; height: number }, x0: number, y0: number, x1: number, y1: number) {
  const sum = [0, 0, 0];
  let n = 0;
  for (let y = Math.floor(img.height * y0); y < Math.floor(img.height * y1); y++) {
    for (let x = Math.floor(img.width * x0); x < Math.floor(img.width * x1); x++) {
      const o = (y * img.width + x) * 4;
      sum[0]! += img.pixels[o]!;
      sum[1]! += img.pixels[o + 1]!;
      sum[2]! += img.pixels[o + 2]!;
      n++;
    }
  }
  return sum.map((s) => s / n) as [number, number, number];
}

function diffStats(a: Uint8Array, b: Uint8Array) {
  let total = 0;
  let max = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (i % 4 === 3) continue;
    const d = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    total += d;
    max = Math.max(max, d);
    n++;
  }
  return { mean: total / n, max };
}

async function render(jpeg: Uint8Array, params: PipelineParams, extra: Parameters<typeof renderToJpeg>[2] = {}) {
  const source = decodeSource(jpeg);
  const output = await renderToJpeg(source, params, { quality: 0.95, ...extra });
  return { output, decoded: decodePixels(output.jpeg) };
}

describe('Skia processing pipeline (CanvasKit)', () => {
  it('compiles every shader', () => {
    expect(() => getEffects()).not.toThrow();
  });

  it('plans tiles that cover the image exactly once', () => {
    const tiles = planTiles(5000, 3001, 2048);
    expect(tiles).toHaveLength(6);
    expect(tiles.reduce((area, t) => area + t.width * t.height, 0)).toBe(5000 * 3001);
  });

  it('computes centre crops for each aspect in either orientation', () => {
    expect(computeGeometry(3000, 4000, '1:1', 4096)).toMatchObject({ width: 3000, height: 3000, cropY: 500 });
    expect(computeGeometry(4000, 3000, '16:9', 4096)).toMatchObject({ width: 4000, height: 2250 });
    expect(computeGeometry(3000, 4000, '16:9', 4096)).toMatchObject({ width: 2250, height: 4000 });
    expect(computeGeometry(8000, 6000, null, 4096)).toMatchObject({ width: 4096, height: 3072 });
  });

  it('neutral parameters reproduce the input (only JPEG/dither noise)', async () => {
    const input = sceneJpeg(320, 240);
    const { decoded, output } = await render(input, NEUTRAL_PARAMS);
    expect([output.width, output.height]).toEqual([320, 240]);
    const { mean } = diffStats(decodePixels(input).pixels, decoded.pixels);
    expect(mean).toBeLessThan(2.5);
  });

  it('tiled rendering is seamless (multi-tile equals single-tile)', async () => {
    const input = sceneJpeg(300, 220, [1, 1, 1], 0.06);
    const params = resolveParams(createRecipe('landscape', { luminanceNoise: 30, colorNoise: 40 }));
    const single = await render(input, params, { tileSize: 4096 });
    const tiled = await render(input, params, { tileSize: 64 });
    const { mean, max } = diffStats(single.decoded.pixels, tiled.decoded.pixels);
    expect(mean).toBeLessThan(0.5);
    expect(max).toBeLessThanOrEqual(8);
  });

  it('applies EXIF orientation (rotate 90° clockwise)', async () => {
    // Stored image 80×60 with a red block at the stored top-left.
    const surface = Skia.Surface.Make(80, 60)!;
    const canvas = surface.getCanvas();
    const paint = Skia.Paint();
    paint.setColor(Skia.Color('#808080'));
    canvas.drawRect(Skia.XYWHRect(0, 0, 80, 60), paint);
    paint.setColor(Skia.Color('#ff0000'));
    canvas.drawRect(Skia.XYWHRect(0, 0, 20, 20), paint);
    const jpeg = injectExif(surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, 95), buildExifSegment({ orientation: 6 }));

    const source = decodeSource(jpeg);
    expect([source.width, source.height]).toEqual([60, 80]);
    const { decoded, output } = await render(jpeg, NEUTRAL_PARAMS);
    expect([output.width, output.height]).toEqual([60, 80]);
    const topRight = regionMean(decoded, 0.8, 0.0, 1.0, 0.2);
    const topLeft = regionMean(decoded, 0.0, 0.0, 0.2, 0.2);
    expect(topRight[0]).toBeGreaterThan(200);
    expect(topRight[1]).toBeLessThan(60);
    expect(topLeft[0]).toBeLessThan(160);
    expect(readExif(output.jpeg).orientation).toBe(1);
  });

  it('crops to 1:1 on output', async () => {
    const { output } = await render(sceneJpeg(320, 240), NEUTRAL_PARAMS, { crop: '1:1' });
    expect([output.width, output.height]).toEqual([240, 240]);
  });

  it('auto white balance moves a cast grey card toward neutral', async () => {
    const input = sceneJpeg(320, 240, [0.82, 0.95, 1.25], 0.01);
    const source = decodeSource(input);
    const { auto } = analyzeSource(source);
    expect(auto.temperature).toBeGreaterThan(0);
    // Only the white-balance correction, so other look adjustments cannot mask its direction.
    const { decoded } = await render(input, { ...NEUTRAL_PARAMS, temperature: auto.temperature ?? 0, tint: auto.tint ?? 0 });
    const card = (img: ReturnType<typeof decodePixels>) => regionMean(img, 0.1, 0.6, 0.3, 0.8);
    const spread = ([r, , b]: [number, number, number]) => Math.abs(b - r);
    expect(spread(card(decoded))).toBeLessThan(spread(card(decodePixels(input))));
  });

  it('noise reduction lowers noise on a flat patch', async () => {
    const input = sceneJpeg(320, 240, [1, 1, 1], 0.12);
    const stdDev = (img: ReturnType<typeof decodePixels>) => {
      const values: number[] = [];
      for (let y = Math.floor(img.height * 0.62); y < Math.floor(img.height * 0.78); y++) {
        for (let x = Math.floor(img.width * 0.1); x < Math.floor(img.width * 0.3); x++) values.push(img.pixels[(y * img.width + x) * 4 + 1]!);
      }
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    };
    const params = { ...NEUTRAL_PARAMS, luminanceNoise: 80, colorNoise: 80 };
    const { decoded } = await render(input, params);
    expect(stdDev(decoded)).toBeLessThan(stdDev(decodePixels(input)) * 0.75);
  });

  it.each(STYLES.map((style) => style.id))('style "%s" renders a plausible image', async (styleId) => {
    const input = sceneJpeg(240, 180);
    const source = decodeSource(input);
    const recipe = createRecipe(styleId, analyzeSource(source).auto);
    const { decoded } = await render(input, resolveParams(recipe));
    const [r, g, b] = regionMean(decoded, 0, 0, 1, 1);
    for (const channel of [r, g, b]) {
      expect(Number.isFinite(channel)).toBe(true);
      expect(channel).toBeGreaterThan(20);
      expect(channel).toBeLessThan(240);
    }
    if (styleId === 'mono') {
      expect(Math.abs(r - g)).toBeLessThan(3);
      expect(Math.abs(g - b)).toBeLessThan(3);
    }
  });

  it('preview renderer matches the full-resolution render at the same size', async () => {
    const input = sceneJpeg(320, 240);
    const params = resolveParams(createRecipe('cinematic'));
    const preview = new PreviewRenderer(decodeSource(input), null, 320);
    const previewImage = preview.render(params);
    const previewPixels = previewImage.readPixels(0, 0, { width: 320, height: 240, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul }) as Uint8Array;
    const { decoded } = await render(input, params, { quality: 1 });
    expect(diffStats(previewPixels, decoded.pixels).mean).toBeLessThan(2.5);
    preview.dispose();
  });

  it('copies capture metadata into the output and honours keepMetadata=false', async () => {
    const jpeg = injectExif(sceneJpeg(160, 120), buildExifSegment({ iso: 800, orientation: 1 }));
    const kept = await renderToJpeg(decodeSource(jpeg), NEUTRAL_PARAMS);
    expect(readExif(kept.jpeg).iso).toBe(800);
    const stripped = await renderToJpeg(decodeSource(jpeg), NEUTRAL_PARAMS, { keepMetadata: false });
    expect(readExif(stripped.jpeg).iso).toBeUndefined();
  });

  it('can be cancelled and reports progress', async () => {
    const source = decodeSource(sceneJpeg(200, 150));
    await expect(renderToJpeg(source, NEUTRAL_PARAMS, { cancel: { cancelled: true } })).rejects.toBeInstanceOf(ProcessingCancelledError);
    const stages: string[] = [];
    await renderToJpeg(source, NEUTRAL_PARAMS, { onProgress: (_f, stage) => stages.push(stage) });
    expect(stages).toEqual(expect.arrayContaining(['prepare', 'render', 'encode']));
  });

  const sampleDir = process.env.POSELENS_SAMPLE_DIR;
  (sampleDir ? it : it.skip)('writes before/after renders for visual review', async () => {
    const outDir = path.resolve(__dirname, '../../../artifacts/test-output');
    fs.mkdirSync(outDir, { recursive: true });
    const files = fs.readdirSync(sampleDir as string).filter((f) => /\.jpe?g$/i.test(f)).slice(0, 3);
    for (const file of files) {
      const bytes = new Uint8Array(fs.readFileSync(path.join(sampleDir as string, file)));
      const source = decodeSource(bytes);
      const { auto, stats } = analyzeSource(source);
      fs.writeFileSync(path.join(outDir, `${path.parse(file).name}-analysis.json`), JSON.stringify({ auto, stats }, null, 2));
      for (const style of STYLES) {
        const output = await renderToJpeg(source, resolveParams(createRecipe(style.id, auto)), { maxDimension: Number(process.env.POSELENS_SAMPLE_SIZE ?? 900) });
        fs.writeFileSync(path.join(outDir, `${path.parse(file).name}-${style.id}.jpg`), output.jpeg);
      }
      const original = await renderToJpeg(source, NEUTRAL_PARAMS, { maxDimension: Number(process.env.POSELENS_SAMPLE_SIZE ?? 900) });
      fs.writeFileSync(path.join(outDir, `${path.parse(file).name}-original.jpg`), original.jpeg);
    }
  }, 600_000);
});
