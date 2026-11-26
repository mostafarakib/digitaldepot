'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatPoishaToBDT } from '@/lib/utils';
import { useCart } from '@/components/storefront/cart/cart-provider';
import { useWishlist } from '@/components/storefront/wishlist/wishlist-provider';
import { ProductReviewsSection } from '@/components/storefront/product/product-reviews-section';
import type { StorefrontProductDetail } from '@/lib/catalogue-types';
import {
  Package,
  ShieldCheck,
  Truck,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ShoppingCart,
  Zap,
  ChevronRight,
  Heart,
  MessageSquare,
  Loader2,
} from 'lucide-react';

interface ProductDetailViewProps {
  product: StorefrontProductDetail;
}

export function ProductDetailView({ product }: ProductDetailViewProps) {
  const t = useTranslations('catalogue');
  const tWishlist = useTranslations('wishlist');
  const tReviews = useTranslations('reviews');
  const locale = useLocale();
  const router = useRouter();
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();

  const [selectedVariantId, setSelectedVariantId] = useState<string>(product.defaultVariantId);
  const [quantity, setQuantity] = useState<number>(1);
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [isBuying, setIsBuying] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewCount, setReviewCount] = useState<number>(0);

  const isWishlisted = isInWishlist(product.id);

  const selectedVariant =
    product.variants.find((v) => v.id === selectedVariantId) || product.variants[0];

  const initialImage = product.images.find((img) => img.isPrimary) || product.images[0] || null;
  const [selectedImage, setSelectedImage] = useState<string | null>(
    initialImage ? initialImage.url : null,
  );

  const [activeTab, setActiveTab] = useState<'specs' | 'desc' | 'reviews'>('specs');

  const discountPercent =
    selectedVariant.compareAtPrice && selectedVariant.compareAtPrice > selectedVariant.price
      ? Math.round(
          ((selectedVariant.compareAtPrice - selectedVariant.price) /
            selectedVariant.compareAtPrice) *
            100,
        )
      : null;

  const groupedSpecs = product.specifications.reduce<
    Record<string, Array<{ name: string; value: string }>>
  >((acc, spec) => {
    const group = spec.group || 'General';
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push({ name: spec.name, value: spec.value });
    return acc;
  }, {});

  const handleVariantSelect = (variantId: string, availableStock: number) => {
    setSelectedVariantId(variantId);
    setActionError(null);
    if (availableStock > 0) {
      setQuantity((q) => Math.min(q, availableStock));
    } else {
      setQuantity(1);
    }
  };

  const handleAddToCart = async () => {
    if (!selectedVariant || selectedVariant.isOutOfStock) return;
    setActionError(null);
    setIsAdding(true);
    try {
      await addToCart(selectedVariant.id, quantity);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('detail.actionError'));
    } finally {
      setIsAdding(false);
    }
  };

  const handleBuyNow = async () => {
    if (!selectedVariant || selectedVariant.isOutOfStock) return;
    setActionError(null);
    setIsBuying(true);
    try {
      await addToCart(selectedVariant.id, quantity, { openDrawer: false });
      router.push('/checkout');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('detail.actionError'));
      setIsBuying(false);
    }
  };

  const isBusy = isAdding || isBuying;

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8">
      {/* Category Breadcrumbs */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6 flex-wrap"
      >
        <Link href="/" className="hover:text-primary transition-colors">
          {t('detail.breadcrumbsHome')}
        </Link>
        <ChevronRight className="size-3 text-muted-foreground/60" />
        <Link href="/products" className="hover:text-primary transition-colors">
          {t('listing.allProducts')}
        </Link>
        {product.category.breadcrumbs.map((crumb) => (
          <React.Fragment key={crumb.id}>
            <ChevronRight className="size-3 text-muted-foreground/60" />
            <Link
              href={`/products?category=${encodeURIComponent(crumb.slug)}`}
              className="hover:text-primary transition-colors"
            >
              {crumb.name}
            </Link>
          </React.Fragment>
        ))}
        <ChevronRight className="size-3 text-muted-foreground/60" />
        <span className="text-foreground font-medium truncate max-w-full sm:max-w-xs">
          {product.name}
        </span>
      </nav>

      {/* Main Product Showcase Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 mb-10 sm:mb-12">
        {/* Left Column: Image Gallery */}
        <div className="lg:col-span-5 flex flex-col space-y-3 sm:space-y-4">
          <div className="relative aspect-square w-full bg-slate-50 dark:bg-slate-900/50 border border-border rounded-2xl overflow-hidden flex items-center justify-center p-4 sm:p-6 shadow-xs">
            {selectedImage ? (
              <Image
                src={selectedImage}
                alt={product.name}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-contain p-4 sm:p-6 hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <Package className="size-24 text-muted-foreground/40 stroke-[1.2]" />
            )}

            <div className="absolute top-4 left-4 flex flex-col gap-1.5 z-10 pointer-events-none">
              {discountPercent !== null && discountPercent > 0 && (
                <Badge variant="destructive" className="text-xs font-semibold">
                  -{discountPercent}%
                </Badge>
              )}
              {product.featured && (
                <Badge variant="default" className="text-xs uppercase tracking-wider font-semibold">
                  {t('listing.featuredBadge')}
                </Badge>
              )}
            </div>
          </div>

          {product.images.length > 1 && (
            <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
              {product.images.map((img, idx) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setSelectedImage(img.url)}
                  aria-label={`View image ${idx + 1} of ${product.images.length}`}
                  className={`relative size-16 sm:size-20 rounded-xl border-2 overflow-hidden shrink-0 bg-slate-50 dark:bg-slate-900/50 p-1 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    selectedImage === img.url
                      ? 'border-primary ring-2 ring-primary/20'
                      : 'border-border hover:border-muted-foreground/40'
                  }`}
                >
                  <Image
                    src={img.url}
                    alt={img.altText || product.name}
                    fill
                    sizes="80px"
                    className="object-contain p-1"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Product Info & Variant Selector */}
        <div className="lg:col-span-7 flex flex-col space-y-6">
          <div>
            {product.brand && (
              <div className="flex items-center gap-2 mb-2">
                <Link
                  href={`/products?brand=${encodeURIComponent(product.brand.slug)}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-full transition-colors"
                >
                  {product.brand.name}
                </Link>
              </div>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {product.name}
            </h1>
            {product.summary && (
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                {product.summary}
              </p>
            )}
          </div>

          {/* Pricing Card */}
          <div className="p-4 sm:p-5 rounded-xl bg-card border border-border flex flex-col space-y-2.5 shadow-2xs">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl font-extrabold text-foreground">
                {formatPoishaToBDT(selectedVariant.price, locale)}
              </span>
              {selectedVariant.compareAtPrice &&
                selectedVariant.compareAtPrice > selectedVariant.price && (
                  <span className="text-base text-muted-foreground line-through">
                    {formatPoishaToBDT(selectedVariant.compareAtPrice, locale)}
                  </span>
                )}
              {discountPercent !== null && discountPercent > 0 && (
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                  {t('detail.saveAmount', {
                    amount: formatPoishaToBDT(
                      selectedVariant.compareAtPrice! - selectedVariant.price,
                      locale,
                    ),
                  })}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-2.5 border-t border-border/60 text-xs text-muted-foreground">
              <span>
                {t('detail.sku')}:{' '}
                <strong className="text-foreground font-mono">{selectedVariant.sku}</strong>
              </span>
              <div>
                {selectedVariant.isOutOfStock ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                    <AlertCircle className="size-3.5" />
                    <span>{t('listing.outOfStock')}</span>
                  </span>
                ) : selectedVariant.availableStock <= 5 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    <CheckCircle2 className="size-3.5" />
                    <span>{t('listing.onlyXLeft', { count: selectedVariant.availableStock })}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" />
                    <span>{t('listing.inStock')}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Variant Selector */}
          {product.variants.length > 1 && (
            <div className="flex flex-col space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('detail.selectVariant')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {product.variants.map((v) => {
                  const isSelected = v.id === selectedVariantId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleVariantSelect(v.id, v.availableStock)}
                      className={`flex flex-col p-3 rounded-xl border text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        isSelected
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border bg-card hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold text-xs text-foreground truncate">
                          {v.name}
                        </span>
                        {v.isDefault && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                            {t('detail.defaultVariant')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {formatPoishaToBDT(v.price, locale)}
                        </span>
                        {v.isOutOfStock ? (
                          <span className="text-[10px] text-rose-500 font-medium">
                            {t('listing.outOfStock')}
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            {t('detail.stockAvailableCount', { count: v.availableStock })}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ordering Actions */}
          <div className="p-4 sm:p-5 rounded-xl bg-muted/30 border border-border flex flex-col space-y-4">
            {!selectedVariant.isOutOfStock && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-foreground">
                  {t('detail.quantityLabel')}:
                </span>
                <div className="flex items-center border border-border rounded-lg bg-background">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1 || isBusy}
                    className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-l-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Decrease quantity"
                  >
                    <span className="text-sm font-bold px-1.5">−</span>
                  </button>
                  <span className="px-3 text-xs font-bold text-foreground min-w-[36px] text-center">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setQuantity((q) => Math.min(selectedVariant.availableStock || 99, q + 1))
                    }
                    disabled={quantity >= (selectedVariant.availableStock || 99) || isBusy}
                    className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-r-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Increase quantity"
                  >
                    <span className="text-sm font-bold px-1.5">+</span>
                  </button>
                </div>
              </div>
            )}

            {actionError && (
              <div
                role="alert"
                className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium"
              >
                <AlertCircle className="size-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
              <Button
                type="button"
                size="lg"
                variant="default"
                disabled={selectedVariant.isOutOfStock || isBusy}
                onClick={handleAddToCart}
                className="flex-1 flex items-center justify-center gap-2 font-semibold text-sm shadow-sm"
              >
                {isAdding ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShoppingCart className="size-4" />
                )}
                <span>
                  {isAdding
                    ? t('detail.addingToCart')
                    : selectedVariant.isOutOfStock
                      ? t('listing.outOfStock')
                      : t('detail.addToCart')}
                </span>
              </Button>

              <div className="flex items-center gap-2.5 sm:contents">
                <Button
                  type="button"
                  size="lg"
                  variant="secondary"
                  disabled={selectedVariant.isOutOfStock || isBusy}
                  onClick={handleBuyNow}
                  className="flex-1 flex items-center justify-center gap-2 font-semibold text-sm"
                >
                  {isBuying ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Zap className="size-4" />
                  )}
                  <span>{isBuying ? t('detail.buyingNow') : t('detail.buyNow')}</span>
                </Button>

                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={() => void toggleWishlist(product.id)}
                  title={isWishlisted ? tWishlist('removeFromWishlist') : tWishlist('addToWishlist')}
                  aria-label={
                    isWishlisted ? tWishlist('removeFromWishlist') : tWishlist('addToWishlist')
                  }
                  className="size-10 p-0 shrink-0 border-border hover:bg-muted/50"
                >
                  <Heart
                    className={`size-5 transition-colors ${
                      isWishlisted ? 'fill-rose-500 text-rose-500' : 'text-muted-foreground'
                    }`}
                  />
                </Button>
              </div>
            </div>
          </div>

          {/* Product Assurance Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="flex items-center gap-2.5 p-3 rounded-xl border border-border bg-card">
              <ShieldCheck className="size-5 text-primary shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-foreground truncate">
                  {product.warranty || t('detail.officialWarranty')}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {t('detail.brandWarranty')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-xl border border-border bg-card">
              <Truck className="size-5 text-primary shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-foreground">
                  {t('detail.fastDelivery')}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {t('detail.allOverBangladesh')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-xl border border-border bg-card">
              <RotateCcw className="size-5 text-primary shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-foreground">
                  {t('detail.authenticProduct')}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {t('detail.verifiedOrigin')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Product Specifications, Description & Reviews */}
      <div className="border border-border rounded-2xl bg-card overflow-hidden">
        <div
          role="tablist"
          aria-label="Product Information"
          className="flex border-b border-border bg-muted/20 overflow-x-auto scrollbar-none"
        >
          <button
            type="button"
            role="tab"
            id="tab-specs"
            aria-selected={activeTab === 'specs'}
            aria-controls="panel-specs"
            onClick={() => setActiveTab('specs')}
            className={`px-3 sm:px-6 py-3 sm:py-3.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap flex-1 sm:flex-initial text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              activeTab === 'specs'
                ? 'border-primary text-primary bg-background'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('detail.specificationsTab')}
          </button>
          <button
            type="button"
            role="tab"
            id="tab-desc"
            aria-selected={activeTab === 'desc'}
            aria-controls="panel-desc"
            onClick={() => setActiveTab('desc')}
            className={`px-3 sm:px-6 py-3 sm:py-3.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap flex-1 sm:flex-initial text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              activeTab === 'desc'
                ? 'border-primary text-primary bg-background'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('detail.descriptionTab')}
          </button>
          <button
            type="button"
            role="tab"
            id="tab-reviews"
            aria-selected={activeTab === 'reviews'}
            aria-controls="panel-reviews"
            onClick={() => setActiveTab('reviews')}
            className={`px-3 sm:px-6 py-3 sm:py-3.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap flex-1 sm:flex-initial focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              activeTab === 'reviews'
                ? 'border-primary text-primary bg-background'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <MessageSquare className="size-3.5 sm:size-4 shrink-0" />
            <span>{tReviews('tabTitle', { count: reviewCount })}</span>
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {activeTab === 'specs' && (
            <div role="tabpanel" id="panel-specs" aria-labelledby="tab-specs">
              {Object.keys(groupedSpecs).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {t('detail.noSpecificationsProvided')}
                </p>
              ) : (
                <div className="space-y-6">
                  {Object.entries(groupedSpecs).map(([groupName, specs]) => (
                    <div key={groupName} className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                        {groupName}
                      </h3>
                      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                        {specs.map((s, idx) => (
                          <div
                            key={`${groupName}-${s.name}-${idx}`}
                            className={`grid grid-cols-1 sm:grid-cols-3 p-3 text-xs ${
                              idx % 2 === 0 ? 'bg-card' : 'bg-muted/15'
                            }`}
                          >
                            <span className="font-medium text-muted-foreground sm:col-span-1">
                              {s.name}
                            </span>
                            <span className="font-semibold text-foreground sm:col-span-2 mt-0.5 sm:mt-0">
                              {s.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'desc' && (
            <div
              role="tabpanel"
              id="panel-desc"
              aria-labelledby="tab-desc"
              className="prose prose-sm dark:prose-invert max-w-none text-foreground leading-relaxed"
            >
              {product.description ? (
                <div className="whitespace-pre-line text-sm text-foreground/90">
                  {product.description}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {t('detail.noDescriptionProvided')}
                </p>
              )}
            </div>
          )}

          {activeTab === 'reviews' && (
            <div role="tabpanel" id="panel-reviews" aria-labelledby="tab-reviews">
              <ProductReviewsSection
                productSlug={product.slug}
                onReviewCountChange={setReviewCount}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
