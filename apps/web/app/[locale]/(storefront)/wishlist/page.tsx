'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { AuthGuard } from '@/components/auth/auth-guard';
import { useWishlist } from '@/components/storefront/wishlist/wishlist-provider';
import { useCart } from '@/components/storefront/cart/cart-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatPoishaToBDT } from '@/lib/utils';
import {
  Heart,
  ShoppingCart,
  Trash2,
  Package,
  ArrowRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';

function WishlistContent() {
  const t = useTranslations('wishlist');
  const tCommon = useTranslations('common');
  const tCat = useTranslations('catalogue');
  const { wishlistItems, removeFromWishlist, isLoading } = useWishlist();
  const { addToCart } = useCart();

  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAddToCart = async (productId: string, defaultVariantId: string | null) => {
    if (!defaultVariantId) return;
    setBusyProductId(productId);
    setErrorMsg(null);
    try {
      await addToCart(defaultVariantId, 1);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add item to cart');
    } finally {
      setBusyProductId(null);
    }
  };

  const handleRemove = async (productId: string) => {
    setBusyProductId(productId);
    setErrorMsg(null);
    try {
      await removeFromWishlist(productId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to remove item');
    } finally {
      setBusyProductId(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Heart className="size-6 text-rose-500 fill-rose-500" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('title')}</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('itemCount', { count: wishlistItems.length })}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/products" className="flex items-center gap-1.5 text-xs">
            <span>{t('browseProducts')}</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      {errorMsg && (
        <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Content */}
      {isLoading && wishlistItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm">{tCommon('loading')}</p>
        </div>
      ) : wishlistItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="size-16 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground mb-4">
            <Heart className="size-8 stroke-[1.5]" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1">{t('emptyTitle')}</h2>
          <p className="text-sm text-muted-foreground max-w-md mb-6">{t('emptyDescription')}</p>
          <Button asChild size="default">
            <Link href="/products">{t('browseProducts')}</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-8">
          {wishlistItems.map((item) => {
            const product = item.product;
            const isBusy = busyProductId === product.id;

            return (
              <div
                key={item.id}
                className="group relative flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-xs hover:shadow-md transition-all duration-200"
              >
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

                  {/* Stock Status Badge */}
                  <div className="absolute top-2.5 right-2.5 z-10">
                    {!product.isInStock ? (
                      <span className="inline-flex items-center text-[10px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full">
                        {tCat('listing.outOfStock')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        {tCat('listing.inStock')}
                      </span>
                    )}
                  </div>

                  {product.featured && (
                    <div className="absolute top-2.5 left-2.5 z-10">
                      <Badge variant="default" className="text-[10px] uppercase font-semibold">
                        {tCat('listing.featuredBadge')}
                      </Badge>
                    </div>
                  )}
                </Link>

                {/* Details */}
                <div className="flex flex-col flex-1 p-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span className="truncate">{product.category.name}</span>
                    {product.brand && (
                      <span className="font-medium truncate">{product.brand.name}</span>
                    )}
                  </div>

                  <Link
                    href={`/products/${product.slug}`}
                    className="font-medium text-sm text-foreground line-clamp-2 hover:text-primary transition-colors mb-2"
                    title={product.name}
                  >
                    {product.name}
                  </Link>

                  {/* Price */}
                  <div className="mt-auto pt-2 border-t border-border/50">
                    <div className="flex items-baseline gap-1.5 mb-3">
                      <span className="text-base font-bold text-foreground">
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

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {product.variantCount > 1 ? (
                        <Button asChild size="sm" className="flex-1 text-xs">
                          <Link href={`/products/${product.slug}`}>
                            {tCat('detail.selectVariant')}
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={!product.isInStock || isBusy}
                          onClick={() => void handleAddToCart(product.id, product.defaultVariantId)}
                          className="flex-1 text-xs flex items-center justify-center gap-1.5"
                        >
                          {isBusy ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <ShoppingCart className="size-3.5" />
                          )}
                          <span>{t('moveToCart')}</span>
                        </Button>
                      )}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => void handleRemove(product.id)}
                        title={t('removeFromWishlist')}
                        aria-label={t('removeFromWishlist')}
                        className="size-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function WishlistPage() {
  return (
    <AuthGuard returnUrl="/wishlist">
      <WishlistContent />
    </AuthGuard>
  );
}
