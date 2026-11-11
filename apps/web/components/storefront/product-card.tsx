'use client';

import React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Badge } from '@/components/ui/badge';
import { formatPoishaToBDT } from '@/lib/utils';
import { useCart } from '@/components/storefront/cart/cart-provider';
import { useWishlist } from '@/components/storefront/wishlist/wishlist-provider';
import type { StorefrontProductSummary } from '@/lib/catalogue-types';
import { Package, ShieldCheck, ShoppingCart, Heart } from 'lucide-react';

interface ProductCardProps {
  product: StorefrontProductSummary;
}

export function ProductCard({ product }: ProductCardProps) {
  const t = useTranslations('catalogue');
  const tWishlist = useTranslations('wishlist');
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const [isAdding, setIsAdding] = React.useState(false);

  const isWishlisted = isInWishlist(product.id);

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
          {!product.isInStock ? (
            <span className="inline-flex items-center text-[10px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full">
              {t('listing.outOfStock')}
            </span>
          ) : product.totalAvailableStock <= 5 ? (
            <span className="inline-flex items-center text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
              {t('listing.onlyXLeft', { count: product.totalAvailableStock })}
            </span>
          ) : null}
        </div>

        {/* Wishlist Button Overlay */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void toggleWishlist(product.id);
          }}
          title={isWishlisted ? tWishlist('removeFromWishlist') : tWishlist('addToWishlist')}
          aria-label={isWishlisted ? tWishlist('removeFromWishlist') : tWishlist('addToWishlist')}
          className="absolute top-2.5 right-2.5 z-20 size-8 rounded-full bg-background/80 backdrop-blur-xs flex items-center justify-center hover:bg-background transition-colors shadow-xs"
        >
          <Heart
            className={`size-4 transition-colors ${
              isWishlisted
                ? 'fill-rose-500 text-rose-500'
                : 'text-muted-foreground hover:text-rose-500'
            }`}
          />
        </button>
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

          {/* Quick Add / View Options */}
          {product.variantCount === 1 && product.defaultVariantId && product.isInStock ? (
            <button
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isAdding) return;
                setIsAdding(true);
                try {
                  await addToCart(product.defaultVariantId!, 1);
                } finally {
                  setIsAdding(false);
                }
              }}
              disabled={isAdding}
              title={t('detail.addToCart')}
              aria-label={t('detail.addToCart')}
              className="size-8 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground flex items-center justify-center transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <ShoppingCart className="size-4" />
            </button>
          ) : product.isInStock ? (
            <Link
              href={`/products/${product.slug}`}
              title={t('listing.viewOptions')}
              aria-label={t('listing.viewOptions')}
              className="size-8 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground flex items-center justify-center transition-colors cursor-pointer"
            >
              <ShoppingCart className="size-4" />
            </Link>
          ) : (
            <button
              disabled
              title={t('listing.outOfStock')}
              aria-label={t('listing.outOfStock')}
              className="size-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center opacity-50 cursor-not-allowed"
            >
              <ShoppingCart className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
