'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import type { AgingOrderItem } from '@/lib/report-types';

interface AgingOrdersCardProps {
  aging: {
    count: number;
    thresholdHours: number;
    orders: AgingOrderItem[];
  };
}

export function AgingOrdersCard({ aging }: AgingOrdersCardProps) {
  const t = useTranslations('admin.dashboard.aging');
  const tCommon = useTranslations('common');

  const formatCurrency = (poisha: number) => {
    return `৳${(poisha / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <Card className="border-border shadow-2xs">
      <CardHeader className="p-5 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="size-4 text-amber-500" />
            <span>{t('title')}</span>
            {aging.count > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                {aging.count}
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            {t('subtitle', { hours: aging.thresholdHours })}
          </CardDescription>
        </div>

        {aging.count > 0 && (
          <Link href="/admin/orders?status=CONFIRMED">
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              <span>{tCommon('viewAll')}</span>
              <ArrowUpRight className="size-3.5" />
            </Button>
          </Link>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {aging.orders.length === 0 ? (
          <div className="py-10 px-4 text-center space-y-2">
            <div className="size-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
              <CheckCircle2 className="size-5" />
            </div>
            <p className="text-xs font-medium text-foreground">{t('emptyTitle')}</p>
            <p className="text-[11px] text-muted-foreground">{t('emptySubtitle')}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {aging.orders.map((order) => (
              <div
                key={order.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/orders?search=${encodeURIComponent(order.orderNumber)}`}
                      className="font-mono text-xs font-semibold text-primary hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    <Badge
                      variant="outline"
                      className="text-[10px] font-medium border-amber-500/40 text-amber-600 dark:text-amber-400"
                    >
                      {order.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      ({order.paymentMethod})
                    </span>
                  </div>
                  <div className="text-xs text-foreground font-medium">{order.customerName}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t('totalPayableLabel')}:{' '}
                    <span className="font-semibold text-foreground">
                      {formatCurrency(order.totalPayable)}
                    </span>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1.5 shrink-0">
                  <Badge variant="destructive" className="text-[10px] px-2 py-0.5 gap-1">
                    <Clock className="size-3" />
                    <span>{t('elapsedBadge', { hours: order.hoursInStatus })}</span>
                  </Badge>
                  <Link href={`/admin/orders?search=${encodeURIComponent(order.orderNumber)}`}>
                    <Button variant="outline" size="sm" className="h-7 text-xs">
                      {t('actionButton')}
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
