'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatPoishaToBDT } from '@/lib/utils';
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
  Info,
} from 'lucide-react';

interface ProductDetailViewProps {
  product: StorefrontProductDetail;
}

export function ProductDetailView({ product }: ProductDetailViewProps) {
  const t = useTranslations('catalogue');

  // Currently selected variant ID (defaults to default variant)
  const [selectedVariantId, setSelectedVariantId] = useState<string>(product.defaultVariantId);

  // Selected variant
  const selectedVariant =
    product.variants.find((v) => v.id === selectedVariantId) || product.variants[0];

  // Primary or selected image URL
  const initialImage = product.images.find((img) => img.isPrimary) || product.images[0] || null;
  const [selectedImage, setSelectedImage] = useState<string | null>(
    initialImage ? initialImage.url : null,
  );

  // Active tab: 'specs' | 'desc'
  const [activeTab, setActiveTab] = useState<'specs' | 'desc'>('specs');

  const discountPercent =
    selectedVariant.compareAtPrice && selectedVariant.compareAtPrice > selectedVariant.price
      ? Math.round(
          ((selectedVariant.compareAtPrice - selectedVariant.price) /
            selectedVariant.compareAtPrice) *
            100,
        )
      : null;

  // Group specifications by group name
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
              href={`/products?category=${crumb.slug}`}
              className="hover:text-primary transition-colors"
            >
              {crumb.name}
            </Link>
          </React.Fragment>
        ))}
        <ChevronRight className="size-3 text-muted-foreground/60" />
        <span className="text-foreground font-medium truncate max-w-xs">{product.name}</span>
      </nav>

      {/* Main Product Showcase Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 mb-12">
        {/* Left Column: Image Gallery (5 cols) */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          {/* Main Selected Image Viewer */}
          <div className="relative aspect-square w-full bg-card border border-border rounded-2xl overflow-hidden flex items-center justify-center p-6 shadow-xs">
            {selectedImage ? (
              <Image
                src={selectedImage}
                alt={product.name}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-contain p-6 hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <Package className="size-24 text-muted-foreground/40 stroke-[1.2]" />
            )}

            {/* Badges Overlay */}
            <div className="absolute top-4 left-4 flex flex-col gap-1.5 z-10">
              {product.featured && (
                <Badge variant="default" className="text-xs uppercase tracking-wider font-semibold">
                  {t('listing.featuredBadge')}
                </Badge>
              )}
              {discountPercent !== null && discountPercent > 0 && (
                <Badge variant="destructive" className="text-xs font-semibold">
                  -{discountPercent}% OFF
                </Badge>
              )}
            </div>
          </div>

          {/* Thumbnail Selector Strip */}
          {product.images.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {product.images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setSelectedImage(img.url)}
                  className={`relative size-16 sm:size-20 rounded-xl border-2 overflow-hidden flex-shrink-0 bg-card p-1 transition-all cursor-pointer ${
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

        {/* Right Column: Product Info & Variant Selector (7 cols) */}
        <div className="lg:col-span-7 flex flex-col space-y-6">
          {/* Brand & Title */}
          <div>
            {product.brand && (
              <div className="flex items-center gap-2 mb-2">
                <Link
                  href={`/products?brand=${product.brand.slug}`}
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

          {/* Pricing Section */}
          <div className="p-4 rounded-xl bg-card border border-border flex flex-col space-y-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl font-extrabold text-foreground">
                {formatPoishaToBDT(selectedVariant.price)}
              </span>
              {selectedVariant.compareAtPrice &&
                selectedVariant.compareAtPrice > selectedVariant.price && (
                  <span className="text-base text-muted-foreground line-through">
                    {formatPoishaToBDT(selectedVariant.compareAtPrice)}
                  </span>
                )}
              {discountPercent !== null && discountPercent > 0 && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  {t('detail.saveAmount', {
                    amount: formatPoishaToBDT(
                      selectedVariant.compareAtPrice! - selectedVariant.price,
                    ),
                  })}
                </span>
              )}
            </div>

            {/* SKU and Stock Availability */}
            <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-muted-foreground">
              <span>
                {t('detail.sku')}:{' '}
                <strong className="text-foreground">{selectedVariant.sku}</strong>
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
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('detail.selectVariant')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {product.variants.map((v) => {
                  const isSelected = v.id === selectedVariantId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariantId(v.id)}
                      className={`flex flex-col p-3 rounded-xl border text-left transition-all cursor-pointer ${
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
                            Default
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {formatPoishaToBDT(v.price)}
                        </span>
                        {v.isOutOfStock ? (
                          <span className="text-[10px] text-rose-500 font-medium">
                            Out of stock
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            {v.availableStock} available
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ordering Actions (Phase Boundaries Guard) */}
          <div className="p-4 rounded-xl bg-muted/40 border border-border flex flex-col space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="size-4 text-primary shrink-0" />
              <span>{t('detail.orderingComingSoonNotice')}</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                disabled
                size="lg"
                variant="default"
                className="flex-1 flex items-center justify-center gap-2 cursor-not-allowed opacity-75 font-semibold text-sm"
              >
                <ShoppingCart className="size-4" />
                <span>{t('detail.addToCart')}</span>
              </Button>
              <Button
                disabled
                size="lg"
                variant="secondary"
                className="flex-1 flex items-center justify-center gap-2 cursor-not-allowed opacity-75 font-semibold text-sm"
              >
                <Zap className="size-4" />
                <span>{t('detail.buyNow')}</span>
              </Button>
            </div>
          </div>

          {/* Value Props Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="flex items-center gap-2.5 p-3 rounded-xl border border-border bg-card">
              <ShieldCheck className="size-5 text-primary shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-foreground">
                  {product.warranty || t('detail.officialWarranty')}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {t('detail.brandWarranty')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-xl border border-border bg-card">
              <Truck className="size-5 text-primary shrink-0" />
              <div className="flex flex-col">
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
              <div className="flex flex-col">
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

      {/* Tabs / Bottom Content: Specifications & Description */}
      <div className="border border-border rounded-2xl bg-card overflow-hidden">
        {/* Tab Headers */}
        <div className="flex border-b border-border bg-muted/20">
          <button
            type="button"
            onClick={() => setActiveTab('specs')}
            className={`px-6 py-3.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'specs'
                ? 'border-primary text-primary bg-background'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('detail.specificationsTab')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('desc')}
            className={`px-6 py-3.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'desc'
                ? 'border-primary text-primary bg-background'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('detail.descriptionTab')}
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'specs' && (
            <div>
              {Object.keys(groupedSpecs).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {t('detail.noSpecificationsProvided')}
                </p>
              ) : (
                <div className="space-y-6">
                  {Object.entries(groupedSpecs).map(([groupName, specs]) => (
                    <div key={groupName} className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
                        {groupName}
                      </h4>
                      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                        {specs.map((s, idx) => (
                          <div
                            key={idx}
                            className={`grid grid-cols-1 sm:grid-cols-3 p-3 text-xs ${
                              idx % 2 === 0 ? 'bg-card' : 'bg-muted/10'
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
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground leading-relaxed">
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
        </div>
      </div>
    </div>
  );
}
