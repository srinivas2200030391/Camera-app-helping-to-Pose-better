/**
 * Skia processing engine.
 *
 * The same code path renders the interactive preview (one tile, ≤1440 px proxy) and the
 * full-resolution export (2048 px tiles with overlap), so what the user approves is what is saved.
 * Runs on the GPU on device (offscreen surfaces) and on CanvasKit's CPU backend in Jest.
 */
import {
  AlphaType,
  ColorType,
  FilterMode,
  ImageFormat,
  MipmapMode,
  Skia,
  TileMode,
  type SkCanvas,
  type SkImage,
  type SkRuntimeEffect,
  type SkSurface,
} from '@shopify/react-native-skia';

import { analyzeScene, type AnalysisResult } from './analysis';
import { injectExif, orientationTransform, prepareExifForOutput, readExif, type ExifSummary } from './exif';
import type { CropAspect, PipelineParams } from './params';
import {
  BASE_SKSL,
  DENOISE_SKSL,
  MAIN_SKSL,
  denoiseUniforms,
  mainUniforms,
  needsDenoise,
  packUniforms,
  sharpenSigma,
} from './shaders';

export const MAX_PROCESSING_DIMENSION = 4096;
export const PREVIEW_DIMENSION = 1440;
const TILE_SIZE = 2048;
const TILE_PADDING = 24;
const BASE_DIMENSION = 384;
const ANALYSIS_DIMENSION = 112;

export class ProcessingCancelledError extends Error {
  constructor() {
    super('Processing cancelled');
    this.name = 'ProcessingCancelledError';
  }
}

export interface CancelToken {
  cancelled: boolean;
}

export type ProcessingStage = 'decode' | 'analyze' | 'prepare' | 'render' | 'encode';

export type ProgressCallback = (fraction: number, stage: ProcessingStage) => void;

interface Effects {
  denoise: SkRuntimeEffect;
  base: SkRuntimeEffect;
  main: SkRuntimeEffect;
}

let cachedEffects: Effects | null = null;

function compile(source: string, name: string): SkRuntimeEffect {
  const effect = Skia.RuntimeEffect.Make(source);
  if (!effect) throw new Error(`Failed to compile ${name} shader`);
  return effect;
}

export function getEffects(): Effects {
  cachedEffects ??= {
    denoise: compile(DENOISE_SKSL, 'denoise'),
    base: compile(BASE_SKSL, 'base'),
    main: compile(MAIN_SKSL, 'main'),
  };
  return cachedEffects;
}

/** Releases native memory right away instead of waiting for the JS garbage collector. */
function release(...objects: ({ dispose?: () => void } | null | undefined)[]): void {
  for (const object of objects) {
    try {
      object?.dispose?.();
    } catch {
      // Already released.
    }
  }
}

function makeSurface(width: number, height: number): SkSurface {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
  if (!surface) throw new Error(`Could not allocate a ${w}×${h} drawing surface`);
  return surface;
}

function snapshot(surface: SkSurface): SkImage {
  surface.flush();
  return surface.makeImageSnapshot();
}

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function checkCancelled(token?: CancelToken): void {
  if (token?.cancelled) throw new ProcessingCancelledError();
}

export interface SourceImage {
  image: SkImage;
  bytes: Uint8Array;
  exif: ExifSummary;
  /** Pixel size of `image` as decoded. */
  storedWidth: number;
  storedHeight: number;
  /** EXIF orientation still to be applied when drawing `image` (1 = already upright). */
  drawOrientation: number;
  /** Upright size. */
  width: number;
  height: number;
}

export function decodeSource(bytes: Uint8Array): SourceImage {
  const data = Skia.Data.fromBytes(bytes);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('This file could not be decoded as an image');
  const exif = readExif(bytes);
  // Skia's deferred decoder (SkCodecImageGenerator) applies the EXIF origin itself, so the
  // decoded pixels are already upright on both the native and CanvasKit builds (verified by
  // renderer.skia.test.ts). EXIF orientation is kept as metadata only.
  const width = image.width();
  const height = image.height();
  return { image, bytes, exif, storedWidth: width, storedHeight: height, drawOrientation: 1, width, height };
}

export interface OutputGeometry {
  /** Display-space crop rectangle (before scaling). */
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  scale: number;
  width: number;
  height: number;
}

export function computeGeometry(sourceWidth: number, sourceHeight: number, crop: CropAspect, maxDimension: number): OutputGeometry {
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  if (crop) {
    const [a, b] = crop.split(':').map(Number) as [number, number];
    const ratio = Math.max(a, b) / Math.min(a, b);
    const portrait = sourceHeight >= sourceWidth;
    const targetWOverH = portrait ? 1 / ratio : ratio;
    if (sourceWidth / sourceHeight > targetWOverH) cropWidth = Math.round(sourceHeight * targetWOverH);
    else cropHeight = Math.round(sourceWidth / targetWOverH);
  }
  const scale = Math.min(1, maxDimension / Math.max(cropWidth, cropHeight));
  return {
    cropX: Math.floor((sourceWidth - cropWidth) / 2),
    cropY: Math.floor((sourceHeight - cropHeight) / 2),
    cropWidth,
    cropHeight,
    scale,
    width: Math.max(1, Math.round(cropWidth * scale)),
    height: Math.max(1, Math.round(cropHeight * scale)),
  };
}

/**
 * Draws the oriented, cropped and scaled source so that output pixel (x, y) lands at
 * (x - originX, y - originY) on `canvas`.
 */
function drawSource(canvas: SkCanvas, source: SourceImage, geometry: OutputGeometry, originX: number, originY: number, outputScale = 1): void {
  const [a, b, c, d, tx, ty] = orientationTransform(source.drawOrientation, source.storedWidth, source.storedHeight);
  const scale = geometry.scale * outputScale;
  canvas.save();
  canvas.translate(-originX, -originY);
  canvas.scale(scale, scale);
  canvas.translate(-geometry.cropX, -geometry.cropY);
  canvas.concat([a, b, tx, c, d, ty, 0, 0, 1]);
  const rect = Skia.XYWHRect(0, 0, source.storedWidth, source.storedHeight);
  const mipmap = scale < 0.5 ? MipmapMode.Linear : MipmapMode.None;
  canvas.drawImageRectOptions(source.image, rect, rect, FilterMode.Linear, mipmap, null);
  canvas.restore();
}

function readRgba(image: SkImage, width: number, height: number): Uint8Array {
  const pixels = image.readPixels(0, 0, {
    width,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!pixels || !(pixels instanceof Uint8Array)) throw new Error('Could not read pixels back from the GPU');
  return pixels;
}

/** Scene statistics from a tiny copy of the (cropped) image. */
export function analyzeSource(source: SourceImage, crop: CropAspect = null): AnalysisResult {
  const geometry = computeGeometry(source.width, source.height, crop, ANALYSIS_DIMENSION);
  const surface = makeSurface(geometry.width, geometry.height);
  let image: SkImage | null = null;
  try {
    drawSource(surface.getCanvas(), source, geometry, 0, 0);
    image = snapshot(surface);
    const pixels = readRgba(image, geometry.width, geometry.height);
    return analyzeScene({ pixels, width: geometry.width, height: geometry.height, iso: source.exif.iso ?? null });
  } finally {
    release(image, surface);
  }
}

/** Low-resolution blurred luminance + dark channel used for local tone and dehaze. */
function buildBaseLayer(source: SourceImage, geometry: OutputGeometry, effects: Effects): { image: SkImage; scaleX: number; scaleY: number } {
  const factor = Math.min(1, BASE_DIMENSION / Math.max(geometry.width, geometry.height));
  const width = Math.max(1, Math.round(geometry.width * factor));
  const height = Math.max(1, Math.round(geometry.height * factor));
  const small = makeSurface(width, height);
  const prepared = makeSurface(width, height);
  const blurredSurface = makeSurface(width, height);
  let smallImage: SkImage | null = null;
  let preparedImage: SkImage | null = null;
  try {
    drawSource(small.getCanvas(), source, geometry, 0, 0, factor);
    smallImage = snapshot(small);
    const paint = Skia.Paint();
    paint.setShader(
      effects.base.makeShaderWithChildren([], [smallImage.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None)]),
    );
    prepared.getCanvas().drawPaint(paint);
    preparedImage = snapshot(prepared);
    const blurPaint = Skia.Paint();
    const sigma = Math.max(width, height) / 48;
    blurPaint.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Clamp, null));
    blurredSurface.getCanvas().drawImage(preparedImage, 0, 0, blurPaint);
    return { image: snapshot(blurredSurface), scaleX: width / geometry.width, scaleY: height / geometry.height };
  } finally {
    release(smallImage, preparedImage, small, prepared);
  }
}

interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function planTiles(width: number, height: number, tileSize = TILE_SIZE): TileRect[] {
  const tiles: TileRect[] = [];
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      tiles.push({ x, y, width: Math.min(tileSize, width - x), height: Math.min(tileSize, height - y) });
    }
  }
  return tiles;
}

interface RenderContext {
  source: SourceImage;
  geometry: OutputGeometry;
  params: PipelineParams;
  effects: Effects;
  base: { image: SkImage; scaleX: number; scaleY: number };
}

/** Renders one padded tile and returns a CPU-backed image of the padded area. */
function renderTile(context: RenderContext, padded: TileRect): SkImage {
  const { source, geometry, params, effects, base } = context;
  const longSide = Math.max(geometry.width, geometry.height);
  const sourceSurface = makeSurface(padded.width, padded.height);
  const denoiseSurface = makeSurface(padded.width, padded.height);
  const blurSurface = makeSurface(padded.width, padded.height);
  const finalSurface = makeSurface(padded.width, padded.height);
  const images: SkImage[] = [];
  const clampShader = (image: SkImage) => image.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Nearest, MipmapMode.None);
  try {
    drawSource(sourceSurface.getCanvas(), source, geometry, padded.x, padded.y);
    const sourceImage = snapshot(sourceSurface);
    images.push(sourceImage);

    let denoised = sourceImage;
    if (needsDenoise(params)) {
      const paint = Skia.Paint();
      const uniforms = packUniforms(effects.denoise, { ...denoiseUniforms(params, longSide) });
      paint.setShader(effects.denoise.makeShaderWithChildren(uniforms, [clampShader(sourceImage)]));
      denoiseSurface.getCanvas().drawPaint(paint);
      denoised = snapshot(denoiseSurface);
      images.push(denoised);
    }

    const blurPaint = Skia.Paint();
    const sigma = sharpenSigma(longSide);
    blurPaint.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Clamp, null));
    blurSurface.getCanvas().drawImage(denoised, 0, 0, blurPaint);
    const blurred = snapshot(blurSurface);
    images.push(blurred);

    const uniforms = packUniforms(
      effects.main,
      mainUniforms(params, {
        tileOrigin: [padded.x, padded.y],
        imageSize: [geometry.width, geometry.height],
        baseScale: [base.scaleX, base.scaleY],
      }),
    );
    const baseShader = base.image.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None);
    const paint = Skia.Paint();
    paint.setShader(effects.main.makeShaderWithChildren(uniforms, [clampShader(denoised), clampShader(blurred), baseShader]));
    finalSurface.getCanvas().drawPaint(paint);
    const result = snapshot(finalSurface);
    images.push(result);
    const cpu = result.makeNonTextureImage();
    if (!cpu) throw new Error('Could not read the processed tile back from the GPU');
    return cpu;
  } finally {
    release(...images, sourceSurface, denoiseSurface, blurSurface, finalSurface);
  }
}

export interface RenderOptions {
  crop?: CropAspect;
  maxDimension?: number;
  /** JPEG quality 0..1 */
  quality?: number;
  keepMetadata?: boolean;
  onProgress?: ProgressCallback;
  cancel?: CancelToken;
  /** Tile edge in output pixels; exposed so tests can force multi-tile renders. */
  tileSize?: number;
}

export interface RenderOutput {
  jpeg: Uint8Array;
  width: number;
  height: number;
  durationMs: number;
}

/** Full-resolution render to an encoded JPEG (with the original's EXIF when requested). */
export async function renderToJpeg(source: SourceImage, params: PipelineParams, options: RenderOptions = {}): Promise<RenderOutput> {
  const started = Date.now();
  const { onProgress, cancel } = options;
  const effects = getEffects();
  const geometry = computeGeometry(source.width, source.height, options.crop ?? null, options.maxDimension ?? MAX_PROCESSING_DIMENSION);
  onProgress?.(0.05, 'prepare');
  const base = buildBaseLayer(source, geometry, effects);
  const output = Skia.Surface.Make(geometry.width, geometry.height);
  if (!output) {
    release(base.image);
    throw new Error('Not enough memory to allocate the output image');
  }
  try {
    const tiles = planTiles(geometry.width, geometry.height, options.tileSize);
    const context: RenderContext = { source, geometry, params, effects, base };
    for (let index = 0; index < tiles.length; index++) {
      checkCancelled(cancel);
      await yieldToUi();
      const tile = tiles[index] as TileRect;
      const padded = padTile(tile, geometry.width, geometry.height, TILE_PADDING);
      const rendered = renderTile(context, padded);
      try {
        const inner = Skia.XYWHRect(tile.x - padded.x, tile.y - padded.y, tile.width, tile.height);
        const target = Skia.XYWHRect(tile.x, tile.y, tile.width, tile.height);
        output.getCanvas().drawImageRectOptions(rendered, inner, target, FilterMode.Nearest, MipmapMode.None, null);
      } finally {
        release(rendered);
      }
      onProgress?.(0.1 + 0.7 * ((index + 1) / tiles.length), 'render');
    }
    checkCancelled(cancel);
    onProgress?.(0.82, 'encode');
    await yieldToUi();
    const outImage = snapshot(output);
    let jpeg: Uint8Array;
    try {
      jpeg = outImage.encodeToBytes(ImageFormat.JPEG, Math.round((options.quality ?? 0.95) * 100));
    } finally {
      release(outImage);
    }
    if (!jpeg || jpeg.length === 0) throw new Error('JPEG encoding failed');
    if (options.keepMetadata !== false) {
      const exif = prepareExifForOutput(source.bytes, { width: geometry.width, height: geometry.height });
      if (exif) jpeg = injectExif(jpeg, exif);
    }
    onProgress?.(0.95, 'encode');
    return { jpeg, width: geometry.width, height: geometry.height, durationMs: Date.now() - started };
  } finally {
    release(base.image, output);
  }
}

function padTile(tile: TileRect, width: number, height: number, padding: number): TileRect {
  const x = Math.max(0, tile.x - padding);
  const y = Math.max(0, tile.y - padding);
  const right = Math.min(width, tile.x + tile.width + padding);
  const bottom = Math.min(height, tile.y + tile.height + padding);
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Interactive preview renderer: decodes once, keeps a ≤1440 px proxy and its base layer, and
 * re-renders the full pipeline on every parameter change (~10–40 ms on a mid-range GPU).
 */
export class PreviewRenderer {
  private proxy: SourceImage;
  private geometry: OutputGeometry;
  private base: { image: SkImage; scaleX: number; scaleY: number } | null = null;
  private disposed = false;

  constructor(
    source: SourceImage,
    private crop: CropAspect = null,
    maxDimension = PREVIEW_DIMENSION,
  ) {
    // Bake orientation + downscale into a small upright proxy once.
    const geometry = computeGeometry(source.width, source.height, crop, maxDimension);
    const surface = makeSurface(geometry.width, geometry.height);
    let snap: SkImage | null = null;
    try {
      drawSource(surface.getCanvas(), source, geometry, 0, 0);
      snap = snapshot(surface);
      const image = snap.makeNonTextureImage();
      if (!image) throw new Error('Could not prepare the preview image');
      this.proxy = {
        image,
        bytes: source.bytes,
        exif: source.exif,
        storedWidth: geometry.width,
        storedHeight: geometry.height,
        drawOrientation: 1,
        width: geometry.width,
        height: geometry.height,
      };
      this.geometry = computeGeometry(geometry.width, geometry.height, null, maxDimension);
    } finally {
      release(snap, surface);
    }
  }

  get width(): number {
    return this.geometry.width;
  }

  get height(): number {
    return this.geometry.height;
  }

  get cropAspect(): CropAspect {
    return this.crop;
  }

  /** Unprocessed proxy (for before/after comparison). */
  get original(): SkImage {
    return this.proxy.image;
  }

  /** Scene analysis on the proxy (already cropped and upright) — cheap and consistent with the preview. */
  analyze(): AnalysisResult {
    return analyzeSource(this.proxy, null);
  }

  render(params: PipelineParams): SkImage {
    if (this.disposed) throw new Error('Preview renderer was disposed');
    const effects = getEffects();
    this.base ??= buildBaseLayer(this.proxy, this.geometry, effects);
    return renderTile(
      { source: this.proxy, geometry: this.geometry, params, effects, base: this.base },
      { x: 0, y: 0, width: this.geometry.width, height: this.geometry.height },
    );
  }

  /** Releases internal GPU resources. The proxy (`original`) may still be on screen, so it is left to the GC. */
  dispose(): void {
    this.disposed = true;
    release(this.base?.image);
    this.base = null;
  }
}
