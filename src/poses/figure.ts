/**
 * Turns a skeleton into ordered drawing primitives (far limbs → torso → near limbs → head).
 * Units: coordinates in a 75 × 100 box (3:4 frame), so 1 unit = 1 % of the frame height on
 * both axes. Renderers only map these primitives to SVG (or anything else).
 */
import type { Point, Skeleton } from './types';

export const FIGURE_BOX = { width: 75, height: 100 } as const;

export type FigurePrimitive =
  | { kind: 'limb'; x1: number; y1: number; x2: number; y2: number; width: number; far: boolean }
  | { kind: 'polygon'; points: { x: number; y: number }[] }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; far: boolean };

/** Limb thickness as a fraction of standing height. */
const WIDTH = {
  neck: 0.05,
  upperArm: 0.05,
  foreArm: 0.04,
  thigh: 0.084,
  shin: 0.06,
  foot: 0.036,
  hand: 0.026,
} as const;

const toBox = (p: Point) => ({ x: p.x * FIGURE_BOX.width, y: p.y * FIGURE_BOX.height });

function lerp(a: { x: number; y: number }, b: { x: number; y: number }, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function figurePrimitives(skeleton: Skeleton): FigurePrimitive[] {
  const H = skeleton.scale * 100;
  const p = {
    head: toBox(skeleton.head),
    neck: toBox(skeleton.neck),
    shoulderL: toBox(skeleton.shoulderL),
    shoulderR: toBox(skeleton.shoulderR),
    elbowL: toBox(skeleton.elbowL),
    elbowR: toBox(skeleton.elbowR),
    wristL: toBox(skeleton.wristL),
    wristR: toBox(skeleton.wristR),
    handL: toBox(skeleton.handL),
    handR: toBox(skeleton.handR),
    hipL: toBox(skeleton.hipL),
    hipR: toBox(skeleton.hipR),
    kneeL: toBox(skeleton.kneeL),
    kneeR: toBox(skeleton.kneeR),
    ankleL: toBox(skeleton.ankleL),
    ankleR: toBox(skeleton.ankleR),
    toeL: toBox(skeleton.toeL),
    toeR: toBox(skeleton.toeR),
  };
  const limb = (a: { x: number; y: number }, b: { x: number; y: number }, width: number, far: boolean): FigurePrimitive => ({
    kind: 'limb',
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    width: width * H,
    far,
  });

  const side = (s: 'L' | 'R') => {
    const far = skeleton.farSide === s;
    const shoulder = s === 'L' ? p.shoulderL : p.shoulderR;
    const elbow = s === 'L' ? p.elbowL : p.elbowR;
    const wrist = s === 'L' ? p.wristL : p.wristR;
    const hand = s === 'L' ? p.handL : p.handR;
    const hip = s === 'L' ? p.hipL : p.hipR;
    const knee = s === 'L' ? p.kneeL : p.kneeR;
    const ankle = s === 'L' ? p.ankleL : p.ankleR;
    const toe = s === 'L' ? p.toeL : p.toeR;
    const legs: FigurePrimitive[] = [
      limb(hip, knee, WIDTH.thigh, far),
      limb(knee, ankle, WIDTH.shin, far),
      limb(ankle, toe, WIDTH.foot, far),
    ];
    const arms: FigurePrimitive[] = [
      limb(shoulder, elbow, WIDTH.upperArm, far),
      limb(elbow, wrist, WIDTH.foreArm, far),
      { kind: 'circle', cx: hand.x, cy: hand.y, r: WIDTH.hand * H, far },
    ];
    return { legs, arms, far };
  };

  const left = side('L');
  const right = side('R');
  const pelvis = lerp(p.hipL, p.hipR, 0.5);
  const flare = (hip: { x: number; y: number }) => lerp(pelvis, hip, 1.32);
  const waist = (shoulder: { x: number; y: number }, hip: { x: number; y: number }) => {
    const mid = lerp(shoulder, hip, 0.62);
    const axis = lerp(lerp(p.shoulderL, p.shoulderR, 0.5), pelvis, 0.62);
    return lerp(mid, axis, 0.14);
  };
  const torso: FigurePrimitive = {
    kind: 'polygon',
    points: [p.shoulderL, p.shoulderR, waist(p.shoulderR, p.hipR), flare(p.hipR), flare(p.hipL), waist(p.shoulderL, p.hipL)],
  };
  const neck = limb(p.neck, lerp(p.neck, p.head, 0.55), WIDTH.neck, false);
  const head: FigurePrimitive = {
    kind: 'ellipse',
    cx: p.head.x,
    cy: p.head.y,
    rx: skeleton.headRadius * 100 * 0.84,
    ry: skeleton.headRadius * 100,
  };

  const farParts = [left, right].filter((s) => s.far);
  const nearParts = [left, right].filter((s) => !s.far);
  return [
    ...farParts.flatMap((s) => [...s.legs, ...s.arms]),
    ...nearParts.flatMap((s) => s.legs),
    torso,
    neck,
    ...nearParts.flatMap((s) => s.arms),
    head,
  ];
}
