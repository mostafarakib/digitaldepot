'use client';

import React, { useState, useTransition, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ProductCard } from './product-card';
import { ProductGridSkeleton } from './product-card-skeleton';
import { CatalogueFilters } from './catalogue-filters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useModalA11y } from '@/hooks/use-modal-a11y';
import { formatPoishaToBDT } from '@/lib/utils';
import type { StorefrontProductListingResponse, CategoryTreeNode } from '@/lib/catalogue-types';
import {
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  PackageSearch,
  X,
} from 'lucide-react';

interface ProductListingProps {
  initialData: StorefrontProductListingResponse;
  categories: CategoryTreeNode[];
}

export function ProductListing({ initialData, categories }: ProductListingProps) {
  const t = useTranslations('catalogue');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const filterDrawerRef = useRef<HTMLDivElement>(null);

  useModalA11y({
    isOpen: mobileFilterOpen,
    onClose: () => setMobileFilterOpen(false),
    containerRef: filterDrawerRef,
  });

  const currentCategory = searchParams.get('category') || undefined;
  const currentBrands = searchParams.get('brand')
    ? searchParams.get('brand')!.split(',').filter(Boolean)
    : [];
  const currentMinPrice = searchParams.get('minPrice')
    ? parseInt(searchParams.get('minPrice')!, 10)
    : undefined;
  const currentMaxPrice = searchParams.get('maxPrice')
    ? parseInt(searchParams.get('maxPrice')!, 10)
    : undefined;
  const currentInStock = searchParams.get('inStock') === 'true';
  const currentFeatured = searchParams.get('featured') === 'true';
  const currentSort = searchParams.get('sort') || 'featured';
  const currentQuery = searchParams.get('q') || '';
  const currentPage = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1;

  const updateFilters = (newParams: Record<string, string | number | boolean | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, val] of Object.entries(newParams)) {
      if (val === undefined || val === '' || val === false) {
        params.delete(key);
      } else {
        params.set(key, String(val));
      }
    }

    startTransition(() => {
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  };

  const handleFilterChange = (updates: {
    category?: string;
    brands?: string[];
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    featured?: boolean;
    page?: number;
  }) => {
    const payload: Record<string, string | number | boolean | undefined> = {
      page: updates.page ?? 1,
    };
    if ('category' in updates) payload.category = updates.category;
    if ('brands' in updates) {
      payload.brand =
        updates.brands && updates.brands.length > 0 ? updates.brands.join(',') : undefined;
    }
    if ('minPrice' in updates) payload.minPrice = updates.minPrice;
    if ('maxPrice' in updates) payload.maxPrice = updates.maxPrice;
    if ('inStock' in updates) payload.inStock = updates.inStock;
    if ('featured' in updates) payload.featured = updates.featured;

    updateFilters(payload);
  };

  const handleClearAll = () => {
    const params = new URLSearchParams();
    if (currentQuery) {
      params.set('q', currentQuery);
    }
    startTransition(() => {
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  };

  const handleSortChange = (newSort: string) => {
    updateFilters({ sort: newSort, page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    updateFilters({ page: newPage });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const { products, facets, pagination } = initialData;

  const activeFilterCount =
    (currentCategory ? 1 : 0) +
    currentBrands.length +
    (currentMinPrice !== undefined || currentMaxPrice !== undefined ? 1 : 0) +
    (currentInStock ? 1 : 0) +
    (currentFeatured ? 1 : 0);

  const selectedCategoryName = currentCategory
    ? categories.find((c) => c.slug === currentCategory)?.name || currentCategory
    : null;

  const pageHeading = selectedCategoryName
    ? selectedCategoryName
    : currentFeatured
      ? t('listing.featuredProductsHeading')
      : t('listing.allProducts');

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {pageHeading}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {t('listing.showingCount', {
              from: pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1,
              to: Math.min(pagination.page * pagination.limit, pagination.total),
              total: pagination.total,
            })}
            {currentQuery && ` • ${t('listing.searchResultFor', { query: currentQuery })}`}
          </p>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-2.5 w-full md:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMobileFilterOpen(true)}
            className="md:hidden text-xs flex items-center gap-1.5 h-9"
          >
            <SlidersHorizontal className="size-3.5" />
            <span>{t('filters.title')}</span>
            {activeFilterCount > 0 && (
              <Badge
                variant="secondary"
                className="size-4 p-0 flex items-center justify-center text-[10px] ml-1"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>

          <div className="flex items-center gap-1.5">
            <label
              htmlFor="catalogue-sort-select"
              className="text-xs text-muted-foreground hidden sm:inline-block"
            >
              {t('sorting.label')}:
            </label>
            <select
              id="catalogue-sort-select"
              value={currentSort}
              onChange={(e) => handleSortChange(e.target.value)}
              className="h-9 px-2.5 py-1 text-xs rounded-md border border-input bg-background text-foreground hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            >
              <option value="featured">{t('sorting.featured')}</option>
              <option value="newest">{t('sorting.newest')}</option>
              <option value="price-asc">{t('sorting.priceAsc')}</option>
              <option value="price-desc">{t('sorting.priceDesc')}</option>
              <option value="name-asc">{t('sorting.nameAsc')}</option>
              <option value="name-desc">{t('sorting.nameDesc')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Active Filter Chips */}
      {(activeFilterCount > 0 || currentQuery) && (
        <div className="flex items-center gap-1.5 flex-wrap mb-6 pb-3 border-b border-border">
          <span className="text-xs text-muted-foreground mr-1">{t('filters.activeFilters')}:</span>
          {currentQuery && (
            <Badge variant="secondary" className="text-xs flex items-center gap-1 py-1">
              <span>“{currentQuery}”</span>
              <button
                type="button"
                onClick={() => updateFilters({ q: undefined, page: 1 })}
                className="hover:text-destructive cursor-pointer"
                aria-label="Clear search query"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {currentFeatured && (
            <Badge variant="secondary" className="text-xs flex items-center gap-1 py-1">
              <span>{t('listing.featuredBadge')}</span>
              <button
                type="button"
                onClick={() => handleFilterChange({ featured: undefined })}
                className="hover:text-destructive cursor-pointer"
                aria-label="Remove featured filter"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {currentCategory && (
            <Badge variant="secondary" className="text-xs flex items-center gap-1 py-1">
              <span>{selectedCategoryName}</span>
              <button
                type="button"
                onClick={() => handleFilterChange({ category: undefined })}
                className="hover:text-destructive cursor-pointer"
                aria-label="Remove category filter"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {currentBrands.map((b) => (
            <Badge key={b} variant="secondary" className="text-xs flex items-center gap-1 py-1">
              <span>{facets.brands.find((brand) => brand.slug === b)?.name || b}</span>
              <button
                type="button"
                onClick={() =>
                  handleFilterChange({ brands: currentBrands.filter((brand) => brand !== b) })
                }
                className="hover:text-destructive cursor-pointer"
                aria-label={`Remove ${b} filter`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {(currentMinPrice !== undefined || currentMaxPrice !== undefined) && (
            <Badge variant="secondary" className="text-xs flex items-center gap-1 py-1">
              <span>
                {currentMinPrice !== undefined ? formatPoishaToBDT(currentMinPrice, locale) : '৳0'} –{' '}
                {currentMaxPrice !== undefined ? formatPoishaToBDT(currentMaxPrice, locale) : '∞'}
              </span>
              <button
                type="button"
                onClick={() => handleFilterChange({ minPrice: undefined, maxPrice: undefined })}
                className="hover:text-destructive cursor-pointer"
                aria-label="Remove price range filter"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {currentInStock && (
            <Badge variant="secondary" className="text-xs flex items-center gap-1 py-1">
              <span>{t('filters.inStockOnly')}</span>
              <button
                type="button"
                onClick={() => handleFilterChange({ inStock: undefined })}
                className="hover:text-destructive cursor-pointer"
                aria-label="Remove in-stock filter"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-xs text-primary hover:underline ml-2 cursor-pointer font-medium"
            >
              {t('filters.clearAll')}
            </button>
          )}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-6">
        <div className="hidden md:block md:col-span-1">
          <CatalogueFilters
            categories={categories}
            facets={facets}
            selectedCategory={currentCategory}
            selectedBrands={currentBrands}
            minPrice={currentMinPrice}
            maxPrice={currentMaxPrice}
            inStockOnly={currentInStock}
            onFilterChange={handleFilterChange}
            onClearAll={handleClearAll}
          />
        </div>

        <div className="md:col-span-3 lg:col-span-4 flex flex-col">
          {isPending ? (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground animate-pulse mb-3">
                {t('listing.loadingResults')}
              </div>
              <ProductGridSkeleton count={products.length || 8} />
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              icon={<PackageSearch className="size-8" />}
              title={t('listing.noProductsFound')}
              description={t('listing.noProductsDescription')}
              action={
                activeFilterCount > 0 || currentQuery ? (
                  <Button variant="outline" size="sm" onClick={() => router.push('/products')}>
                    {t('filters.clearAll')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10 pt-4 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasPrevPage}
                onClick={() => handlePageChange(currentPage - 1)}
                className="h-8 text-xs flex items-center gap-1"
              >
                <ChevronLeft className="size-3.5" />
                <span>{t('listing.previous')}</span>
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                  .filter(
                    (p) => p === 1 || p === pagination.totalPages || Math.abs(p - currentPage) <= 1,
                  )
                  .map((p, idx, arr) => {
                    const prev = arr[idx - 1];
                    const hasGap = prev && p - prev > 1;
                    return (
                      <React.Fragment key={p}>
                        {hasGap && <span className="text-xs text-muted-foreground px-1">…</span>}
                        <Button
                          variant={currentPage === p ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handlePageChange(p)}
                          className={`size-8 text-xs p-0 ${currentPage === p ? 'font-bold' : ''}`}
                        >
                          {p}
                        </Button>
                      </React.Fragment>
                    );
                  })}
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasNextPage}
                onClick={() => handlePageChange(currentPage + 1)}
                className="h-8 text-xs flex items-center gap-1"
              >
                <span>{t('listing.next')}</span>
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Filter Drawer */}
      {mobileFilterOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end md:hidden"
          onClick={() => setMobileFilterOpen(false)}
        >
          <div
            ref={filterDrawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('filters.title')}
            className="w-full max-w-xs bg-background h-full p-4 overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <SlidersHorizontal className="size-4" />
                <span>{t('filters.title')}</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                aria-label={t('filters.clearAll')}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <CatalogueFilters
              categories={categories}
              facets={facets}
              selectedCategory={currentCategory}
              selectedBrands={currentBrands}
              minPrice={currentMinPrice}
              maxPrice={currentMaxPrice}
              inStockOnly={currentInStock}
              onFilterChange={(updates) => {
                handleFilterChange(updates);
                setMobileFilterOpen(false);
              }}
              onClearAll={() => {
                handleClearAll();
                setMobileFilterOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
