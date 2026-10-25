/**
 * Minimal JPEG/EXIF support (no native dependency):
 * - read orientation and capture metadata for display and processing decisions;
 * - copy the original's EXIF block into processed JPEGs (which Skia encodes without metadata),
 *   with Orientation reset to 1 because the processed pixels are already upright.
 */

export interface ExifSummary {
  orientation: number;
  make?: string;
  model?: string;
  software?: string;
  dateTimeOriginal?: string;
  iso?: number;
  exposureTime?: number;
  fNumber?: number;
  focalLength?: number;
  focalLength35mm?: number;
  exposureBias?: number;
  flashFired?: boolean;
  pixelWidth?: number;
  pixelHeight?: number;
}

export interface ByteRange {
  start: number;
  end: number;
}

const TAG = {
  orientation: 0x0112,
  make: 0x010f,
  model: 0x0110,
  software: 0x0131,
  exifIfd: 0x8769,
  exposureTime: 0x829a,
  fNumber: 0x829d,
  iso: 0x8827,
  dateTimeOriginal: 0x9003,
  exposureBias: 0x9204,
  flash: 0x9209,
  focalLength: 0x920a,
  pixelWidth: 0xa002,
  pixelHeight: 0xa003,
  focalLength35mm: 0xa405,
} as const;

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

/** Locates the APP1 "Exif" segment (marker through end of payload). */
export function findExifSegment(jpeg: Uint8Array): ByteRange | null {
  if (!isJpeg(jpeg)) return null;
  let offset = 2;
  while (offset + 4 <= jpeg.length) {
    if (jpeg[offset] !== 0xff) return null;
    const marker = jpeg[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return null; // start of scan / end of image
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = ((jpeg[offset + 2] ?? 0) << 8) | (jpeg[offset + 3] ?? 0);
    if (length < 2 || offset + 2 + length > jpeg.length) return null;
    if (marker === 0xe1 && EXIF_HEADER.every((byte, i) => jpeg[offset + 4 + i] === byte)) {
      return { start: offset, end: offset + 2 + length };
    }
    offset += 2 + length;
  }
  return null;
}

class TiffView {
  constructor(
    readonly bytes: Uint8Array,
    /** Offset of the TIFF header inside `bytes`. */
    readonly base: number,
    readonly little: boolean,
  ) {}

  u16(at: number): number {
    const a = this.bytes[this.base + at] ?? 0;
    const b = this.bytes[this.base + at + 1] ?? 0;
    return this.little ? a | (b << 8) : (a << 8) | b;
  }

  u32(at: number): number {
    const b0 = this.bytes[this.base + at] ?? 0;
    const b1 = this.bytes[this.base + at + 1] ?? 0;
    const b2 = this.bytes[this.base + at + 2] ?? 0;
    const b3 = this.bytes[this.base + at + 3] ?? 0;
    const value = this.little ? b0 | (b1 << 8) | (b2 << 16) | (b3 << 24) : (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
    return value >>> 0;
  }

  i32(at: number): number {
    return this.u32(at) | 0;
  }

  setU16(at: number, value: number): void {
    const i = this.base + at;
    if (this.little) {
      this.bytes[i] = value & 0xff;
      this.bytes[i + 1] = (value >> 8) & 0xff;
    } else {
      this.bytes[i] = (value >> 8) & 0xff;
      this.bytes[i + 1] = value & 0xff;
    }
  }

  setU32(at: number, value: number): void {
    const i = this.base + at;
    const v = value >>> 0;
    if (this.little) {
      this.bytes[i] = v & 0xff;
      this.bytes[i + 1] = (v >>> 8) & 0xff;
      this.bytes[i + 2] = (v >>> 16) & 0xff;
      this.bytes[i + 3] = (v >>> 24) & 0xff;
    } else {
      this.bytes[i] = (v >>> 24) & 0xff;
      this.bytes[i + 1] = (v >>> 16) & 0xff;
      this.bytes[i + 2] = (v >>> 8) & 0xff;
      this.bytes[i + 3] = v & 0xff;
    }
  }

  get length(): number {
    return this.bytes.length - this.base;
  }
}

interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  /** Offset (relative to TIFF header) of the entry's 12-byte record. */
  entryOffset: number;
  /** Offset (relative to TIFF header) where the value bytes live. */
  valueOffset: number;
}

function openTiff(segment: Uint8Array, segmentStart = 0): TiffView | null {
  // segment layout: FF E1 len(2) "Exif\0\0" TIFF...
  const base = segmentStart + 10;
  if (base + 8 > segment.length) return null;
  const order = String.fromCharCode(segment[base] ?? 0, segment[base + 1] ?? 0);
  if (order !== 'II' && order !== 'MM') return null;
  const view = new TiffView(segment, base, order === 'II');
  if (view.u16(2) !== 0x2a) return null;
  return view;
}

function readIfd(view: TiffView, ifdOffset: number): { entries: IfdEntry[]; nextOffsetAt: number } | null {
  if (ifdOffset < 8 || ifdOffset + 2 > view.length) return null;
  const count = view.u16(ifdOffset);
  if (count > 512 || ifdOffset + 2 + count * 12 + 4 > view.length) return null;
  const entries: IfdEntry[] = [];
  for (let i = 0; i < count; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    const type = view.u16(entryOffset + 2);
    const valueCount = view.u32(entryOffset + 4);
    const size = (TYPE_SIZES[type] ?? 1) * valueCount;
    const valueOffset = size <= 4 ? entryOffset + 8 : view.u32(entryOffset + 8);
    if (size > 4 && valueOffset + size > view.length) continue;
    entries.push({ tag: view.u16(entryOffset), type, count: valueCount, entryOffset, valueOffset });
  }
  return { entries, nextOffsetAt: ifdOffset + 2 + count * 12 };
}

function readNumber(view: TiffView, entry: IfdEntry): number | undefined {
  switch (entry.type) {
    case 1:
    case 7:
      return view.bytes[view.base + entry.valueOffset];
    case 3:
      return view.u16(entry.valueOffset);
    case 4:
      return view.u32(entry.valueOffset);
    case 9:
      return view.i32(entry.valueOffset);
    case 5: {
      const den = view.u32(entry.valueOffset + 4);
      return den === 0 ? undefined : view.u32(entry.valueOffset) / den;
    }
    case 10: {
      const den = view.i32(entry.valueOffset + 4);
      return den === 0 ? undefined : view.i32(entry.valueOffset) / den;
    }
    default:
      return undefined;
  }
}

function readAscii(view: TiffView, entry: IfdEntry): string | undefined {
  if (entry.type !== 2) return undefined;
  let text = '';
  for (let i = 0; i < entry.count; i++) {
    const code = view.bytes[view.base + entry.valueOffset + i] ?? 0;
    if (code === 0) break;
    text += String.fromCharCode(code);
  }
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readExif(jpeg: Uint8Array): ExifSummary {
  const summary: ExifSummary = { orientation: 1 };
  const range = findExifSegment(jpeg);
  if (!range) return summary;
  const view = openTiff(jpeg, range.start);
  if (!view) return summary;
  const ifd0 = readIfd(view, view.u32(4));
  if (!ifd0) return summary;

  let exifIfdOffset: number | undefined;
  for (const entry of ifd0.entries) {
    if (entry.tag === TAG.orientation) {
      const value = readNumber(view, entry);
      if (value != null && value >= 1 && value <= 8) summary.orientation = value;
    } else if (entry.tag === TAG.make) summary.make = readAscii(view, entry);
    else if (entry.tag === TAG.model) summary.model = readAscii(view, entry);
    else if (entry.tag === TAG.software) summary.software = readAscii(view, entry);
    else if (entry.tag === TAG.exifIfd) exifIfdOffset = readNumber(view, entry);
  }

  const exif = exifIfdOffset != null ? readIfd(view, exifIfdOffset) : null;
  for (const entry of exif?.entries ?? []) {
    switch (entry.tag) {
      case TAG.exposureTime:
        summary.exposureTime = readNumber(view, entry);
        break;
      case TAG.fNumber:
        summary.fNumber = readNumber(view, entry);
        break;
      case TAG.iso:
        summary.iso = readNumber(view, entry);
        break;
      case TAG.dateTimeOriginal:
        summary.dateTimeOriginal = readAscii(view, entry);
        break;
      case TAG.exposureBias:
        summary.exposureBias = readNumber(view, entry);
        break;
      case TAG.flash: {
        const value = readNumber(view, entry);
        if (value != null) summary.flashFired = (value & 1) === 1;
        break;
      }
      case TAG.focalLength:
        summary.focalLength = readNumber(view, entry);
        break;
      case TAG.focalLength35mm:
        summary.focalLength35mm = readNumber(view, entry);
        break;
      case TAG.pixelWidth:
        summary.pixelWidth = readNumber(view, entry);
        break;
      case TAG.pixelHeight:
        summary.pixelHeight = readNumber(view, entry);
        break;
      default:
        break;
    }
  }
  return summary;
}

function patchNumber(view: TiffView, entry: IfdEntry, value: number): void {
  if (entry.type === 3) view.setU16(entry.valueOffset, value);
  else if (entry.type === 4) view.setU32(entry.valueOffset, value);
}

/**
 * Returns a copy of the original's APP1 segment that is valid for an upright processed image:
 * Orientation = 1, PixelX/YDimension = output size, and the IFD1 thumbnail unlinked
 * (it shows the old, unprocessed and possibly rotated frame).
 */
export function prepareExifForOutput(jpeg: Uint8Array, output: { width: number; height: number }): Uint8Array | null {
  const range = findExifSegment(jpeg);
  if (!range) return null;
  const segment = jpeg.slice(range.start, range.end);
  const view = openTiff(segment);
  if (!view) return null;
  const ifd0 = readIfd(view, view.u32(4));
  if (!ifd0) return null;

  let exifIfdOffset: number | undefined;
  for (const entry of ifd0.entries) {
    if (entry.tag === TAG.orientation) patchNumber(view, entry, 1);
    if (entry.tag === TAG.exifIfd) exifIfdOffset = readNumber(view, entry);
  }
  view.setU32(ifd0.nextOffsetAt, 0); // drop IFD1 (thumbnail)

  const exif = exifIfdOffset != null ? readIfd(view, exifIfdOffset) : null;
  for (const entry of exif?.entries ?? []) {
    if (entry.tag === TAG.pixelWidth) patchNumber(view, entry, output.width);
    if (entry.tag === TAG.pixelHeight) patchNumber(view, entry, output.height);
  }
  return segment;
}

/** Inserts `exifSegment` right after SOI, replacing any EXIF block already present. */
export function injectExif(jpeg: Uint8Array, exifSegment: Uint8Array): Uint8Array {
  if (!isJpeg(jpeg)) return jpeg;
  const existing = findExifSegment(jpeg);
  const head = jpeg.subarray(0, 2);
  const rest = existing
    ? concat(jpeg.subarray(2, existing.start), jpeg.subarray(existing.end))
    : jpeg.subarray(2);
  return concat(head, exifSegment, rest);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Stored pixel size from the JPEG frame header (SOFn marker). More reliable than EXIF
 * PixelX/YDimension, which some camera stacks omit. Null when no frame header is in `jpeg`.
 */
export function readJpegSize(jpeg: Uint8Array): { width: number; height: number } | null {
  if (!isJpeg(jpeg)) return null;
  let offset = 2;
  while (offset + 4 <= jpeg.length) {
    if (jpeg[offset] !== 0xff) return null;
    const marker = jpeg[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = ((jpeg[offset + 2] ?? 0) << 8) | (jpeg[offset + 3] ?? 0);
    const isFrameHeader = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader && offset + 9 <= jpeg.length) {
      const height = ((jpeg[offset + 5] ?? 0) << 8) | (jpeg[offset + 6] ?? 0);
      const width = ((jpeg[offset + 7] ?? 0) << 8) | (jpeg[offset + 8] ?? 0);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

/** Size of the image as displayed after applying the EXIF orientation. */
export function orientedSize(width: number, height: number, orientation: number): { width: number; height: number } {
  return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}

/**
 * Affine transform [a, b, c, d, tx, ty] mapping stored pixel (x, y) to display coordinates:
 * X = a·x + b·y + tx, Y = c·x + d·y + ty.
 */
export function orientationTransform(orientation: number, width: number, height: number): [number, number, number, number, number, number] {
  switch (orientation) {
    case 2:
      return [-1, 0, 0, 1, width, 0];
    case 3:
      return [-1, 0, 0, -1, width, height];
    case 4:
      return [1, 0, 0, -1, 0, height];
    case 5:
      return [0, 1, 1, 0, 0, 0];
    case 6:
      return [0, -1, 1, 0, height, 0];
    case 7:
      return [0, -1, -1, 0, height, width];
    case 8:
      return [0, 1, -1, 0, 0, width];
    default:
      return [1, 0, 0, 1, 0, 0];
  }
}

export function describeExposure(summary: ExifSummary): string | null {
  const parts: string[] = [];
  if (summary.exposureTime) {
    parts.push(summary.exposureTime >= 1 ? `${summary.exposureTime.toFixed(1)} s` : `1/${Math.round(1 / summary.exposureTime)} s`);
  }
  if (summary.fNumber) parts.push(`ƒ/${summary.fNumber.toFixed(1)}`);
  if (summary.iso) parts.push(`ISO ${Math.round(summary.iso)}`);
  if (summary.focalLength35mm) parts.push(`${summary.focalLength35mm} mm`);
  else if (summary.focalLength) parts.push(`${summary.focalLength.toFixed(1)} mm`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
