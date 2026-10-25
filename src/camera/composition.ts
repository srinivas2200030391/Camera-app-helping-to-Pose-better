/**
 * Composition guidance from what the app can actually measure: device tilt (accelerometer) and,
 * in native builds, face boxes from ML Kit. Pure functions so the rules are unit-tested.
 */
import type { Framing } from '@/poses/types';

import type { FaceBox } from './types';

export type HintTone = 'neutral' | 'good';

export interface CompositionHint {
  id: string;
  text: string;
  tone: HintTone;
}

/** Roll within this many degrees counts as level. */
export const LEVEL_TOLERANCE_DEG = 1;

/**
 * Device roll in degrees from expo-sensors Accelerometer x/y (in g). 0 = upright portrait,
 * positive = rotated clockwise. Android reports the upward reaction force (upright: y = +1);
 * iOS reports gravity (upright: y = −1).
 */
export function rollFromAccelerometer(x: number, y: number, os: 'android' | 'ios' = 'android'): number {
  const degrees = os === 'ios' ? Math.atan2(x, -y) : Math.atan2(-x, y);
  return (degrees * 180) / Math.PI;
}

/** True when the phone is close to flat (pointing at the floor/sky): the level is meaningless. */
export function isNearlyFlat(x: number, y: number): boolean {
  return Math.hypot(x, y) < 0.45;
}

/**
 * Deviation from the nearest upright orientation (portrait, landscape left/right, upside down),
 * so the level also works when the phone is turned sideways for a landscape shot.
 */
export function levelDeviation(rollDeg: number): { deviation: number; orientation: 0 | 90 | 180 | -90 } {
  const quadrant = Math.round(rollDeg / 90);
  const deviation = rollDeg - quadrant * 90;
  const normalized = ((((quadrant % 4) + 4) % 4) * 90) as 0 | 90 | 180 | 270;
  return { deviation, orientation: normalized === 270 ? -90 : normalized };
}

export function isLevel(rollDeg: number, tolerance = LEVEL_TOLERANCE_DEG): boolean {
  return Math.abs(levelDeviation(rollDeg).deviation) <= tolerance;
}

/** Expected face height as a fraction of the frame for each framing (approximate, from portraiture practice). */
const FACE_HEIGHT_RANGE: Record<Framing, [number, number]> = {
  headshot: [0.22, 0.42],
  'half-body': [0.1, 0.2],
  'three-quarter': [0.065, 0.13],
  'full-body': [0.04, 0.095],
  environmental: [0.015, 0.06],
};

export interface GuidanceInput {
  faces: readonly FaceBox[];
  rollDeg: number | null;
  /** Framing of the selected pose, if any; defaults to half-body heuristics. */
  framing: Framing | null;
  /** Expected number of people (from the pose). */
  people: number;
}

/**
 * Returns at most two hints, most important first. Silence is better than nagging: when nothing
 * actionable is detected the list is empty.
 */
export function compositionHints({ faces, rollDeg, framing, people }: GuidanceInput): CompositionHint[] {
  const hints: CompositionHint[] = [];
  const deviation = rollDeg == null ? null : levelDeviation(rollDeg).deviation;
  if (deviation != null && Math.abs(deviation) > 2.5 && Math.abs(deviation) < 30) {
    hints.push({ id: 'level', text: deviation > 0 ? 'Rotate phone slightly left to level' : 'Rotate phone slightly right to level', tone: 'neutral' });
  }

  if (faces.length > 0) {
    // Use the largest face as the subject; groups use the union of faces.
    const sorted = [...faces].sort((a, b) => b.width * b.height - a.width * a.height);
    const subject = sorted[0] as FaceBox;
    const top = Math.min(...faces.map((f) => f.y));
    const left = Math.min(...faces.map((f) => f.x));
    const right = Math.max(...faces.map((f) => f.x + f.width));
    const centerX = (left + right) / 2;
    const range = FACE_HEIGHT_RANGE[framing ?? 'half-body'];

    if (top < 0.04) {
      hints.push({ id: 'headroom-tight', text: 'Tilt down a little — the head is too close to the top', tone: 'neutral' });
    } else if (framing !== 'environmental' && framing !== 'full-body' && top > 0.32) {
      hints.push({ id: 'headroom-loose', text: 'Too much headroom — raise the camera or step closer', tone: 'neutral' });
    }

    if (subject.height > range[1] * 1.25) {
      hints.push({ id: 'too-close', text: framing === 'full-body' ? 'Step back to fit the whole body' : 'Step back a little', tone: 'neutral' });
    } else if (subject.height < range[0] * 0.75) {
      hints.push({ id: 'too-far', text: 'Move closer to the subject', tone: 'neutral' });
    }

    if (people > 1 && faces.length < people) {
      hints.push({ id: 'missing-people', text: `${people - faces.length} more ${people - faces.length === 1 ? 'person' : 'people'} expected in frame`, tone: 'neutral' });
    }

    if (faces.length === 1 && hints.length === 0) {
      const thirds = [1 / 3, 1 / 2, 2 / 3];
      const nearest = thirds.reduce((best, t) => (Math.abs(t - centerX) < Math.abs(best - centerX) ? t : best), 0.5);
      if (Math.abs(nearest - centerX) > 0.12) {
        hints.push({ id: 'thirds', text: centerX < 0.5 ? 'Pan left slightly to place the subject on a third' : 'Pan right slightly to place the subject on a third', tone: 'neutral' });
      }
    }
  }

  if (hints.length === 0 && faces.length > 0 && (rollDeg == null || isLevel(rollDeg, 2.5))) {
    hints.push({ id: 'good', text: 'Looks good — hold steady', tone: 'good' });
  }
  return hints.slice(0, 2);
}
