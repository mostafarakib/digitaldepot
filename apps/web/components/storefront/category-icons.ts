import type { LucideIcon } from 'lucide-react';
import {
  Smartphone,
  Laptop,
  Headphones,
  Speaker,
  Watch,
  Keyboard,
  Mouse,
  Monitor,
  Cable,
  Cpu,
  Wifi,
  LayoutGrid,
} from 'lucide-react';

export interface StorefrontNavCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

const ICON_BY_SLUG: Record<string, LucideIcon> = {
  smartphones: Smartphone,
  laptops: Laptop,
  headphones: Headphones,
  'earbuds-audio': Speaker,
  audio: Headphones,
  smartwatches: Watch,
  wearables: Watch,
  keyboards: Keyboard,
  mice: Mouse,
  monitors: Monitor,
  accessories: Cable,
  components: Cpu,
  networking: Wifi,
};

export function getCategoryIcon(slug: string): LucideIcon {
  return ICON_BY_SLUG[slug] || LayoutGrid;
}
