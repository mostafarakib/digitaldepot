import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function AccountNotificationsLoading() {
  return (
    <div
      className="container max-w-4xl mx-auto px-4 py-8"
      aria-busy="true"
      aria-label="Loading notifications"
    >
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border mb-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44 rounded-lg" />
          <Skeleton className="h-4 w-60 rounded" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md self-start" />
      </div>

      {/* Tabs Skeleton */}
      <div className="flex items-center gap-2 border-b border-border pb-3 mb-6">
        <Skeleton className="h-8 w-16 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>

      {/* Notification Rows Skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="border border-border">
            <CardContent className="p-4 sm:p-5 flex items-start gap-4">
              <Skeleton className="size-10 rounded-lg shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-4 w-1/3 rounded" />
                  <Skeleton className="size-2 rounded-full" />
                </div>
                <Skeleton className="h-3 w-4/5 rounded" />
                <Skeleton className="h-2.5 w-24 rounded mt-1" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
