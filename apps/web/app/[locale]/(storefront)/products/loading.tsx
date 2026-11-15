import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductGridSkeleton } from '@/components/storefront/product-card-skeleton';

export default function ProductsLoading() {
  return (
    <div className="container mx-auto px-4 py-8" aria-busy="true" aria-label="Loading products">
      {/* Header bar skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border mb-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48 rounded-lg" />
          <Skeleton className="h-4 w-72 rounded" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>
      </div>

      {/* Main Grid: Sidebar + Product Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {/* Desktop Sidebar Skeleton */}
        <div className="hidden md:block md:col-span-1 space-y-6">
          <div className="space-y-3 p-4 rounded-xl border border-border bg-card/60">
            <Skeleton className="h-4 w-28 rounded" />
            <div className="space-y-2 pt-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-6 w-full rounded" />
              ))}
            </div>
          </div>
          <div className="space-y-3 p-4 rounded-xl border border-border bg-card/60">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-8 w-full rounded" />
          </div>
        </div>

        {/* Product Cards Grid Skeleton */}
        <div className="md:col-span-3 lg:col-span-4">
          <ProductGridSkeleton count={8} />
        </div>
      </div>
    </div>
  );
}
