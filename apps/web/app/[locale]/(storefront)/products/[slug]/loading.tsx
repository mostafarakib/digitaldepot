import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProductDetailLoading() {
  return (
    <div
      className="container mx-auto px-4 py-6 sm:py-8"
      aria-busy="true"
      aria-label="Loading product details"
    >
      {/* Breadcrumb Skeleton */}
      <div className="flex items-center gap-2 mb-6">
        <Skeleton className="h-3.5 w-16 rounded" />
        <span className="text-muted-foreground/40">/</span>
        <Skeleton className="h-3.5 w-24 rounded" />
        <span className="text-muted-foreground/40">/</span>
        <Skeleton className="h-3.5 w-40 rounded" />
      </div>

      {/* Main Showcase Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 mb-12">
        {/* Left: Gallery Skeleton (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="aspect-square w-full rounded-2xl border border-border bg-card p-8 flex items-center justify-center">
            <Skeleton className="size-3/4 rounded-xl" />
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="size-16 sm:size-20 rounded-xl" />
            ))}
          </div>
        </div>

        {/* Right: Info Skeleton (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-8 w-4/5 rounded-lg" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-2/3 rounded" />
          </div>

          {/* Pricing card skeleton */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <Skeleton className="h-9 w-44 rounded-md" />
            <div className="flex justify-between pt-2 border-t border-border/50">
              <Skeleton className="h-4 w-28 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
            </div>
          </div>

          {/* Variant selector skeleton */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-32 rounded" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          </div>

          {/* CTA Buttons skeleton */}
          <div className="flex items-center gap-3 pt-2">
            <Skeleton className="h-11 flex-1 rounded-xl" />
            <Skeleton className="h-11 flex-1 rounded-xl" />
            <Skeleton className="size-11 rounded-xl shrink-0" />
          </div>

          {/* Value props skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
