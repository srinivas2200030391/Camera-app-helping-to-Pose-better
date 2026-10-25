import { compositionHints, isLevel, isNearlyFlat, levelDeviation, rollFromAccelerometer } from '../composition';
import { isOpticalZoom, zoomPresetsFor, type FaceBox } from '../types';

const face = (x: number, y: number, size: number): FaceBox => ({ x, y, width: size * 0.75, height: size, rollAngle: 0, yawAngle: 0 });

describe('device level', () => {
  it('reads 0° when upright and the clockwise rotation angle on Android', () => {
    expect(rollFromAccelerometer(0, 1, 'android')).toBeCloseTo(0);
    const theta = (10 * Math.PI) / 180;
    expect(rollFromAccelerometer(-Math.sin(theta), Math.cos(theta), 'android')).toBeCloseTo(10);
    expect(rollFromAccelerometer(Math.sin(theta), Math.cos(theta), 'android')).toBeCloseTo(-10);
  });

  it('uses the gravity convention on iOS', () => {
    expect(rollFromAccelerometer(0, -1, 'ios')).toBeCloseTo(0);
  });

  it('measures deviation from the nearest upright orientation (works sideways too)', () => {
    expect(levelDeviation(3).deviation).toBeCloseTo(3);
    expect(levelDeviation(92)).toMatchObject({ orientation: 90 });
    expect(levelDeviation(92).deviation).toBeCloseTo(2);
    expect(levelDeviation(-88).deviation).toBeCloseTo(2);
    expect(levelDeviation(-88).orientation).toBe(-90);
    expect(isLevel(0.6)).toBe(true);
    expect(isLevel(90.4)).toBe(true);
    expect(isLevel(1.6)).toBe(false);
  });

  it('detects a flat phone', () => {
    expect(isNearlyFlat(0.05, 0.1)).toBe(true);
    expect(isNearlyFlat(0, 0.9)).toBe(false);
  });
});

describe('composition hints', () => {
  it('stays silent with nothing actionable', () => {
    expect(compositionHints({ faces: [], rollDeg: 0.5, framing: null, people: 1 })).toEqual([]);
  });

  it('asks to level a tilted phone in the right direction', () => {
    const [hint] = compositionHints({ faces: [], rollDeg: 6, framing: null, people: 1 });
    expect(hint?.id).toBe('level');
    expect(hint?.text).toMatch(/left/);
    expect(compositionHints({ faces: [], rollDeg: -6, framing: null, people: 1 })[0]?.text).toMatch(/right/);
  });

  it('flags a head too close to the top and a subject too close for full-body', () => {
    const hints = compositionHints({ faces: [face(0.45, 0.01, 0.3)], rollDeg: 0, framing: 'full-body', people: 1 });
    expect(hints.map((h) => h.id)).toEqual(['headroom-tight', 'too-close']);
    expect(hints[1]?.text).toMatch(/whole body/);
  });

  it('suggests moving closer when the face is tiny for a headshot', () => {
    const hints = compositionHints({ faces: [face(0.45, 0.2, 0.05)], rollDeg: 0, framing: 'headshot', people: 1 });
    expect(hints.map((h) => h.id)).toContain('too-far');
  });

  it('notices missing people in group poses and caps hints at two', () => {
    const hints = compositionHints({ faces: [face(0.2, 0.01, 0.4)], rollDeg: 8, framing: 'half-body', people: 3 });
    expect(hints).toHaveLength(2);
    expect(hints[0]?.id).toBe('level');
  });

  it('confirms a well-composed level shot', () => {
    const hints = compositionHints({ faces: [face(0.42, 0.2, 0.15)], rollDeg: 0.3, framing: 'half-body', people: 1 });
    expect(hints).toEqual([{ id: 'good', text: expect.stringMatching(/hold steady/), tone: 'good' }]);
  });
});

describe('zoom presets', () => {
  it('derives optical stops from lens switch factors', () => {
    const { optical, presets } = zoomPresetsFor(0.5, 10, [2, 5]);
    expect(optical).toEqual([0.5, 1, 2, 5]);
    expect(presets).toEqual([0.5, 1, 2, 5]);
  });

  it('labels in-between and single-lens zoom as digital', () => {
    const { optical, presets } = zoomPresetsFor(1, 8, []);
    expect(optical).toEqual([1]);
    expect(presets).toEqual([1, 2, 5]);
    expect(isOpticalZoom(1.02, optical)).toBe(true);
    expect(isOpticalZoom(2, optical)).toBe(false);
  });
});
