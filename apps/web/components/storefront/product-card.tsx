'use client';

import React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Badge } from '@/components/ui/badge';
import { formatPoishaToBDT } from '@/lib/utils';
import type { StorefrontProductSummary } from '@/lib/catalogue-types';
import { Package, ShieldCheck, ShoppingCart } from 'lucide-react';

interface ProductCardProps {
  product: StorefrontProductSummary;
}

export function ProductCard({ product }: ProductCardProps) {
  const t = useTranslations('catalogue');

  const discountPercent =
    product.compareAtPrice && product.compareAtPrice > product.minPrice
      ? Math.round(((product.compareAtPrice - product.minPrice) / product.compareAtPrice) * 100)
      : null;

  return (
    <div className="group relative flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-xs hover:shadow-md transition-all duration-200">
      {/* Product Image Area */}
      <Link
        href={`/products/${product.slug}`}
        className="relative aspect-square w-full bg-muted/30 overflow-hidden flex items-center justify-center"
      >
        {product.primaryImage ? (
          <Image
            src={product.primaryImage.url}
            alt={product.primaryImage.altText || product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-contain p-4 group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <Package className="size-16 text-muted-foreground/40 stroke-[1.5]" />
        )}

        {/* Badges Overlay */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5 z-10">
          {product.featured && (
            <Badge
              variant="default"
              className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5"
            >
              {t('listing.featuredBadge')}
            </Badge>
          )}
          {discountPercent !== null && discountPercent > 0 && (
            <Badge variant="destructive" className="text-[10px] font-semibold px-2 py-0.5">
              -{discountPercent}%
            </Badge>
          )}
        </div>

        {/* Stock Badge Overlay */}
        <div className="absolute top-2.5 right-2.5 z-10">
          {!product.isInStock ? (
            <span className="inline-flex items-center text-[10px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full">
              {t('listing.outOfStock')}
            </span>
          ) : product.totalAvailableStock <= 5 ? (
            <span className="inline-flex items-center text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
              {t('listing.onlyXLeft', { count: product.totalAvailableStock })}
            </span>
          ) : (
            <span className="inline-flex items-center text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              {t('listing.inStock')}
            </span>
          )}
        </div>
      </Link>

      {/* Product Content */}
      <div className="flex flex-col flex-1 p-4">
        {/* Category & Brand Metadata */}
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-1">
          <span className="truncate">{product.category.name}</span>
          {product.brand && (
            <span className="font-medium text-foreground/80 truncate">{product.brand.name}</span>
          )}
        </div>

        {/* Title */}
        <Link
          href={`/products/${product.slug}`}
          className="font-medium text-sm text-foreground line-clamp-2 hover:text-primary transition-colors mb-2"
          title={product.name}
        >
          {product.name}
        </Link>

        {/* Summary text if available */}
        {product.summary && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{product.summary}</p>
        )}

        <div className="mt-auto pt-2 border-t border-border/50 flex items-end justify-between gap-2">
          {/* Pricing */}
          <div>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-base sm:text-lg font-bold text-foreground">
                {product.minPrice === product.maxPrice
                  ? formatPoishaToBDT(product.minPrice)
                  : `${formatPoishaToBDT(product.minPrice)} – ${formatPoishaToBDT(product.maxPrice)}`}
              </span>
              {product.compareAtPrice && product.compareAtPrice > product.minPrice && (
                <span className="text-xs text-muted-foreground line-through">
                  {formatPoishaToBDT(product.compareAtPrice)}
                </span>
              )}
            </div>
            {product.variantCount > 1 && (
              <span className="text-[11px] text-muted-foreground">
                {t('listing.variantsAvailable', { count: product.variantCount })}
              </span>
            )}
          </div>

          {/* Quick Action / Phase boundary indicator */}
          <button
            disabled
            title={t('detail.addToCartDisabled')}
            className="size-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition-colors opacity-70 cursor-not-allowed"
            aria-label={t('detail.addToCartDisabled')}
          >
            <ShoppingCart className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
