/** Builds EXIF APP1 segments and fake JPEG containers for tests. */

export interface ExifFixture {
  orientation?: number;
  make?: string;
  iso?: number;
  exposureTime?: [number, number];
  fNumber?: [number, number];
  pixelWidth?: number;
  pixelHeight?: number;
  littleEndian?: boolean;
  withThumbnailIfd?: boolean;
}

type Entry = { tag: number; type: number; count: number; value: number[] | string; inline?: boolean };

class Writer {
  bytes: number[] = [];
  constructor(private little: boolean) {}
  u16(v: number) {
    if (this.little) this.bytes.push(v & 0xff, (v >> 8) & 0xff);
    else this.bytes.push((v >> 8) & 0xff, v & 0xff);
  }
  u32(v: number) {
    const b = [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
    this.bytes.push(...(this.little ? b.reverse() : b));
  }
}

const TYPE_SIZE: Record<number, number> = { 2: 1, 3: 2, 4: 4, 5: 8 };

function entrySize(entry: Entry): number {
  return (TYPE_SIZE[entry.type] ?? 1) * entry.count;
}

/** Lays out IFDs sequentially: IFD0, ExifIFD, optional IFD1, then the data area. */
export function buildExifSegment(fixture: ExifFixture = {}): Uint8Array {
  const little = fixture.littleEndian ?? true;
  const make = `${fixture.make ?? 'TestCam'}\0`;
  const ifd0: Entry[] = [
    { tag: 0x010f, type: 2, count: make.length, value: make },
    { tag: 0x0112, type: 3, count: 1, value: [fixture.orientation ?? 1] },
    { tag: 0x8769, type: 4, count: 1, value: [0] }, // patched below
  ];
  const exif: Entry[] = [
    { tag: 0x829a, type: 5, count: 1, value: fixture.exposureTime ?? [1, 120] },
    { tag: 0x829d, type: 5, count: 1, value: fixture.fNumber ?? [18, 10] },
    { tag: 0x8827, type: 3, count: 1, value: [fixture.iso ?? 400] },
    { tag: 0xa002, type: 4, count: 1, value: [fixture.pixelWidth ?? 4000] },
    { tag: 0xa003, type: 4, count: 1, value: [fixture.pixelHeight ?? 3000] },
  ];
  const ifd1: Entry[] = [{ tag: 0x0103, type: 3, count: 1, value: [6] }];

  const ifdBytes = (entries: Entry[]) => 2 + entries.length * 12 + 4;
  const ifd0Offset = 8;
  const exifOffset = ifd0Offset + ifdBytes(ifd0);
  const ifd1Offset = exifOffset + ifdBytes(exif);
  let dataOffset = ifd1Offset + (fixture.withThumbnailIfd ? ifdBytes(ifd1) : 0);
  (ifd0[2] as Entry).value = [exifOffset];

  const w = new Writer(little);
  const data: number[] = [];
  const dataStart = dataOffset;
  const writeIfd = (entries: Entry[], next: number) => {
    w.u16(entries.length);
    for (const entry of entries) {
      w.u16(entry.tag);
      w.u16(entry.type);
      w.u32(entry.count);
      const size = entrySize(entry);
      if (size <= 4) {
        const before = w.bytes.length;
        if (entry.type === 3) w.u16((entry.value as number[])[0] ?? 0);
        else if (entry.type === 4) w.u32((entry.value as number[])[0] ?? 0);
        else if (entry.type === 2) for (const ch of entry.value as string) w.bytes.push(ch.charCodeAt(0));
        while (w.bytes.length - before < 4) w.bytes.push(0);
      } else {
        w.u32(dataOffset);
        const dw = new Writer(little);
        if (entry.type === 2) for (const ch of entry.value as string) dw.bytes.push(ch.charCodeAt(0));
        if (entry.type === 5) {
          const [num, den] = entry.value as number[];
          dw.u32(num ?? 0);
          dw.u32(den ?? 1);
        }
        data.push(...dw.bytes);
        dataOffset += dw.bytes.length;
      }
    }
    w.u32(next);
  };

  // TIFF header
  w.bytes.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]));
  w.u16(0x2a);
  w.u32(ifd0Offset);
  writeIfd(ifd0, fixture.withThumbnailIfd ? ifd1Offset : 0);
  writeIfd(exif, 0);
  if (fixture.withThumbnailIfd) writeIfd(ifd1, 0);
  if (w.bytes.length !== dataStart) throw new Error(`fixture layout error ${w.bytes.length} != ${dataStart}`);
  const tiff = [...w.bytes, ...data];

  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const length = payload.length + 2;
  return Uint8Array.from([0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...payload]);
}

/**
 * SOI + optional APP0 + optional EXIF + optional SOF0 frame header + fake scan + EOI.
 * Not decodable, but structurally valid.
 */
export function fakeJpeg(exif?: Uint8Array, withJfif = true, size?: { width: number; height: number }): Uint8Array {
  const parts: number[] = [0xff, 0xd8];
  if (withJfif) parts.push(0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0);
  if (exif) parts.push(...exif);
  if (size) {
    parts.push(0xff, 0xc0, 0x00, 0x11, 0x08, (size.height >> 8) & 0xff, size.height & 0xff, (size.width >> 8) & 0xff, size.width & 0xff);
    parts.push(0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01);
  }
  parts.push(0xff, 0xda, 0x00, 0x04, 0x00, 0x00, 0x12, 0x34, 0x56, 0xff, 0xd9);
  return Uint8Array.from(parts);
}
