import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { getCategoryIcon } from '@/components/storefront/category-icons';
import type { CategoryTreeNode } from '@/lib/catalogue-types';
import { ArrowRight, LayoutGrid } from 'lucide-react';

interface FeaturedCategoriesProps {
  categories?: CategoryTreeNode[];
}

export function FeaturedCategories({ categories = [] }: FeaturedCategoriesProps) {
  const t = useTranslations('home');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');

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
          .slice(0, 9)
          .map((cat) => ({ slug: cat.slug, name: cat.name }))
      : fallbackCategories;

  return (
    <section className="container mx-auto px-4 py-6">
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {t('categoriesTitle')}
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('categoriesSubtitle')}</p>
        </div>
        <Link
          href="/products"
          className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 shrink-0"
        >
          <span>{tCommon('viewAll')}</span>
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-4">
        {activeCategories.map((cat) => {
          const Icon = getCategoryIcon(cat.slug);
          return (
            <Link
              key={cat.slug}
              href={`/products?category=${encodeURIComponent(cat.slug)}`}
              className="group flex flex-col items-center text-center p-3.5 sm:p-4 rounded-xl border border-border bg-card hover:bg-accent/50 hover:border-primary/50 transition-all shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="size-10 sm:size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2 sm:mb-2.5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Icon className="size-5" />
              </div>
              <h3 className="text-xs sm:text-sm font-semibold text-foreground leading-tight line-clamp-1">
                {cat.name}
              </h3>
            </Link>
          );
        })}

        <Link
          href="/products"
          className="group flex flex-col items-center justify-center text-center p-3.5 sm:p-4 rounded-xl border border-dashed border-border bg-muted/30 hover:bg-accent/50 hover:border-primary/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="size-10 sm:size-11 rounded-xl bg-background border border-border text-primary flex items-center justify-center mb-2 sm:mb-2.5 group-hover:border-primary transition-colors">
            <LayoutGrid className="size-5" />
          </div>
          <h3 className="text-xs sm:text-sm font-semibold text-primary leading-tight">
            {tCommon('viewAll')}
          </h3>
        </Link>
      </div>
    </section>
  );
}
