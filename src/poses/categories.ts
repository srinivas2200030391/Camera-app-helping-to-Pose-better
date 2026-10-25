import type { PoseCategory, PoseCategoryId } from './types';

export const CATEGORIES: readonly PoseCategory[] = [
  { id: 'outdoor', name: 'Outdoor', description: 'Streets, parks and open light' },
  { id: 'indoor', name: 'Indoor', description: 'Homes, cafés and window light' },
  { id: 'beach', name: 'Beach', description: 'Sand, sea and wide horizons' },
  { id: 'temple', name: 'Temple & cultural', description: 'Respectful poses for heritage sites' },
  { id: 'travel', name: 'Travel', description: 'You, the place and the story' },
  { id: 'portrait', name: 'Portrait', description: 'Head-and-shoulders and half-body' },
  { id: 'full-body', name: 'Full-body', description: 'Head to toe with flattering lines' },
  { id: 'couple', name: 'Couple', description: 'Two people, natural connection' },
  { id: 'group', name: 'Group', description: 'Three or more, everyone visible' },
  { id: 'sitting', name: 'Sitting', description: 'Steps, benches, floors and ledges' },
  { id: 'standing', name: 'Standing', description: 'Relaxed, confident stances' },
  { id: 'walking', name: 'Walking', description: 'Movement that looks candid' },
  { id: 'fashion', name: 'Fashion', description: 'Editorial angles and attitude' },
  { id: 'social', name: 'Social media', description: 'Fun, expressive and shareable' },
  { id: 'low-light', name: 'Low light', description: 'Still poses for evening and night' },
];

export function getCategory(id: PoseCategoryId): PoseCategory | undefined {
  return CATEGORIES.find((category) => category.id === id);
}

export function isCategoryId(value: unknown): value is PoseCategoryId {
  return typeof value === 'string' && CATEGORIES.some((category) => category.id === value);
}
