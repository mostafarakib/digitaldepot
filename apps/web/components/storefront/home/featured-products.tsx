import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ProductCard } from '../product-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import type { StorefrontProductSummary } from '@/lib/catalogue-types';
import { ArrowRight, PackageSearch } from 'lucide-react';

interface FeaturedProductsProps {
  products?: StorefrontProductSummary[];
}

export function FeaturedProducts({ products = [] }: FeaturedProductsProps) {
  const t = useTranslations('home');
  const tCommon = useTranslations('common');

  return (
    <section className="container mx-auto px-4 py-6">
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {t('featuredDealsTitle')}
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t('featuredDealsSubtitle')}
          </p>
        </div>
        <Link
          href="/products?featured=true"
          className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 shrink-0"
        >
          <span>{tCommon('viewAll')}</span>
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {products.length > 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<PackageSearch className="size-7" />}
          title={t('emptySectionTitle')}
          description={t('emptySectionDescription')}
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/products">{t('heroCta')}</Link>
            </Button>
          }
        />
      )}
    </section>
  );
}
