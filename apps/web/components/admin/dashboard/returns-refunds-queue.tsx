'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RotateCcw, AlertTriangle, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { Link } from '@/i18n/routing';
import type { UrgentReturnItem } from '@/lib/report-types';

interface ReturnsRefundsQueueProps {
  returnsQueue: {
    pendingReviewsCount: number;
    pendingInspectionsCount: number;
    pendingRefundsCount: number;
    pendingRefundsPoisha: number;
    failedRefundsCount: number;
    urgentReturns: UrgentReturnItem[];
  };
}

export function ReturnsRefundsQueue({ returnsQueue }: ReturnsRefundsQueueProps) {
  const t = useTranslations('admin.dashboard.returnsQueue');
  const tCommon = useTranslations('common');

  const formatCurrency = (poisha: number) => {
    return `৳${(poisha / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const totalPending =
    returnsQueue.pendingReviewsCount +
    returnsQueue.pendingInspectionsCount +
    returnsQueue.pendingRefundsCount;

  return (
    <Card className="border-border shadow-2xs">
      <CardHeader className="p-5 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <RotateCcw className="size-4 text-purple-500" />
            <span>{t('title')}</span>
            {totalPending > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-purple-500/40 text-purple-600 dark:text-purple-400"
              >
                {totalPending}
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">{t('subtitle')}</CardDescription>
        </div>

        <Link href="/admin/returns">
          <Button variant="ghost" size="sm" className="text-xs gap-1">
            <span>{tCommon('viewAll')}</span>
            <ArrowUpRight className="size-3.5" />
          </Button>
        </Link>
      </CardHeader>

      <CardContent className="p-0">
        {/* Status Breakdown Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border/60 bg-muted/20 border-b border-border/60 text-center">
          <div className="p-3">
            <div className="text-lg font-bold text-foreground">
              {returnsQueue.pendingReviewsCount}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase font-medium mt-0.5">
              {t('reviewsPending')}
            </div>
          </div>
          <div className="p-3">
            <div className="text-lg font-bold text-foreground">
              {returnsQueue.pendingInspectionsCount}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase font-medium mt-0.5">
              {t('inspectionsPending')}
            </div>
          </div>
          <div className="p-3">
            <div className="text-lg font-bold text-foreground">
              {returnsQueue.pendingRefundsCount}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase font-medium mt-0.5">
              {t('payoutsPending')}
            </div>
          </div>
          <div className="p-3">
            <div
              className={`text-lg font-bold ${returnsQueue.failedRefundsCount > 0 ? 'text-destructive' : 'text-foreground'}`}
            >
              {returnsQueue.failedRefundsCount}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase font-medium mt-0.5">
              {t('failedRefunds')}
            </div>
          </div>
        </div>

        {/* Failed Refunds Alert Banner */}
        {returnsQueue.failedRefundsCount > 0 && (
          <div className="p-3 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between text-xs text-red-600 dark:text-red-400">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{t('failedRefundsAlert', { count: returnsQueue.failedRefundsCount })}</span>
            </div>
            <Link href="/admin/payments?status=REFUNDED">
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] border-red-500/30 text-red-600 dark:text-red-400"
              >
                {t('resolveAction')}
              </Button>
            </Link>
          </div>
        )}

        {/* Urgent Returns List */}
        {returnsQueue.urgentReturns.length === 0 ? (
          <div className="py-10 px-4 text-center space-y-2">
            <div className="size-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
              <CheckCircle2 className="size-5" />
            </div>
            <p className="text-xs font-medium text-foreground">{t('emptyTitle')}</p>
            <p className="text-[11px] text-muted-foreground">{t('emptySubtitle')}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {returnsQueue.urgentReturns.map((ret) => (
              <div
                key={ret.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/returns?search=${encodeURIComponent(ret.returnNumber)}`}
                      className="font-mono text-xs font-semibold text-primary hover:underline"
                    >
                      {ret.returnNumber}
                    </Link>
                    <Badge
                      variant={ret.status === 'REQUESTED' ? 'secondary' : 'outline'}
                      className="text-[10px]"
                    >
                      {ret.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-foreground font-medium">
                    {ret.customerName} &bull;{' '}
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {ret.orderNumber}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t('estimatedRefundLabel')}:{' '}
                    <span className="font-semibold text-foreground">
                      {formatCurrency(ret.estimatedRefundAmount)}
                    </span>
                  </div>
                </div>

                <div className="shrink-0">
                  <Link href={`/admin/returns?search=${encodeURIComponent(ret.returnNumber)}`}>
                    <Button variant="outline" size="sm" className="h-7 text-xs">
                      {ret.status === 'REQUESTED' ? t('reviewAction') : t('inspectAction')}
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
