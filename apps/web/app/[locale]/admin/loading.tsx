import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading admin dashboard">
      {/* Admin Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-48 rounded-lg bg-slate-800/80" />
          <Skeleton className="h-4 w-72 rounded bg-slate-800/60" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-24 rounded-md bg-slate-800/80" />
          <Skeleton className="h-9 w-32 rounded-md bg-slate-800/80" />
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-24 rounded bg-slate-800/70" />
              <Skeleton className="size-8 rounded-lg bg-slate-800/80" />
            </div>
            <Skeleton className="h-7 w-32 rounded-md bg-slate-800/90" />
            <Skeleton className="h-3 w-40 rounded bg-slate-800/50" />
          </div>
        ))}
      </div>

      {/* Table / Content Area Skeleton */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-36 rounded bg-slate-800/80" />
          <Skeleton className="h-8 w-28 rounded-md bg-slate-800/70" />
        </div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2 border-b border-slate-800/40"
            >
              <Skeleton className="h-4 w-32 rounded bg-slate-800/70" />
              <Skeleton className="h-4 w-48 rounded bg-slate-800/60" />
              <Skeleton className="h-4 w-20 rounded bg-slate-800/70" />
              <Skeleton className="h-6 w-16 rounded-full bg-slate-800/80" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
