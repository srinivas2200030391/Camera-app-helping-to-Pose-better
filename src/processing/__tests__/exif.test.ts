import {
  describeExposure,
  findExifSegment,
  injectExif,
  orientationTransform,
  orientedSize,
  prepareExifForOutput,
  readExif,
  readJpegSize,
} from '../exif';
import { buildExifSegment, fakeJpeg } from './fixtures';

describe('readExif', () => {
  it.each([true, false])('parses IFD0 and Exif IFD (little endian: %s)', (littleEndian) => {
    const jpeg = fakeJpeg(buildExifSegment({ littleEndian, orientation: 6, make: 'Pixelish', iso: 800, exposureTime: [1, 250], fNumber: [17, 10] }));
    const exif = readExif(jpeg);
    expect(exif.orientation).toBe(6);
    expect(exif.make).toBe('Pixelish');
    expect(exif.iso).toBe(800);
    expect(exif.exposureTime).toBeCloseTo(1 / 250);
    expect(exif.fNumber).toBeCloseTo(1.7);
    expect(exif.pixelWidth).toBe(4000);
    expect(exif.pixelHeight).toBe(3000);
  });

  it('defaults to orientation 1 without EXIF or for non-JPEG data', () => {
    expect(readExif(fakeJpeg()).orientation).toBe(1);
    expect(readExif(new Uint8Array([1, 2, 3, 4, 5])).orientation).toBe(1);
    expect(findExifSegment(new Uint8Array(0))).toBeNull();
  });

  it('ignores truncated segments safely', () => {
    const jpeg = fakeJpeg(buildExifSegment({ orientation: 3 }));
    const truncated = jpeg.slice(0, 40);
    expect(() => readExif(truncated)).not.toThrow();
  });

  it('formats a human-readable exposure summary', () => {
    const exif = readExif(fakeJpeg(buildExifSegment({ iso: 100, exposureTime: [1, 60], fNumber: [2, 1] })));
    expect(describeExposure(exif)).toBe('1/60 s · ƒ/2.0 · ISO 100');
  });
});

describe('readJpegSize', () => {
  it('reads the stored size from the frame header, after APP segments', () => {
    expect(readJpegSize(fakeJpeg(buildExifSegment({ orientation: 6 }), true, { width: 4032, height: 3024 }))).toEqual({ width: 4032, height: 3024 });
  });

  it('returns null without a frame header or for non-JPEG data', () => {
    expect(readJpegSize(fakeJpeg())).toBeNull();
    expect(readJpegSize(new Uint8Array([0, 1, 2, 3]))).toBeNull();
  });
});

describe('prepareExifForOutput + injectExif', () => {
  it.each([true, false])('normalises orientation, patches dimensions and unlinks the thumbnail (LE: %s)', (littleEndian) => {
    const source = fakeJpeg(buildExifSegment({ littleEndian, orientation: 6, withThumbnailIfd: true, iso: 640 }));
    const segment = prepareExifForOutput(source, { width: 3000, height: 4000 });
    expect(segment).not.toBeNull();

    const output = injectExif(fakeJpeg(undefined), segment as Uint8Array);
    const exif = readExif(output);
    expect(exif.orientation).toBe(1);
    expect(exif.pixelWidth).toBe(3000);
    expect(exif.pixelHeight).toBe(4000);
    expect(exif.iso).toBe(640);
    expect(exif.make).toBe('TestCam');
    // Source must stay untouched.
    expect(readExif(source).orientation).toBe(6);
  });

  it('replaces an existing EXIF block instead of duplicating it', () => {
    const target = fakeJpeg(buildExifSegment({ orientation: 8, iso: 50 }));
    const segment = prepareExifForOutput(fakeJpeg(buildExifSegment({ orientation: 1, iso: 1600 })), { width: 10, height: 10 }) as Uint8Array;
    const output = injectExif(target, segment);
    expect(readExif(output).iso).toBe(1600);
    let count = 0;
    for (let i = 0; i + 1 < output.length; i++) if (output[i] === 0xff && output[i + 1] === 0xe1) count++;
    expect(count).toBe(1);
    expect(output[0]).toBe(0xff);
    expect(output[1]).toBe(0xd8);
    expect(output[output.length - 1]).toBe(0xd9);
  });

  it('returns null when the source has no EXIF', () => {
    expect(prepareExifForOutput(fakeJpeg(), { width: 1, height: 1 })).toBeNull();
  });
});

describe('orientation geometry', () => {
  const W = 40;
  const H = 30;
  const apply = (orientation: number, x: number, y: number): [number, number] => {
    const [a, b, c, d, tx, ty] = orientationTransform(orientation, W, H);
    return [a * x + b * y + tx, c * x + d * y + ty];
  };

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('orientation %i maps the stored frame exactly onto the display frame', (orientation) => {
    const size = orientedSize(W, H, orientation);
    const corners = [
      apply(orientation, 0, 0),
      apply(orientation, W, 0),
      apply(orientation, 0, H),
      apply(orientation, W, H),
    ];
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...xs)).toBe(size.width);
    expect(Math.max(...ys)).toBe(size.height);
  });

  it('orientation 6 (rotate 90° clockwise) sends the stored top-left to the display top-right', () => {
    expect(apply(6, 0, 0)).toEqual([H, 0]);
    expect(apply(8, 0, 0)).toEqual([0, W]);
    expect(apply(3, 0, 0)).toEqual([W, H]);
  });
});
