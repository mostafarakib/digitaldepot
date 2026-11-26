import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { LayoutGrid, Sparkles } from 'lucide-react';
import { getCategoryIcon } from '@/components/storefront/category-icons';
import type { CategoryTreeNode } from '@/lib/catalogue-types';

interface CategoryNavProps {
  categories?: CategoryTreeNode[];
}

export function CategoryNav({ categories = [] }: CategoryNavProps) {
  const tNav = useTranslations('nav');

  const fallbackCategories = [
    { slug: 'smartphones', name: tNav('smartphones') },
    { slug: 'laptops', name: tNav('laptops') },
    { slug: 'headphones', name: tNav('headphones') },
    { slug: 'earbuds-audio', name: tNav('earbudsAudio') },
    { slug: 'smartwatches', name: tNav('smartwatches') },
    { slug: 'keyboards', name: tNav('keyboards') },
    { slug: 'mice', name: tNav('mice') },
    { slug: 'monitors', name: tNav('monitors') },
    { slug: 'accessories', name: tNav('accessories') },
  ];

  const activeCategories =
    categories.length > 0
      ? categories
          .filter((cat) => cat.isActive)
          .map((cat) => ({ slug: cat.slug, name: cat.name }))
      : fallbackCategories;

  return (
    <nav
      className="w-full bg-card border-b border-border hidden md:block"
      aria-label="Category Navigation"
    >
      <div className="container mx-auto px-4 flex items-center justify-between gap-4">
        {/* All Products / Catalogue Trigger */}
        <Link
          href="/products"
          className="h-11 px-4 bg-primary text-primary-foreground font-semibold text-xs flex items-center gap-2 hover:bg-primary/95 transition-colors shrink-0"
        >
          <LayoutGrid className="size-4" />
          <span>{tNav('allCategories')}</span>
        </Link>

        {/* Category Links Strip */}
        <div className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none flex-1">
          {activeCategories.map((cat) => {
            const Icon = getCategoryIcon(cat.slug);
            return (
              <Link
                key={cat.slug}
                href={`/products?category=${encodeURIComponent(cat.slug)}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-muted/60 whitespace-nowrap"
              >
                <Icon className="size-3.5 shrink-0" />
                <span>{cat.name}</span>
              </Link>
            );
          })}
        </div>

        {/* Featured Products Accent */}
        <Link
          href="/products?featured=true"
          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full hover:bg-primary/15 transition-colors shrink-0 whitespace-nowrap"
        >
          <Sparkles className="size-3.5" />
          <span>{tNav('deals')}</span>
        </Link>
      </div>
    </nav>
  );
}
