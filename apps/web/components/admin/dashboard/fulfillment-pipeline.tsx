'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Boxes,
  Clock,
  PackageCheck,
  Truck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { Link } from '@/i18n/routing';

interface FulfillmentPipelineProps {
  pipeline: {
    activeOrdersCount: number;
    pendingOnlineCount: number;
    awaitingProcessingCount: number;
    awaitingShipmentCount: number;
    inTransitCount: number;
    deliveredTodayCount: number;
    cancelledTodayCount: number;
    failedPaymentsLast24hCount: number;
  };
}

export function FulfillmentPipeline({ pipeline }: FulfillmentPipelineProps) {
  const t = useTranslations('admin.dashboard.pipeline');

  const stages = [
    {
      id: 'pendingOnline',
      title: t('pendingOnlineTitle'),
      count: pipeline.pendingOnlineCount,
      description: t('pendingOnlineDesc'),
      icon: Clock,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      href: '/admin/orders?status=PENDING',
    },
    {
      id: 'confirmed',
      title: t('awaitingProcessingTitle'),
      count: pipeline.awaitingProcessingCount,
      description: t('awaitingProcessingDesc'),
      icon: Boxes,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      href: '/admin/orders?status=CONFIRMED',
    },
    {
      id: 'processing',
      title: t('awaitingShipmentTitle'),
      count: pipeline.awaitingShipmentCount,
      description: t('awaitingShipmentDesc'),
      icon: PackageCheck,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-500/10',
      borderColor: 'border-indigo-500/20',
      href: '/admin/orders?status=PROCESSING',
    },
    {
      id: 'shipped',
      title: t('inTransitTitle'),
      count: pipeline.inTransitCount,
      description: t('inTransitDesc'),
      icon: Truck,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/20',
      href: '/admin/orders?status=SHIPPED',
    },
    {
      id: 'delivered',
      title: t('deliveredTodayTitle'),
      count: pipeline.deliveredTodayCount,
      description: t('deliveredTodayDesc'),
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
      href: '/admin/orders?status=DELIVERED',
    },
  ];

  return (
    <Card className="border-border shadow-2xs">
      <CardHeader className="p-5 pb-3 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Truck className="size-4 text-primary" />
            <span>{t('sectionTitle')}</span>
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            {t('sectionSubtitle', { count: pipeline.activeOrdersCount })}
          </CardDescription>
        </div>

        {/* Secondary Indicators */}
        <div className="flex items-center gap-2 text-xs">
          {pipeline.cancelledTodayCount > 0 && (
            <Badge
              variant="outline"
              className="text-muted-foreground border-border text-[11px] gap-1 px-2 py-0.5"
            >
              <XCircle className="size-3 text-red-500" />
              <span>
                {pipeline.cancelledTodayCount} {t('cancelledTodayBadge')}
              </span>
            </Badge>
          )}
          {pipeline.failedPaymentsLast24hCount > 0 && (
            <Badge variant="destructive" className="text-[11px] gap-1 px-2 py-0.5">
              <AlertTriangle className="size-3" />
              <span>
                {pipeline.failedPaymentsLast24hCount} {t('failedPaymentsBadge')}
              </span>
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {stages.map((stage) => {
            const Icon = stage.icon;
            return (
              <Link
                key={stage.id}
                href={stage.href}
                className={`group relative p-4 rounded-xl border transition-all hover:shadow-xs flex flex-col justify-between ${stage.borderColor} ${stage.bgColor}`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`p-2 rounded-lg bg-background/80 shadow-2xs ${stage.color}`}>
                      <Icon className="size-4" />
                    </span>
                    <span className="text-2xl font-extrabold text-foreground tracking-tight">
                      {stage.count}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                    {stage.title}
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                    {stage.description}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground group-hover:text-primary">
                  <span>{t('viewStageOrders')}</span>
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
