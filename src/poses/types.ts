export type PoseCategoryId =
  | 'outdoor'
  | 'indoor'
  | 'beach'
  | 'temple'
  | 'travel'
  | 'portrait'
  | 'full-body'
  | 'couple'
  | 'group'
  | 'sitting'
  | 'standing'
  | 'walking'
  | 'fashion'
  | 'social'
  | 'low-light';

export interface PoseCategory {
  id: PoseCategoryId;
  name: string;
  description: string;
}

export type Framing = 'headshot' | 'half-body' | 'three-quarter' | 'full-body' | 'environmental';
export type PoseOrientation = 'portrait' | 'landscape' | 'any';
export type Difficulty = 1 | 2 | 3;

/** A point in the pose frame: x and y are 0..1 of a 3:4 portrait frame (y down). */
export interface Point {
  x: number;
  y: number;
}

/**
 * Keypoints of one person. L/R are SCREEN left/right (not the subject's anatomical side),
 * which keeps authoring and mirroring simple.
 */
export interface Skeleton {
  head: Point;
  headRadius: number;
  neck: Point;
  shoulderL: Point;
  shoulderR: Point;
  elbowL: Point;
  elbowR: Point;
  wristL: Point;
  wristR: Point;
  handL: Point;
  handR: Point;
  hipL: Point;
  hipR: Point;
  kneeL: Point;
  kneeR: Point;
  ankleL: Point;
  ankleR: Point;
  toeL: Point;
  toeR: Point;
  /** Figure height (head top → feet) as a fraction of frame height; scales limb widths. */
  scale: number;
  /** Side drawn behind the body (for turned figures). */
  farSide: 'L' | 'R' | null;
}

export interface Pose {
  id: string;
  name: string;
  categories: PoseCategoryId[];
  figures: Skeleton[];
  instructions: string[];
  distance: string;
  framing: Framing;
  orientation: PoseOrientation;
  difficulty: Difficulty;
  composition: string;
  cameraHeight: string;
  lens: string;
  hints: string[];
}
