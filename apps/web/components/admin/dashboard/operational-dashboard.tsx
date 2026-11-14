'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, BarChart3, RefreshCw, Loader2, AlertTriangle, Radio } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { getAdminOverviewReportApi } from '@/lib/api-client';
import type { OverviewReportResponse } from '@/lib/report-types';
import { OperationalKpis } from './operational-kpis';
import { FulfillmentPipeline } from './fulfillment-pipeline';
import { AgingOrdersCard } from './aging-orders-card';
import { ReturnsRefundsQueue } from './returns-refunds-queue';
import { InventoryWatchlistCard } from './inventory-watchlist-card';
import { RecentActivityCard } from './recent-activity-card';

export function OperationalDashboard() {
  const t = useTranslations('admin.dashboard');
  const tCommon = useTranslations('common');

  const [data, setData] = useState<OverviewReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBackgroundError, setIsBackgroundError] = useState<boolean>(false);

  // Handle auto-refresh interval and tab visibility
  useEffect(() => {
    let ignore = false;
    let intervalId: NodeJS.Timeout | null = null;

    const runFetch = async (isBackground: boolean) => {
      try {
        const res = await getAdminOverviewReportApi();
        if (!ignore) {
          setData(res);
          setLastUpdated(new Date());
          setError(null);
          setIsBackgroundError(false);
          setIsLoading(false);
          setIsRefreshing(false);
        }
      } catch (err) {
        if (!ignore) {
          setData((prev) => {
            if (!prev) {
              setError(err instanceof Error ? err.message : t('loadError'));
            } else {
              setIsBackgroundError(true);
            }
            return prev;
          });
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    // Initial load
    runFetch(false);

    // Setup 30s interval when autoRefresh is enabled
    if (autoRefresh) {
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible' && !ignore) {
          runFetch(true);
        }
      }, 30000);
    }

    // Visibility change handler: immediate refresh when returning to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && autoRefresh && !ignore) {
        runFetch(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      ignore = true;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoRefresh, t]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    getAdminOverviewReportApi()
      .then((res) => {
        setData(res);
        setLastUpdated(new Date());
        setError(null);
        setIsBackgroundError(false);
        setIsRefreshing(false);
      })
      .catch((err) => {
        setData((prev) => {
          if (!prev) {
            setError(err instanceof Error ? err.message : t('loadError'));
          } else {
            setIsBackgroundError(true);
          }
          return prev;
        });
        setIsRefreshing(false);
      });
  };

  const formatLastUpdated = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  if (isLoading && !data) {
    return (
      <div className="py-24 flex flex-col items-center justify-center space-y-4 text-muted-foreground">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm font-medium">{t('loadingDashboard')}</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4">
        <div className="size-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
          <AlertTriangle className="size-6" />
        </div>
        <h2 className="text-lg font-bold text-foreground">{t('errorTitle')}</h2>
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button onClick={handleManualRefresh} className="text-xs gap-1.5">
          <RefreshCw className="size-3.5" />
          <span>{tCommon('tryAgain')}</span>
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <LayoutDashboard className="size-6 text-primary" />
            <span>{t('headerTitle')}</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{t('headerSubtitle')}</p>
        </div>

        {/* Live Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Background Warning Banner */}
          {isBackgroundError && (
            <span className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md">
              <AlertTriangle className="size-3.5" />
              <span>{t('reconnectingNote')}</span>
            </span>
          )}

          {/* Last Updated Timestamp */}
          {lastUpdated && (
            <span className="text-[11px] text-muted-foreground font-mono">
              {t('lastUpdatedLabel')}: {formatLastUpdated(lastUpdated)}
            </span>
          )}

          {/* Auto Refresh Toggle */}
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              autoRefresh
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-muted border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Radio className={`size-3.5 ${autoRefresh ? 'animate-pulse' : ''}`} />
            <span>{autoRefresh ? t('autoRefreshActive') : t('autoRefreshPaused')}</span>
          </button>

          {/* Manual Refresh Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="text-xs gap-1.5 h-8"
          >
            <RefreshCw className={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{tCommon('refresh')}</span>
          </Button>

          {/* Link to Analytics */}
          <Link href="/admin/reports">
            <Button
              size="sm"
              className="text-xs gap-1.5 h-8 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <BarChart3 className="size-3.5" />
              <span>{t('reportsLink')}</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* 1. Primary Operational KPIs */}
      <OperationalKpis
        financials={data.financials}
        pipeline={data.pipeline}
        returnsQueue={data.returnsQueue}
      />

      {/* 2. Fulfillment Status Funnel */}
      <FulfillmentPipeline pipeline={data.pipeline} />

      {/* 3. Operational Attention & Watchlists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Aging / Stale Orders (>24h) */}
          <AgingOrdersCard aging={data.agingOrders} />

          {/* Returns & Refunds Operational Queue */}
          <ReturnsRefundsQueue returnsQueue={data.returnsQueue} />
        </div>

        <div className="space-y-6">
          {/* Critical Inventory Watchlist */}
          <InventoryWatchlistCard watchlist={data.inventoryWatchlist} />

          {/* Recent Orders & Live Operational Activities */}
          <RecentActivityCard
            recentOrders={data.recentOrders}
            recentActivities={data.recentActivities}
          />
        </div>
      </div>
    </div>
  );
}
