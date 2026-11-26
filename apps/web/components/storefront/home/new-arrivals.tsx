import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ProductCard } from '../product-card';
import type { StorefrontProductSummary } from '@/lib/catalogue-types';
import { ArrowRight } from 'lucide-react';

interface NewArrivalsProps {
  products?: StorefrontProductSummary[];
}

export function NewArrivals({ products = [] }: NewArrivalsProps) {
  const t = useTranslations('home');
  const tCommon = useTranslations('common');

  if (products.length === 0) {
    return null;
  }

  return (
    <section className="container mx-auto px-4 py-6">
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {t('newArrivalsTitle')}
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t('newArrivalsSubtitle')}
          </p>
        </div>
        <Link
          href="/products?sort=newest"
          className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 shrink-0"
        >
          <span>{tCommon('viewAll')}</span>
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
