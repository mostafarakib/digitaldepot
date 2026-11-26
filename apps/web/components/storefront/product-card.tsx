'use client';

import React from 'react';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatPoishaToBDT } from '@/lib/utils';
import { useCart } from '@/components/storefront/cart/cart-provider';
import { useWishlist } from '@/components/storefront/wishlist/wishlist-provider';
import type { StorefrontProductSummary } from '@/lib/catalogue-types';
import { Package, ShoppingCart, Heart, Loader2, ArrowRight } from 'lucide-react';

interface ProductCardProps {
  product: StorefrontProductSummary;
}

export function ProductCard({ product }: ProductCardProps) {
  const t = useTranslations('catalogue');
  const tWishlist = useTranslations('wishlist');
  const locale = useLocale();
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const [isAdding, setIsAdding] = React.useState(false);

  const isWishlisted = isInWishlist(product.id);

  const discountPercent =
    product.compareAtPrice && product.compareAtPrice > product.minPrice
      ? Math.round(((product.compareAtPrice - product.minPrice) / product.compareAtPrice) * 100)
      : null;

  return (
    <article className="group relative flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-xs hover:shadow-md hover:border-primary/30 transition-all duration-200 min-w-0">
      {/* Product Image Stage */}
      <div className="relative aspect-square w-full bg-slate-50 dark:bg-slate-900/50 border-b border-border/60 overflow-hidden flex items-center justify-center">
        <Link
          href={`/products/${product.slug}`}
          aria-label={product.name}
          className="relative size-full flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {product.primaryImage ? (
            <Image
              src={product.primaryImage.url}
              alt={product.primaryImage.altText || product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-contain p-2.5 sm:p-4 group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <Package className="size-12 sm:size-14 text-muted-foreground/40 stroke-[1.5]" />
          )}
        </Link>

        {/* Badges Overlay */}
        <div className="absolute top-2 left-2 right-10 flex flex-col items-start gap-1 z-10 pointer-events-none">
          {discountPercent !== null && discountPercent > 0 && (
            <Badge
              variant="destructive"
              className="text-[9px] sm:text-[10px] font-semibold px-1.5 sm:px-2 py-0.5 leading-tight"
            >
              -{discountPercent}%
            </Badge>
          )}
          {product.featured && (
            <Badge
              variant="default"
              className="hidden sm:inline-flex text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5"
            >
              {t('listing.featuredBadge')}
            </Badge>
          )}
          {!product.isInStock ? (
            <span className="inline-flex items-center max-w-full truncate text-[9px] sm:text-[10px] font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25 px-1.5 sm:px-2 py-0.5 rounded-full backdrop-blur-xs">
              {t('listing.outOfStock')}
            </span>
          ) : product.totalAvailableStock <= 5 ? (
            <span className="inline-flex items-center max-w-full truncate text-[9px] sm:text-[10px] font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/25 px-1.5 sm:px-2 py-0.5 rounded-full backdrop-blur-xs">
              {t('listing.onlyXLeft', { count: product.totalAvailableStock })}
            </span>
          ) : null}
        </div>

        {/* Wishlist Action */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void toggleWishlist(product.id);
          }}
          title={isWishlisted ? tWishlist('removeFromWishlist') : tWishlist('addToWishlist')}
          aria-label={isWishlisted ? tWishlist('removeFromWishlist') : tWishlist('addToWishlist')}
          className="absolute top-2 right-2 z-20 size-8 rounded-full bg-background/90 border border-border/80 flex items-center justify-center hover:bg-background transition-colors shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
        >
          <Heart
            className={`size-4 transition-colors ${
              isWishlisted
                ? 'fill-rose-500 text-rose-500'
                : 'text-muted-foreground hover:text-rose-500'
            }`}
          />
        </button>
      </div>

      {/* Product Info */}
      <div className="flex flex-col flex-1 p-2.5 sm:p-4 min-w-0">
        <div className="flex items-center justify-between gap-1.5 text-[10px] sm:text-[11px] text-muted-foreground mb-1">
          <span className="truncate">{product.category.name}</span>
          {product.brand && (
            <span className="font-semibold text-foreground/80 truncate shrink-0">
              {product.brand.name}
            </span>
          )}
        </div>

        <Link
          href={`/products/${product.slug}`}
          className="font-semibold text-xs sm:text-sm text-foreground line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem] leading-snug hover:text-primary transition-colors mb-1.5"
          title={product.name}
        >
          {product.name}
        </Link>

        {product.summary && (
          <p className="hidden sm:line-clamp-2 text-xs text-muted-foreground mb-3">
            {product.summary}
          </p>
        )}

        {/* Pricing & Action */}
        <div className="mt-auto pt-2.5 sm:pt-3 border-t border-border/60 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-sm sm:text-base font-bold text-foreground leading-tight">
                {product.minPrice === product.maxPrice
                  ? formatPoishaToBDT(product.minPrice, locale)
                  : `${formatPoishaToBDT(product.minPrice, locale)} – ${formatPoishaToBDT(product.maxPrice, locale)}`}
              </span>
              {product.compareAtPrice && product.compareAtPrice > product.minPrice && (
                <span className="text-[11px] sm:text-xs text-muted-foreground line-through">
                  {formatPoishaToBDT(product.compareAtPrice, locale)}
                </span>
              )}
            </div>
            {product.variantCount > 1 && (
              <span className="text-[10px] sm:text-[11px] text-muted-foreground block mt-0.5 truncate">
                {t('listing.variantsAvailable', { count: product.variantCount })}
              </span>
            )}
          </div>

          {product.variantCount === 1 && product.defaultVariantId && product.isInStock ? (
            <Button
              type="button"
              size="sm"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isAdding) return;
                setIsAdding(true);
                try {
                  await addToCart(product.defaultVariantId!, 1);
                } catch {
                  // Cart provider / network errors leave UI stable
                } finally {
                  setIsAdding(false);
                }
              }}
              disabled={isAdding}
              aria-label={t('detail.addToCart')}
              className="w-full sm:w-auto h-9 sm:h-8 px-2.5 sm:px-3 text-xs font-semibold shrink-0"
            >
              {isAdding ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ShoppingCart className="size-3.5" />
              )}
              <span>{t('listing.addShort')}</span>
            </Button>
          ) : product.isInStock ? (
            <Button
              asChild
              size="sm"
              variant="secondary"
              className="w-full sm:w-auto h-9 sm:h-8 px-2.5 sm:px-3 text-xs font-semibold shrink-0"
            >
              <Link href={`/products/${product.slug}`}>
                <span>{t('listing.viewOptions')}</span>
                <ArrowRight className="size-3" />
              </Link>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled
              className="w-full sm:w-auto h-9 sm:h-8 px-2.5 text-xs shrink-0 opacity-60"
            >
              {t('listing.outOfStock')}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
