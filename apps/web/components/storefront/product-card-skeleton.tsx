import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export function ProductCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-xs"
    >
      {/* Image Skeleton */}
      <div className="aspect-square w-full bg-muted/40 p-6 flex items-center justify-center">
        <Skeleton className="size-3/4 rounded-lg" />
      </div>

      {/* Details Skeleton */}
      <div className="flex flex-col flex-1 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3 w-1/3 rounded" />
          <Skeleton className="h-3 w-1/4 rounded" />
        </div>
        <Skeleton className="h-4 w-5/6 rounded" />
        <Skeleton className="h-3 w-2/3 rounded" />

        <div className="mt-auto pt-3 border-t border-border/50 flex items-end justify-between gap-2">
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-5 w-1/2 rounded" />
            <Skeleton className="h-2.5 w-1/3 rounded" />
          </div>
          <Skeleton className="size-9 rounded-lg shrink-0" />
        </div>
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
