import { memo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import type { FaceBox } from '@/camera/types';

export interface FaceGuidesProps {
  faces: readonly FaceBox[];
  width: number;
  height: number;
}

/** Subtle corner brackets around detected faces (a guide, never drawn into photos). */
function FaceGuidesImpl({ faces, width, height }: FaceGuidesProps) {
  if (faces.length === 0) return null;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <G stroke="rgba(255,255,255,0.8)" strokeWidth={1.6} fill="none" strokeLinecap="round">
        {faces.map((face, i) => {
          const x = face.x * width;
          const y = face.y * height;
          const w = face.width * width;
          const h = face.height * height;
          const c = Math.min(w, h) * 0.22;
          const d = [
            `M${x},${y + c} L${x},${y} L${x + c},${y}`,
            `M${x + w - c},${y} L${x + w},${y} L${x + w},${y + c}`,
            `M${x + w},${y + h - c} L${x + w},${y + h} L${x + w - c},${y + h}`,
            `M${x + c},${y + h} L${x},${y + h} L${x},${y + h - c}`,
          ].join(' ');
          return <Path key={i} d={d} />;
        })}
      </G>
    </Svg>
  );
}

export const FaceGuides = memo(FaceGuidesImpl);
