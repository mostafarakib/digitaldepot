'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Banknote, CreditCard, Truck, RotateCcw, ShoppingBag } from 'lucide-react';

interface OperationalKpisProps {
  financials: {
    todayDeliveredMerchandisePoisha: number;
    todayDeliveredShippingPoisha: number;
    todayGrossDeliveredSalesPoisha: number;
    todayCompletedRefundsPoisha: number;
    todayNetDeliveredSalesPoisha: number;
    todayCapturedCashPoisha: number;
    todayNetRetainedCashPoisha: number;
    pendingCodOrdersCount: number;
    pendingCodCollectionsPoisha: number;
  };
  pipeline: {
    activeOrdersCount: number;
  };
  returnsQueue: {
    pendingReviewsCount: number;
    pendingInspectionsCount: number;
    pendingRefundsCount: number;
    pendingRefundsPoisha: number;
  };
}

export function OperationalKpis({ financials, pipeline, returnsQueue }: OperationalKpisProps) {
  const t = useTranslations('admin.dashboard.kpis');

  const formatCurrency = (poisha: number) => {
    return `৳${(poisha / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const kpis = [
    {
      title: t('deliveredSalesTitle'),
      value: formatCurrency(financials.todayGrossDeliveredSalesPoisha),
      subtitle: t('deliveredSalesSubtitle'),
      pill: `${t('netLabel')}: ${formatCurrency(financials.todayNetDeliveredSalesPoisha)}`,
      icon: Banknote,
      color: 'text-emerald-500 dark:text-emerald-400',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
      borderColor: 'border-emerald-200 dark:border-emerald-800/40',
    },
    {
      title: t('capturedCashTitle'),
      value: formatCurrency(financials.todayCapturedCashPoisha),
      subtitle: t('capturedCashSubtitle'),
      pill: `${t('netRetainedLabel')}: ${formatCurrency(financials.todayNetRetainedCashPoisha)}`,
      icon: CreditCard,
      color: 'text-blue-500 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950/40',
      borderColor: 'border-blue-200 dark:border-blue-800/40',
    },
    {
      title: t('awaitingCodTitle'),
      value: formatCurrency(financials.pendingCodCollectionsPoisha),
      subtitle: `${financials.pendingCodOrdersCount} ${t('awaitingCodSubtitle')}`,
      pill: t('awaitingCodNote'),
      icon: Truck,
      color: 'text-amber-500 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-950/40',
      borderColor: 'border-amber-200 dark:border-amber-800/40',
    },
    {
      title: t('activePipelineTitle'),
      value: `${pipeline.activeOrdersCount}`,
      subtitle: t('activePipelineSubtitle'),
      pill: t('activePipelineNote'),
      icon: ShoppingBag,
      color: 'text-indigo-500 dark:text-indigo-400',
      bgColor: 'bg-indigo-50 dark:bg-indigo-950/40',
      borderColor: 'border-indigo-200 dark:border-indigo-800/40',
    },
    {
      title: t('pendingRefundsTitle'),
      value: formatCurrency(returnsQueue.pendingRefundsPoisha),
      subtitle: `${returnsQueue.pendingReviewsCount + returnsQueue.pendingInspectionsCount} ${t('pendingReturnsSubtitle')}`,
      pill: `${returnsQueue.pendingRefundsCount} ${t('payoutsPendingLabel')}`,
      icon: RotateCcw,
      color: 'text-purple-500 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-950/40',
      borderColor: 'border-purple-200 dark:border-purple-800/40',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {kpis.map((kpi, idx) => {
        const Icon = kpi.icon;
        return (
          <Card key={idx} className="border-border shadow-2xs hover:shadow-xs transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-2 space-y-0">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {kpi.title}
              </span>
              <div
                className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${kpi.bgColor} ${kpi.color}`}
              >
                <Icon className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-2">
              <div className="text-xl font-bold tracking-tight text-foreground">{kpi.value}</div>
              <div className="text-[11px] text-muted-foreground line-clamp-1">{kpi.subtitle}</div>
              <div className="pt-1 border-t border-border/50">
                <span className="inline-block text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                  {kpi.pill}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
