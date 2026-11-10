'use client';

import React, { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ProductCard } from './product-card';
import { CatalogueFilters } from './catalogue-filters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { StorefrontProductListingResponse, CategoryTreeNode } from '@/lib/catalogue-types';
import {
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  PackageSearch,
  ArrowUpDown,
  X,
} from 'lucide-react';

interface ProductListingProps {
  initialData: StorefrontProductListingResponse;
  categories: CategoryTreeNode[];
}

export function ProductListing({ initialData, categories }: ProductListingProps) {
  const t = useTranslations('catalogue');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Extract current query params
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
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleFilterChange = (updates: {
    category?: string;
    brands?: string[];
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    page?: number;
  }) => {
    updateFilters({
      category: updates.category,
      brand: updates.brands && updates.brands.length > 0 ? updates.brands.join(',') : undefined,
      minPrice: updates.minPrice,
      maxPrice: updates.maxPrice,
      inStock: updates.inStock,
      page: updates.page ?? 1,
    });
  };

  const handleClearAll = () => {
    const params = new URLSearchParams();
    if (currentQuery) {
      params.set('q', currentQuery);
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
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
    (currentInStock ? 1 : 0);

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8">
      {/* Top Bar / Breadcrumb / Search summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {currentCategory
              ? categories.find((c) => c.slug === currentCategory)?.name || t('listing.allProducts')
              : t('listing.allProducts')}
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

        {/* Controls: Mobile filter trigger + Sort select */}
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          {/* Mobile Filter Button */}
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

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground hidden sm:inline-block">
              {t('sorting.label')}:
            </span>
            <select
              value={currentSort}
              onChange={(e) => handleSortChange(e.target.value)}
              className="h-9 px-2.5 py-1 text-xs rounded-md border border-input bg-background text-foreground hover:bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
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

      {/* Active Filter Chips Strip */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-6 pb-2 border-b border-border">
          <span className="text-xs text-muted-foreground mr-1">{t('filters.activeFilters')}:</span>
          {currentCategory && (
            <Badge variant="secondary" className="text-xs flex items-center gap-1 py-1">
              <span>
                {categories.find((c) => c.slug === currentCategory)?.name || currentCategory}
              </span>
              <button
                onClick={() => handleFilterChange({ category: undefined })}
                className="hover:text-destructive cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {currentBrands.map((b) => (
            <Badge key={b} variant="secondary" className="text-xs flex items-center gap-1 py-1">
              <span>{facets.brands.find((brand) => brand.slug === b)?.name || b}</span>
              <button
                onClick={() =>
                  handleFilterChange({ brands: currentBrands.filter((brand) => brand !== b) })
                }
                className="hover:text-destructive cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {(currentMinPrice !== undefined || currentMaxPrice !== undefined) && (
            <Badge variant="secondary" className="text-xs flex items-center gap-1 py-1">
              <span>
                ৳{currentMinPrice ? Math.floor(currentMinPrice / 100) : 0} – ৳
                {currentMaxPrice ? Math.floor(currentMaxPrice / 100) : '∞'}
              </span>
              <button
                onClick={() => handleFilterChange({ minPrice: undefined, maxPrice: undefined })}
                className="hover:text-destructive cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {currentInStock && (
            <Badge variant="secondary" className="text-xs flex items-center gap-1 py-1">
              <span>{t('filters.inStockOnly')}</span>
              <button
                onClick={() => handleFilterChange({ inStock: undefined })}
                className="hover:text-destructive cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          <button
            onClick={handleClearAll}
            className="text-xs text-primary hover:underline ml-2 cursor-pointer font-medium"
          >
            {t('filters.clearAll')}
          </button>
        </div>
      )}

      {/* Main Grid: Sidebar + Product Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {/* Desktop Filter Sidebar */}
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

        {/* Product Cards Grid Area */}
        <div className="md:col-span-3 lg:col-span-4 flex flex-col">
          {isPending && (
            <div className="text-xs text-muted-foreground animate-pulse mb-3">
              {t('listing.loadingResults')}
            </div>
          )}

          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-card border border-border rounded-xl">
              <PackageSearch className="size-12 text-muted-foreground/60 mb-3" />
              <h3 className="font-semibold text-foreground text-base mb-1">
                {t('listing.noProductsFound')}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-md mb-4">
                {t('listing.noProductsDescription')}
              </p>
              {activeFilterCount > 0 && (
                <Button variant="outline" size="sm" onClick={handleClearAll}>
                  {t('filters.clearAll')}
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          {/* Pagination Controls */}
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

      {/* Mobile Filter Drawer / Sheet Backdrop */}
      {mobileFilterOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end md:hidden"
          onClick={() => setMobileFilterOpen(false)}
        >
          <div
            className="w-full max-w-xs bg-background h-full p-4 overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <SlidersHorizontal className="size-4" />
                <span>{t('filters.title')}</span>
              </div>
              <button
                onClick={() => setMobileFilterOpen(false)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground"
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
