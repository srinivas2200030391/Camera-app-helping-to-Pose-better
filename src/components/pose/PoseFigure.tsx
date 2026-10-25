import { memo, useMemo } from 'react';
import Svg, { Circle, Defs, Ellipse, G, Line, Mask, Polygon, Rect } from 'react-native-svg';

import { FIGURE_BOX, figurePrimitives, type FigurePrimitive } from '@/poses/figure';
import { mirrorSkeleton } from '@/poses/skeleton';
import type { Skeleton } from '@/poses/types';
import { figureTints } from '@/theme/tokens';

export type FigureVariant = 'card' | 'ghost' | 'outline';

export interface PoseFigureProps {
  figures: readonly Skeleton[];
  width: number;
  height: number;
  variant?: FigureVariant;
  mirrored?: boolean;
  /** Fill colour for card thumbnails (first person); others use soft tints. */
  color?: string;
}

function renderPrimitive(p: FigurePrimitive, key: string, fill: string, grow = 0, farFill?: string) {
  const color = 'far' in p && p.far && farFill ? farFill : fill;
  switch (p.kind) {
    case 'limb':
      return <Line key={key} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={color} strokeWidth={p.width + grow * 2} strokeLinecap="round" />;
    case 'polygon':
      return (
        <Polygon
          key={key}
          points={p.points.map((pt) => `${pt.x},${pt.y}`).join(' ')}
          fill={color}
          stroke={color}
          strokeWidth={1.4 + grow * 2}
          strokeLinejoin="round"
        />
      );
    case 'ellipse':
      return <Ellipse key={key} cx={p.cx} cy={p.cy} rx={p.rx + grow} ry={p.ry + grow} fill={color} />;
    case 'circle':
      return <Circle key={key} cx={p.cx} cy={p.cy} r={p.r + grow} fill={color} />;
  }
}

function PoseFigureImpl({ figures, width, height, variant = 'card', mirrored = false, color }: PoseFigureProps) {
  const people = useMemo(
    () => figures.map((figure) => figurePrimitives(mirrored ? mirrorSkeleton(figure) : figure)),
    [figures, mirrored],
  );
  // Box units per screen pixel, so outline widths stay constant in pixels at any size.
  const unitsPerPx = FIGURE_BOX.height / Math.max(1, Math.min(height, (width * FIGURE_BOX.height) / FIGURE_BOX.width));
  const outline = 1.6 * unitsPerPx;

  if (variant === 'card') {
    return (
      <Svg width={width} height={height} viewBox={`0 0 ${FIGURE_BOX.width} ${FIGURE_BOX.height}`}>
        {people.map((prims, i) => {
          const fill = i === 0 && color ? color : (figureTints[i % figureTints.length] as string);
          return <G key={i}>{prims.map((p, j) => renderPrimitive(p, `${i}-${j}`, fill, 0, 'rgba(255,255,255,0.55)'))}</G>;
        })}
      </Svg>
    );
  }

  if (variant === 'ghost') {
    return (
      <Svg width={width} height={height} viewBox={`0 0 ${FIGURE_BOX.width} ${FIGURE_BOX.height}`}>
        {people.map((prims, i) => (
          <G key={`o${i}`}>{prims.map((p, j) => renderPrimitive(p, `o${i}-${j}`, '#FFFFFF', outline))}</G>
        ))}
        {people.map((prims, i) => (
          <G key={`f${i}`}>{prims.map((p, j) => renderPrimitive(p, `f${i}-${j}`, i === 0 ? '#2B2B30' : '#3A3427', 0, '#202024'))}</G>
        ))}
      </Svg>
    );
  }

  // Outline only: the silhouette masks out the inside of a slightly larger white silhouette.
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${FIGURE_BOX.width} ${FIGURE_BOX.height}`}>
      <Defs>
        <Mask id="poselens-outline" maskUnits="userSpaceOnUse" x={0} y={0} width={FIGURE_BOX.width} height={FIGURE_BOX.height}>
          <Rect x={0} y={0} width={FIGURE_BOX.width} height={FIGURE_BOX.height} fill="#FFFFFF" />
          {people.map((prims, i) => (
            <G key={`m${i}`}>{prims.map((p, j) => renderPrimitive(p, `m${i}-${j}`, '#000000'))}</G>
          ))}
        </Mask>
      </Defs>
      <G mask="url(#poselens-outline)">
        {people.map((prims, i) => (
          <G key={`o${i}`}>{prims.map((p, j) => renderPrimitive(p, `o${i}-${j}`, '#FFFFFF', outline * 1.2))}</G>
        ))}
      </G>
    </Svg>
  );
}

export const PoseFigure = memo(PoseFigureImpl);
