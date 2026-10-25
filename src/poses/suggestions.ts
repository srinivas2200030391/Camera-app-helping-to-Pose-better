import { hashString } from '@/utils/math';

import type { Pose } from './types';

export interface SuggestionContext {
  /** Local hour 0–23. */
  hour: number;
  aspect: '4:3' | '16:9' | '1:1';
  favoriteIds: readonly string[];
  recentIds: readonly string[];
  /** Days since epoch — rotates ties daily so suggestions feel fresh. */
  day: number;
}

export function isLowLightHour(hour: number): boolean {
  return hour >= 18 || hour < 6;
}

/** Explains why a pose is suggested (shown as a small caption). */
export function suggestionReason(pose: Pose, context: SuggestionContext): string {
  if (isLowLightHour(context.hour) && pose.categories.includes('low-light')) return 'Good for evening light';
  if (context.aspect === '1:1' && (pose.framing === 'headshot' || pose.framing === 'half-body')) return 'Fits a square frame';
  if (context.aspect === '16:9' && (pose.framing === 'full-body' || pose.framing === 'environmental')) return 'Uses the tall frame';
  if (context.favoriteIds.includes(pose.id)) return 'From your favourites';
  if (pose.difficulty === 1) return 'Easy to nail';
  return 'Worth a try';
}

export function suggestPoses(poses: readonly Pose[], context: SuggestionContext, limit = 6): Pose[] {
  const lowLight = isLowLightHour(context.hour);
  const scored = poses.map((pose) => {
    let score = 0;
    const isLowLightPose = pose.categories.includes('low-light');
    if (lowLight && isLowLightPose) score += 3;
    if (!lowLight && isLowLightPose) score -= 2;
    if (context.aspect === '16:9' && (pose.framing === 'full-body' || pose.framing === 'environmental')) score += 1;
    if (context.aspect === '1:1' && (pose.framing === 'headshot' || pose.framing === 'half-body')) score += 1.5;
    if (context.favoriteIds.includes(pose.id)) score += 1;
    if (context.recentIds.slice(0, 3).includes(pose.id)) score -= 1.5;
    if (pose.difficulty === 1) score += 0.5;
    score += (parseInt(hashString(`${pose.id}:${context.day}`).slice(0, 4), 16) / 0xffff) * 0.9;
    return { pose, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.pose);
}
