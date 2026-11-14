'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Boxes, AlertTriangle, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { Link } from '@/i18n/routing';

interface InventoryWatchlistCardProps {
  watchlist: {
    outOfStockCount: number;
    lowStockCount: number;
    topAlerts: Array<{
      sku: string;
      productName: string;
      categoryName: string;
      quantity: number;
      lowStockThreshold: number;
      isOutOfStock: boolean;
    }>;
  };
}

export function InventoryWatchlistCard({ watchlist }: InventoryWatchlistCardProps) {
  const t = useTranslations('admin.dashboard.inventory');
  const tCommon = useTranslations('common');

  const totalAlerts = watchlist.outOfStockCount + watchlist.lowStockCount;

  return (
    <Card className="border-border shadow-2xs">
      <CardHeader className="p-5 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Boxes className="size-4 text-amber-500" />
            <span>{t('title')}</span>
            {totalAlerts > 0 && (
              <Badge
                variant={watchlist.outOfStockCount > 0 ? 'destructive' : 'outline'}
                className="text-[10px] px-1.5 py-0"
              >
                {totalAlerts}
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">{t('subtitle')}</CardDescription>
        </div>

        <Link href="/admin/inventory">
          <Button variant="ghost" size="sm" className="text-xs gap-1">
            <span>{tCommon('viewAll')}</span>
            <ArrowUpRight className="size-3.5" />
          </Button>
        </Link>
      </CardHeader>

      <CardContent className="p-0">
        {/* Count Summaries */}
        <div className="grid grid-cols-2 divide-x divide-border/60 bg-muted/20 border-b border-border/60 text-center">
          <div className="p-3">
            <div
              className={`text-lg font-bold ${watchlist.outOfStockCount > 0 ? 'text-destructive' : 'text-foreground'}`}
            >
              {watchlist.outOfStockCount}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase font-medium mt-0.5">
              {t('outOfStockLabel')}
            </div>
          </div>
          <div className="p-3">
            <div className="text-lg font-bold text-amber-500">{watchlist.lowStockCount}</div>
            <div className="text-[10px] text-muted-foreground uppercase font-medium mt-0.5">
              {t('lowStockLabel')}
            </div>
          </div>
        </div>

        {/* Depleted Items List */}
        {watchlist.topAlerts.length === 0 ? (
          <div className="py-10 px-4 text-center space-y-2">
            <div className="size-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
              <CheckCircle2 className="size-5" />
            </div>
            <p className="text-xs font-medium text-foreground">{t('emptyTitle')}</p>
            <p className="text-[11px] text-muted-foreground">{t('emptySubtitle')}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {watchlist.topAlerts.map((item) => (
              <div key={item.sku} className="p-4 space-y-1.5 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[10px] text-muted-foreground font-semibold">
                    {item.sku}
                  </span>
                  <Badge
                    variant={item.isOutOfStock ? 'destructive' : 'outline'}
                    className={`text-[10px] px-1.5 py-0 ${!item.isOutOfStock ? 'border-amber-500/40 text-amber-600 dark:text-amber-400' : ''}`}
                  >
                    {item.isOutOfStock
                      ? t('outOfStockBadge')
                      : `${item.quantity} ${t('unitsLeftBadge')}`}
                  </Badge>
                </div>
                <h4 className="text-xs font-semibold text-foreground line-clamp-1">
                  {item.productName}
                </h4>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                  <span>{item.categoryName}</span>
                  <span>
                    {t('thresholdLabel')}: {item.lowStockThreshold}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
