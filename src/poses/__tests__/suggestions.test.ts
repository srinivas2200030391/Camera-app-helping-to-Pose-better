import { getPoses } from '../library';
import { isLowLightHour, suggestPoses, suggestionReason } from '../suggestions';

const base = { aspect: '4:3' as const, favoriteIds: [], recentIds: [], day: 20_000 };

describe('pose suggestions', () => {
  it('returns the requested number of unique poses', () => {
    const picks = suggestPoses(getPoses(), { ...base, hour: 12 }, 6);
    expect(picks).toHaveLength(6);
    expect(new Set(picks.map((p) => p.id)).size).toBe(6);
  });

  it('prefers low-light poses in the evening and avoids them at midday', () => {
    const evening = suggestPoses(getPoses(), { ...base, hour: 21 }, 3);
    expect(evening.every((pose) => pose.categories.includes('low-light'))).toBe(true);
    const noon = suggestPoses(getPoses(), { ...base, hour: 12 }, 6);
    expect(noon.some((pose) => pose.categories.includes('low-light'))).toBe(false);
    expect(isLowLightHour(5)).toBe(true);
    expect(isLowLightHour(18)).toBe(true);
    expect(isLowLightHour(17)).toBe(false);
  });

  it('is deterministic for a given day and varies across days', () => {
    const a = suggestPoses(getPoses(), { ...base, hour: 10 }).map((p) => p.id);
    const b = suggestPoses(getPoses(), { ...base, hour: 10 }).map((p) => p.id);
    const later = [1, 2, 3, 4, 5].map((d) => suggestPoses(getPoses(), { ...base, hour: 10, day: base.day + d }).map((p) => p.id).join());
    expect(a).toEqual(b);
    expect(new Set(later).size).toBeGreaterThan(1);
  });

  it('explains why a pose is suggested', () => {
    const pose = getPoses().find((p) => p.id === 'window-light')!;
    expect(suggestionReason(pose, { ...base, hour: 22 })).toBe('Good for evening light');
    const headshot = getPoses().find((p) => p.id === 'classic-headshot')!;
    expect(suggestionReason(headshot, { ...base, hour: 10, aspect: '1:1' })).toBe('Fits a square frame');
  });
});
