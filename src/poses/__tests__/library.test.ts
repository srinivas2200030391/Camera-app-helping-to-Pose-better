import * as fs from 'fs';
import * as path from 'path';

import { CATEGORIES } from '../categories';
import { FIGURE_BOX, figurePrimitives } from '../figure';
import { getPose, getPoses, posesInCategory, searchPoses } from '../library';
import { mirrorSkeleton, skeletonBounds } from '../skeleton';
import type { Skeleton } from '../types';

const allPoints = (s: Skeleton) => [
  s.head,
  s.neck,
  s.shoulderL,
  s.shoulderR,
  s.elbowL,
  s.elbowR,
  s.wristL,
  s.wristR,
  s.handL,
  s.handR,
  s.hipL,
  s.hipR,
  s.kneeL,
  s.kneeR,
  s.ankleL,
  s.ankleR,
  s.toeL,
  s.toeR,
];

describe('pose library', () => {
  const poses = getPoses();

  it('has unique ids and complete metadata', () => {
    expect(poses.length).toBeGreaterThanOrEqual(36);
    expect(new Set(poses.map((p) => p.id)).size).toBe(poses.length);
    for (const pose of poses) {
      expect(pose.name.length).toBeGreaterThan(3);
      expect(pose.instructions.length).toBeGreaterThanOrEqual(2);
      expect(pose.distance).toMatch(/m/);
      expect([1, 2, 3]).toContain(pose.difficulty);
      expect(pose.composition.length).toBeGreaterThan(10);
      expect(pose.cameraHeight.length).toBeGreaterThan(3);
      expect(pose.figures.length).toBeGreaterThan(0);
    }
  });

  it('covers every category with at least three poses', () => {
    for (const category of CATEGORIES) {
      expect(posesInCategory(category.id).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('uses only known categories and the right number of people', () => {
    const known = new Set(CATEGORIES.map((c) => c.id));
    for (const pose of poses) {
      for (const category of pose.categories) expect(known.has(category)).toBe(true);
      if (pose.categories.includes('couple')) expect(pose.figures.length).toBe(2);
      if (pose.categories.includes('group')) expect(pose.figures.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('produces finite keypoints with visible heads; full-body figures fit the frame', () => {
    for (const pose of poses) {
      for (const figure of pose.figures) {
        for (const point of allPoints(figure)) {
          expect(Number.isFinite(point.x)).toBe(true);
          expect(Number.isFinite(point.y)).toBe(true);
        }
        expect(figure.head.x).toBeGreaterThan(0.02);
        expect(figure.head.x).toBeLessThan(0.98);
        expect(figure.head.y).toBeGreaterThan(0.02);
        expect(figure.head.y).toBeLessThan(0.9);
        if (pose.framing === 'full-body' || pose.framing === 'environmental') {
          const bounds = skeletonBounds(figure);
          expect(bounds.minX).toBeGreaterThan(-0.02);
          expect(bounds.maxX).toBeLessThan(1.02);
          expect(bounds.minY).toBeGreaterThan(-0.02);
          expect(bounds.maxY).toBeLessThan(1.0);
        }
      }
    }
  });

  it('mirrors figures symmetrically', () => {
    const figure = getPose('hand-on-hip')!.figures[0]!;
    const twice = mirrorSkeleton(mirrorSkeleton(figure));
    expect(twice.wristL.x).toBeCloseTo(figure.wristL.x, 10);
    expect(mirrorSkeleton(figure).wristR.x).toBeCloseTo(1 - figure.wristL.x, 10);
  });

  it('searches by name, category and instruction text', () => {
    expect(searchPoses('headshot').map((p) => p.id)).toContain('classic-headshot');
    expect(searchPoses('beach').length).toBeGreaterThanOrEqual(3);
    expect(searchPoses('pocket').map((p) => p.id)).toContain('pocket-stroll');
    expect(searchPoses('').length).toBe(poses.length);
  });

  it('turns every figure into drawable primitives', () => {
    for (const pose of poses) {
      for (const figure of pose.figures) {
        const primitives = figurePrimitives(figure);
        expect(primitives.filter((p) => p.kind === 'ellipse')).toHaveLength(1);
        expect(primitives.filter((p) => p.kind === 'limb').length).toBe(11);
      }
    }
  });

  // Visual review aid: POSELENS_POSE_SHEET=1 npx jest src/poses
  (process.env.POSELENS_POSE_SHEET ? it : it.skip)('writes a contact sheet', () => {
    const columns = 7;
    const cellW = 150;
    const cellH = 230;
    const rows = Math.ceil(poses.length / columns);
    const parts: string[] = [];
    poses.forEach((pose, index) => {
      const ox = (index % columns) * cellW;
      const oy = Math.floor(index / columns) * cellH;
      const k = cellW / FIGURE_BOX.width;
      parts.push(`<g transform="translate(${ox + 0},${oy + 0})">`);
      parts.push(`<rect x="2" y="2" width="${cellW - 4}" height="${(cellW - 4) * (4 / 3)}" fill="#222" stroke="#555"/>`);
      parts.push(`<g transform="scale(${k})">`);
      pose.figures.forEach((figure, f) => {
        const color = ['#f2f2f2', '#ffd9a0', '#a9d8ff', '#c9f2c7'][f % 4];
        for (const p of figurePrimitives(figure)) {
          const fill = 'far' in p && p.far ? '#9a9a9a' : color;
          if (p.kind === 'limb') parts.push(`<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="${fill}" stroke-width="${p.width}" stroke-linecap="round"/>`);
          if (p.kind === 'polygon') parts.push(`<polygon points="${p.points.map((q) => `${q.x},${q.y}`).join(' ')}" fill="${color}" stroke="${color}" stroke-width="1.2" stroke-linejoin="round"/>`);
          if (p.kind === 'ellipse') parts.push(`<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.rx}" ry="${p.ry}" fill="${color}"/>`);
          if (p.kind === 'circle') parts.push(`<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${fill}"/>`);
        }
      });
      parts.push('</g>');
      parts.push(`<text x="${cellW / 2}" y="${cellW * (4 / 3) + 20}" fill="#ddd" font-size="12" font-family="sans-serif" text-anchor="middle">${pose.name}</text>`);
      parts.push('</g>');
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${columns * cellW}" height="${rows * cellH}" style="background:#111">${parts.join('')}</svg>`;
    const out = path.resolve(__dirname, '../../../artifacts/pose-sheet.svg');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, svg);
  });
});
