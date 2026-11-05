import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Menu,
  Smartphone,
  Laptop,
  Cpu,
  Monitor,
  Headphones,
  Watch,
  Keyboard,
  Flame,
} from 'lucide-react';

export function CategoryNav() {
  const tNav = useTranslations('nav');

  const categories = [
    { id: 'smartphones', label: tNav('smartphones'), icon: Smartphone },
    { id: 'laptops', label: tNav('laptops'), icon: Laptop },
    { id: 'components', label: tNav('components'), icon: Cpu },
    { id: 'monitors', label: tNav('monitors'), icon: Monitor },
    { id: 'audio', label: tNav('audio'), icon: Headphones },
    { id: 'wearables', label: tNav('wearables'), icon: Watch },
    { id: 'accessories', label: tNav('accessories'), icon: Keyboard },
  ];

  return (
    <nav
      className="w-full bg-card border-b border-border hidden md:block"
      aria-label="Category Navigation"
    >
      <div className="container mx-auto px-4 flex items-center justify-between">
        {/* All Categories Trigger */}
        <div className="relative group">
          <button className="h-11 px-4 bg-primary text-primary-foreground font-medium text-xs flex items-center gap-2 hover:bg-primary/95 transition-colors cursor-pointer">
            <Menu className="size-4" />
            <span>{tNav('allCategories')}</span>
          </button>
        </div>

        {/* Category Links Strip */}
        <div className="flex items-center space-x-1 lg:space-x-2 overflow-x-auto py-1 scrollbar-none">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <span
                key={cat.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer rounded-md hover:bg-muted/50 whitespace-nowrap"
              >
                <Icon className="size-3.5" />
                <span>{cat.label}</span>
              </span>
            );
          })}
        </div>

        {/* Special Deals Accent */}
        <div className="flex items-center">
          <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full cursor-pointer hover:bg-amber-500/20 transition-colors">
            <Flame className="size-3.5 fill-amber-500" />
            <span>{tNav('deals')}</span>
          </span>
        </div>
      </div>
    </nav>
  );
}
