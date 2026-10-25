import {
  Armchair,
  Camera,
  Footprints,
  Heart,
  House,
  Landmark,
  Leaf,
  Moon,
  PersonStanding,
  Plane,
  Shirt,
  Sparkles,
  Sun,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react-native';

import type { PoseCategoryId } from '@/poses/types';

export const CATEGORY_ICONS: Record<PoseCategoryId, LucideIcon> = {
  outdoor: Leaf,
  indoor: House,
  beach: Sun,
  temple: Landmark,
  travel: Plane,
  portrait: UserRound,
  'full-body': PersonStanding,
  couple: Heart,
  group: Users,
  sitting: Armchair,
  standing: PersonStanding,
  walking: Footprints,
  fashion: Shirt,
  social: Sparkles,
  'low-light': Moon,
};

export const FALLBACK_CATEGORY_ICON: LucideIcon = Camera;
