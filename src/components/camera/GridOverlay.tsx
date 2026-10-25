import { memo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';

import type { GridType } from '@/state/settings';

const PHI = 0.618;

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function gridSegments(type: GridType, w: number, h: number): Segment[] {
  switch (type) {
    case 'thirds':
      return [
        { x1: w / 3, y1: 0, x2: w / 3, y2: h },
        { x1: (2 * w) / 3, y1: 0, x2: (2 * w) / 3, y2: h },
        { x1: 0, y1: h / 3, x2: w, y2: h / 3 },
        { x1: 0, y1: (2 * h) / 3, x2: w, y2: (2 * h) / 3 },
      ];
    case 'golden': {
      const a = 1 - PHI;
      return [
        { x1: w * a, y1: 0, x2: w * a, y2: h },
        { x1: w * PHI, y1: 0, x2: w * PHI, y2: h },
        { x1: 0, y1: h * a, x2: w, y2: h * a },
        { x1: 0, y1: h * PHI, x2: w, y2: h * PHI },
      ];
    }
    case 'center':
      return [
        { x1: w / 2, y1: 0, x2: w / 2, y2: h },
        { x1: 0, y1: h / 2, x2: w, y2: h / 2 },
      ];
    case 'diagonal':
      return [
        { x1: 0, y1: 0, x2: w, y2: h },
        { x1: w, y1: 0, x2: 0, y2: h },
        { x1: w / 3, y1: 0, x2: w / 3, y2: h },
        { x1: (2 * w) / 3, y1: 0, x2: (2 * w) / 3, y2: h },
      ];
    default:
      return [];
  }
}

export interface GridOverlayProps {
  type: GridType;
  width: number;
  height: number;
  showCenterMark: boolean;
}

/** Composition grid. Each line is drawn twice (dark under light) so it reads on any scene. */
function GridOverlayImpl({ type, width, height, showCenterMark }: GridOverlayProps) {
  const segments = gridSegments(type, width, height);
  if (segments.length === 0 && !showCenterMark) return null;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <G stroke="rgba(0,0,0,0.28)" strokeWidth={2}>
        {segments.map((s, i) => (
          <Line key={`s${i}`} {...s} />
        ))}
      </G>
      <G stroke="rgba(255,255,255,0.42)" strokeWidth={1}>
        {segments.map((s, i) => (
          <Line key={`l${i}`} {...s} />
        ))}
      </G>
      {showCenterMark ? (
        <G stroke="rgba(255,255,255,0.7)" strokeWidth={1.2} fill="none">
          <Circle cx={width / 2} cy={height / 2} r={9} />
          <Line x1={width / 2 - 4} y1={height / 2} x2={width / 2 + 4} y2={height / 2} />
          <Line x1={width / 2} y1={height / 2 - 4} x2={width / 2} y2={height / 2 + 4} />
        </G>
      ) : null}
    </Svg>
  );
}

export const GridOverlay = memo(GridOverlayImpl);
