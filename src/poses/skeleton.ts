/**
 * Forward-kinematics figure builder. Poses are authored as a pelvis position, a figure height
 * and limb angles; this module turns them into anatomically proportioned keypoints.
 *
 * Angles are absolute screen angles in degrees: 0 = straight down, 90 = toward screen right,
 * -90 = toward screen left, 180 = straight up.
 */
import type { Point, Skeleton } from './types';

/** Frame is 3:4 portrait; lengths are computed in frame-height units, x converted at the end. */
const FRAME_ASPECT = 3 / 4;

/** Body proportions as fractions of standing height (head top → sole). */
export const PROPORTIONS = {
  headRadius: 0.064,
  neck: 0.042,
  torso: 0.3,
  shoulderHalf: 0.108,
  shoulderDrop: 0.022,
  hipHalf: 0.074,
  upperArm: 0.168,
  foreArm: 0.148,
  hand: 0.052,
  thigh: 0.245,
  shin: 0.232,
  foot: 0.058,
} as const;

/** [upperAngle, lowerAngle, upperScale?, lowerScale?] — scales foreshorten limbs pointing at the camera. */
export type LimbSpec = readonly [number, number, number?, number?];

export interface FigureSpec {
  /** Pelvis centre, 0..1 of frame width/height. */
  x: number;
  y: number;
  /** Standing height as a fraction of frame height. */
  height: number;
  /** Torso lean in degrees; positive tilts the head toward screen right. */
  lean?: number;
  /** 0 = facing the camera, 1 = full profile (narrows shoulders and hips). */
  turn?: number;
  /** Head tilt relative to the torso, degrees (positive = toward screen right). */
  headTilt?: number;
  /** Raises the screen-right hip (degrees); shoulders counter-tilt slightly. */
  hipTilt?: number;
  /** Foreshortens the torso (e.g. leaning toward the camera). */
  torsoScale?: number;
  armL?: LimbSpec;
  armR?: LimbSpec;
  legL?: LimbSpec;
  legR?: LimbSpec;
  /** Direction the feet point: -1 screen left, 0 toward camera, 1 screen right. */
  feet?: number;
  farSide?: 'L' | 'R';
}

export const ARM = {
  hangL: [-7, -4] as LimbSpec,
  hangR: [7, 4] as LimbSpec,
  hipL: [-40, 55] as LimbSpec,
  hipR: [40, -55] as LimbSpec,
  pocketL: [-12, 14] as LimbSpec,
  pocketR: [12, -14] as LimbSpec,
  crossL: [-14, 82] as LimbSpec,
  crossR: [14, -78] as LimbSpec,
  upL: [-155, -168] as LimbSpec,
  upR: [155, 168] as LimbSpec,
  wideL: [-118, -128] as LimbSpec,
  wideR: [118, 128] as LimbSpec,
  hairR: [155, -104] as LimbSpec,
  hairL: [-155, 104] as LimbSpec,
  prayL: [-20, 111] as LimbSpec,
  prayR: [20, -111] as LimbSpec,
  phoneL: [-12, 72] as LimbSpec,
  phoneR: [12, -72] as LimbSpec,
  pointR: [122, 126] as LimbSpec,
} as const;

export const LEG = {
  standL: [-3, -1] as LimbSpec,
  standR: [3, 1] as LimbSpec,
  wideL: [-13, -6] as LimbSpec,
  wideR: [13, 6] as LimbSpec,
} as const;

interface Vec {
  x: number;
  y: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const dir = (deg: number): Vec => ({ x: Math.sin(rad(deg)), y: Math.cos(rad(deg)) });
const add = (a: Vec, b: Vec, k = 1): Vec => ({ x: a.x + b.x * k, y: a.y + b.y * k });

export function buildFigure(spec: FigureSpec): Skeleton {
  const H = spec.height;
  const P = PROPORTIONS;
  const turn = spec.turn ?? 0;
  const shoulderWidth = 1 - 0.62 * turn;
  const hipWidth = 1 - 0.45 * turn;
  // Work in frame-height units: x spans 0..0.75.
  const pelvis: Vec = { x: spec.x * FRAME_ASPECT, y: spec.y };
  const torsoAngle = 180 - (spec.lean ?? 0);
  const up = dir(torsoAngle);
  const right: Vec = { x: -up.y, y: up.x };
  const neck = add(pelvis, up, P.torso * H * (spec.torsoScale ?? 1));
  const headDir = dir(torsoAngle - (spec.headTilt ?? 0));
  const head = add(neck, headDir, (P.neck + P.headRadius) * H);

  const hipTilt = rad(spec.hipTilt ?? 0);
  const hipAxis: Vec = { x: right.x * Math.cos(hipTilt) + right.y * Math.sin(hipTilt), y: right.y * Math.cos(hipTilt) - right.x * Math.sin(hipTilt) };
  const shoulderTilt = -0.4 * hipTilt;
  const shoulderAxis: Vec = {
    x: right.x * Math.cos(shoulderTilt) + right.y * Math.sin(shoulderTilt),
    y: right.y * Math.cos(shoulderTilt) - right.x * Math.sin(shoulderTilt),
  };
  const shoulderCenter = add(neck, up, -P.shoulderDrop * H);
  const shoulderL = add(shoulderCenter, shoulderAxis, -P.shoulderHalf * H * shoulderWidth);
  const shoulderR = add(shoulderCenter, shoulderAxis, P.shoulderHalf * H * shoulderWidth);
  const hipL = add(pelvis, hipAxis, -P.hipHalf * H * hipWidth);
  const hipR = add(pelvis, hipAxis, P.hipHalf * H * hipWidth);

  const limb = (root: Vec, spec: LimbSpec | undefined, fallback: LimbSpec, upperLen: number, lowerLen: number, endLen: number) => {
    const [a1, a2, s1 = 1, s2 = 1] = spec ?? fallback;
    const joint = add(root, dir(a1), upperLen * H * s1);
    const end = add(joint, dir(a2), lowerLen * H * s2);
    const tip = add(end, dir(a2), endLen * H * Math.min(1, s2 + 0.2));
    return { joint, end, tip };
  };
  const armL = limb(shoulderL, spec.armL, ARM.hangL, P.upperArm, P.foreArm, P.hand * 0.55);
  const armR = limb(shoulderR, spec.armR, ARM.hangR, P.upperArm, P.foreArm, P.hand * 0.55);
  const legL = limb(hipL, spec.legL, LEG.standL, P.thigh, P.shin, 0);
  const legR = limb(hipR, spec.legR, LEG.standR, P.thigh, P.shin, 0);

  const feet = spec.feet ?? 0;
  const toe = (ankle: Vec, side: -1 | 1): Vec =>
    feet === 0
      ? { x: ankle.x + side * P.foot * H * 0.35, y: ankle.y + P.foot * H * 0.45 }
      : { x: ankle.x + feet * P.foot * H, y: ankle.y + P.foot * H * 0.3 };

  const out = (v: Vec): Point => ({ x: v.x / FRAME_ASPECT, y: v.y });
  return {
    head: out(head),
    headRadius: P.headRadius * H,
    neck: out(neck),
    shoulderL: out(shoulderL),
    shoulderR: out(shoulderR),
    elbowL: out(armL.joint),
    elbowR: out(armR.joint),
    wristL: out(armL.end),
    wristR: out(armR.end),
    handL: out(armL.tip),
    handR: out(armR.tip),
    hipL: out(hipL),
    hipR: out(hipR),
    kneeL: out(legL.joint),
    kneeR: out(legR.joint),
    ankleL: out(legL.end),
    ankleR: out(legR.end),
    toeL: out(toe(legL.end, -1)),
    toeR: out(toe(legR.end, 1)),
    scale: H,
    farSide: spec.farSide ?? null,
  };
}

/** Mirrors a figure horizontally (screen left ↔ right). */
export function mirrorSkeleton(skeleton: Skeleton): Skeleton {
  const m = (p: Point): Point => ({ x: 1 - p.x, y: p.y });
  return {
    head: m(skeleton.head),
    headRadius: skeleton.headRadius,
    neck: m(skeleton.neck),
    shoulderL: m(skeleton.shoulderR),
    shoulderR: m(skeleton.shoulderL),
    elbowL: m(skeleton.elbowR),
    elbowR: m(skeleton.elbowL),
    wristL: m(skeleton.wristR),
    wristR: m(skeleton.wristL),
    handL: m(skeleton.handR),
    handR: m(skeleton.handL),
    hipL: m(skeleton.hipR),
    hipR: m(skeleton.hipL),
    kneeL: m(skeleton.kneeR),
    kneeR: m(skeleton.kneeL),
    ankleL: m(skeleton.ankleR),
    ankleR: m(skeleton.ankleL),
    toeL: m(skeleton.toeR),
    toeR: m(skeleton.toeL),
    scale: skeleton.scale,
    farSide: skeleton.farSide === 'L' ? 'R' : skeleton.farSide === 'R' ? 'L' : null,
  };
}

/** Axis-aligned bounds of a figure (including head and limb thickness), in frame units. */
export function skeletonBounds(skeleton: Skeleton): { minX: number; minY: number; maxX: number; maxY: number } {
  const points: Point[] = [
    skeleton.neck,
    skeleton.shoulderL,
    skeleton.shoulderR,
    skeleton.elbowL,
    skeleton.elbowR,
    skeleton.handL,
    skeleton.handR,
    skeleton.hipL,
    skeleton.hipR,
    skeleton.kneeL,
    skeleton.kneeR,
    skeleton.ankleL,
    skeleton.ankleR,
    skeleton.toeL,
    skeleton.toeR,
  ];
  const r = skeleton.headRadius;
  let minX = skeleton.head.x - r / FRAME_ASPECT;
  let maxX = skeleton.head.x + r / FRAME_ASPECT;
  let minY = skeleton.head.y - r;
  let maxY = skeleton.head.y + r;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}
