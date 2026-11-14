'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ShoppingBag,
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  RotateCcw,
  Boxes,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import type { OperationalActivityItem } from '@/lib/report-types';

interface RecentActivityCardProps {
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    totalPayable: number;
    status: string;
    paymentStatus: string;
    paymentMethod: string;
    createdAt: string;
  }>;
  recentActivities: OperationalActivityItem[];
}

export function RecentActivityCard({ recentOrders, recentActivities }: RecentActivityCardProps) {
  const t = useTranslations('admin.dashboard.activities');
  const tCommon = useTranslations('common');
  const [activeTab, setActiveTab] = useState<'orders' | 'activities'>('orders');

  const formatCurrency = (poisha: number) => {
    return `৳${(poisha / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatTimestamp = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'ORDER':
        return ShoppingBag;
      case 'RETURN':
        return RotateCcw;
      case 'INVENTORY':
        return Boxes;
      default:
        return Activity;
    }
  };

  return (
    <Card className="border-border shadow-2xs">
      <CardHeader className="p-5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="size-4 text-blue-500" />
            <span>{t('title')}</span>
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">{t('subtitle')}</CardDescription>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center gap-1 p-0.5 bg-muted rounded-lg border border-border/60">
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
              activeTab === 'orders'
                ? 'bg-background text-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('recentOrdersTab')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('activities')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
              activeTab === 'activities'
                ? 'bg-background text-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('auditTrailTab')}
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {activeTab === 'orders' ? (
          <div>
            {recentOrders.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                {t('noRecentOrders')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/40 text-muted-foreground border-b border-border/60">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">{t('orderCol')}</th>
                      <th className="py-2.5 px-4 font-semibold">{t('customerCol')}</th>
                      <th className="py-2.5 px-4 font-semibold">{t('totalCol')}</th>
                      <th className="py-2.5 px-4 font-semibold">{t('statusCol')}</th>
                      <th className="py-2.5 px-4 font-semibold text-right">{t('actionCol')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold text-primary">
                          <Link
                            href={`/admin/orders?search=${encodeURIComponent(order.orderNumber)}`}
                            className="hover:underline"
                          >
                            {order.orderNumber}
                          </Link>
                          <div className="text-[10px] text-muted-foreground font-sans">
                            {formatTimestamp(order.createdAt)}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-foreground">
                          {order.customerName}
                        </td>
                        <td className="py-3 px-4 font-semibold text-foreground">
                          {formatCurrency(order.totalPayable)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1 items-start">
                            <Badge
                              variant={order.status === 'DELIVERED' ? 'default' : 'secondary'}
                              className="text-[10px] px-1.5 py-0"
                            >
                              {order.status}
                            </Badge>
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              {order.paymentStatus === 'PAID' ? (
                                <CheckCircle2 className="size-2.5 text-emerald-500" />
                              ) : (
                                <Clock className="size-2.5 text-amber-500" />
                              )}
                              <span>
                                {order.paymentStatus} ({order.paymentMethod})
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link
                            href={`/admin/orders?search=${encodeURIComponent(order.orderNumber)}`}
                          >
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                              <span>{tCommon('view')}</span>
                              <ArrowUpRight className="size-3" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {recentActivities.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                {t('noRecentActivities')}
              </div>
            ) : (
              recentActivities.map((act) => {
                const Icon = getCategoryIcon(act.category);
                return (
                  <div
                    key={act.id}
                    className="p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="size-8 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground mt-0.5">
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="font-semibold text-foreground truncate">
                          {act.description}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                          {formatTimestamp(act.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                          {act.category}
                        </Badge>
                        <span>
                          {t('actorLabel')}:{' '}
                          <strong className="font-medium text-foreground">{act.actorName}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
