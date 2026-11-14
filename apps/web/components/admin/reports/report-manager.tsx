'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  BarChart3,
  TrendingUp,
  CreditCard,
  Banknote,
  RotateCcw,
  Boxes,
  Truck,
  Clock,
  AlertTriangle,
  RefreshCw,
  Download,
  Calendar,
  CheckCircle2,
  XCircle,
  Package,
  Layers,
  ArrowRight,
  ShieldCheck,
  Receipt,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getAdminSalesReportApi,
  getAdminFulfillmentReportApi,
  getAdminInventoryReportApi,
  getAdminReturnsReportApi,
} from '@/lib/api-client';
import type {
  ReportDatePreset,
  SalesReportResponse,
  FulfillmentReportResponse,
  InventoryReportResponse,
  ReturnsReportResponse,
} from '@/lib/report-types';
import { Link } from '@/i18n/routing';

type ReportTab = 'sales' | 'fulfillment' | 'inventory' | 'returns';

export function ReportManager() {
  const t = useTranslations('admin.reports');
  const tCommon = useTranslations('common');

  // Active Tab
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');

  // Date Range Controls
  const [preset, setPreset] = useState<ReportDatePreset>('last30days');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Report States
  const [salesData, setSalesData] = useState<SalesReportResponse | null>(null);
  const [fulfillmentData, setFulfillmentData] = useState<FulfillmentReportResponse | null>(null);
  const [inventoryData, setInventoryData] = useState<InventoryReportResponse | null>(null);
  const [returnsData, setReturnsData] = useState<ReturnsReportResponse | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const formatCurrency = (poisha: number) => {
    return `৳${(poisha / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  useEffect(() => {
    if (preset === 'custom' && (!dateFrom || !dateTo)) {
      return;
    }
    let ignore = false;
    const query = {
      preset,
      dateFrom: preset === 'custom' ? dateFrom : undefined,
      dateTo: preset === 'custom' ? dateTo : undefined,
    };

    const fetchReport = async () => {
      try {
        if (activeTab === 'sales') {
          const res = await getAdminSalesReportApi(query);
          if (!ignore) setSalesData(res);
        } else if (activeTab === 'fulfillment') {
          const res = await getAdminFulfillmentReportApi(query);
          if (!ignore) setFulfillmentData(res);
        } else if (activeTab === 'inventory') {
          const res = await getAdminInventoryReportApi(query);
          if (!ignore) setInventoryData(res);
        } else if (activeTab === 'returns') {
          const res = await getAdminReturnsReportApi(query);
          if (!ignore) setReturnsData(res);
        }
      } catch (err) {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : t('errorLoading'));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    fetchReport();

    return () => {
      ignore = true;
    };
  }, [activeTab, preset, dateFrom, dateTo, t]);

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const query = {
      preset,
      dateFrom: preset === 'custom' ? dateFrom : undefined,
      dateTo: preset === 'custom' ? dateTo : undefined,
    };

    try {
      if (activeTab === 'sales') {
        const res = await getAdminSalesReportApi(query);
        setSalesData(res);
      } else if (activeTab === 'fulfillment') {
        const res = await getAdminFulfillmentReportApi(query);
        setFulfillmentData(res);
      } else if (activeTab === 'inventory') {
        const res = await getAdminInventoryReportApi(query);
        setInventoryData(res);
      } else if (activeTab === 'returns') {
        const res = await getAdminReturnsReportApi(query);
        setReturnsData(res);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('errorLoading'));
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, preset, dateFrom, dateTo, t]);

  // CSV Export utility
  const handleExportCSV = () => {
    let csvContent = '';
    let filename = `digitaldepot-${activeTab}-report.csv`;

    if (activeTab === 'sales' && salesData) {
      filename = `sales-report-${salesData.period.dateFrom}-to-${salesData.period.dateTo}.csv`;
      csvContent =
        'Date,Placed Orders,Delivered Orders,Delivered Value (BDT),Captured Payments (BDT)\n';
      for (const row of salesData.dailyTrend) {
        csvContent += `"${row.date}",${row.placedOrdersCount},${row.deliveredOrdersCount},${(row.deliveredTotalPoisha / 100).toFixed(2)},${(row.capturedPaymentsPoisha / 100).toFixed(2)}\n`;
      }
    } else if (activeTab === 'fulfillment' && fulfillmentData) {
      filename = `fulfillment-pipeline.csv`;
      csvContent = 'Status,Orders Count\n';
      for (const [st, cnt] of Object.entries(fulfillmentData.currentPipelineDistribution)) {
        csvContent += `"${st}",${cnt}\n`;
      }
    } else if (activeTab === 'inventory' && inventoryData) {
      filename = `low-stock-watchlist.csv`;
      csvContent = 'SKU,Product,Category,Stock On Hand,Threshold,Retail Price (BDT)\n';
      for (const item of inventoryData.lowStockItems) {
        csvContent += `"${item.sku}","${item.productName}","${item.categoryName}",${item.quantity},${item.lowStockThreshold},${(item.retailPrice / 100).toFixed(2)}\n`;
      }
    } else if (activeTab === 'returns' && returnsData) {
      filename = `returns-summary.csv`;
      csvContent = 'Return Status,Count\n';
      for (const [st, cnt] of Object.entries(returnsData.returnVolume.byStatus)) {
        csvContent += `"${st}",${cnt}\n`;
      }
    }

    if (!csvContent) return;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header & Global Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="size-6 text-blue-600 dark:text-blue-400" />
            {t('title')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('description')}</p>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Selector */}
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as ReportDatePreset)}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
          >
            <option value="today">{t('presets.today')}</option>
            <option value="yesterday">{t('presets.yesterday')}</option>
            <option value="last7days">{t('presets.last7days')}</option>
            <option value="last30days">{t('presets.last30days')}</option>
            <option value="thisMonth">{t('presets.thisMonth')}</option>
            <option value="lastMonth">{t('presets.lastMonth')}</option>
            <option value="custom">{t('presets.custom')}</option>
          </select>

          {/* Custom Date Pickers */}
          {preset === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span>{tCommon('to')}</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="h-8 text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {tCommon('refresh')}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={isLoading}
            className="h-8 text-xs flex items-center gap-1.5"
          >
            <Download className="size-3.5" />
            {t('exportCSV')}
          </Button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-1 sm:space-x-4">
        {[
          { id: 'sales' as const, label: t('tabs.sales'), icon: TrendingUp },
          { id: 'fulfillment' as const, label: t('tabs.fulfillment'), icon: Truck },
          { id: 'inventory' as const, label: t('tabs.inventory'), icon: Boxes },
          { id: 'returns' as const, label: t('tabs.returns'), icon: RotateCcw },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors -mb-px ${
                isSelected
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="size-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-700 dark:text-rose-400 text-sm">
          {errorMessage}
        </div>
      )}

      {/* TAB 1: SALES & PAYMENTS */}
      {activeTab === 'sales' && salesData && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  {t('sales.netDeliveredSales')}
                  <TrendingUp className="size-4 text-emerald-600" />
                </span>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {formatCurrency(salesData.deliveredSales.netDeliveredTotalPoisha)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {t('sales.deliveredOrdersNote', {
                    count: salesData.deliveredSales.deliveredOrdersCount,
                  })}
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  {t('sales.grossCapturedPayments')}
                  <CreditCard className="size-4 text-blue-600" />
                </span>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {formatCurrency(salesData.cashAndPayments.grossCapturedPaymentsPoisha)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {t('sales.capturedCountNote', {
                    count: salesData.cashAndPayments.capturedPaymentsCount,
                  })}
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  {t('sales.completedRefunds')}
                  <RotateCcw className="size-4 text-purple-600" />
                </span>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                  {formatCurrency(salesData.cashAndPayments.totalCompletedRefundsPoisha)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {t('sales.refundsCountNote', {
                    count: salesData.cashAndPayments.completedRefundsCount,
                  })}
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  {t('sales.netRetainedPayments')}
                  <ShieldCheck className="size-4 text-emerald-600" />
                </span>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                  {formatCurrency(salesData.cashAndPayments.netRetainedPaymentsPoisha)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {t('sales.aovLabel')}:{' '}
                  {formatCurrency(salesData.deliveredSales.averageOrderValuePoisha)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Breakdown Grids */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Delivered Sales Breakdown */}
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Package className="size-4 text-blue-600" />
                  {t('sales.deliveredBreakdownTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">{t('sales.grossDeliveredMerchandise')}:</span>
                  <span className="font-semibold">
                    {formatCurrency(salesData.deliveredSales.grossDeliveredMerchandisePoisha)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">{t('sales.deliveredShippingFee')}:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    +{formatCurrency(salesData.deliveredSales.deliveredShippingFeePoisha)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">{t('sales.deliveredDiscounts')}:</span>
                  <span className="font-medium text-rose-600">
                    -{formatCurrency(salesData.deliveredSales.deliveredDiscountsPoisha)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">{t('sales.completedRefundsMerchandise')}:</span>
                  <span className="font-medium text-purple-600">
                    -{formatCurrency(salesData.deliveredSales.completedMerchandiseRefundsPoisha)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">{t('sales.completedRefundsShipping')}:</span>
                  <span className="font-medium text-purple-600">
                    -{formatCurrency(salesData.deliveredSales.completedShippingRefundsPoisha)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 text-sm font-bold text-slate-900 dark:text-white">
                  <span>{t('sales.netDeliveredTotal')}:</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(salesData.deliveredSales.netDeliveredTotalPoisha)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Payment Method Share */}
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard className="size-4 text-blue-600" />
                  {t('sales.paymentChannelsTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs">
                {/* SSLCommerz */}
                <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-lg">
                  <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-white mb-1">
                    <span className="flex items-center gap-1.5">
                      <CreditCard className="size-4 text-blue-600" /> SSLCommerz (Online Gateway)
                    </span>
                    <span className="text-blue-600 dark:text-blue-400 font-bold">
                      {formatCurrency(salesData.cashAndPayments.byMethod.SSLCOMMERZ.capturedPoisha)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-[11px] mt-1">
                    <span>
                      {salesData.cashAndPayments.byMethod.SSLCOMMERZ.capturedCount} captured
                      payments
                    </span>
                    <span>
                      {salesData.cashAndPayments.byMethod.SSLCOMMERZ.attempts} total attempts
                    </span>
                  </div>
                </div>

                {/* COD */}
                <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 rounded-lg">
                  <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-white mb-1">
                    <span className="flex items-center gap-1.5">
                      <Banknote className="size-4 text-amber-600" /> Cash on Delivery (COD)
                    </span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold">
                      {formatCurrency(salesData.cashAndPayments.byMethod.COD.capturedPoisha)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-[11px] mt-1">
                    <span>
                      {salesData.cashAndPayments.byMethod.COD.capturedCount} settled deliveries
                    </span>
                    <span>{salesData.cashAndPayments.byMethod.COD.attempts} orders booked</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Trend Table */}
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-sm font-semibold">{t('sales.dailyTrendTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 uppercase font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">{t('table.date')}</th>
                    <th className="py-2.5 px-4 text-center">{t('table.placedOrders')}</th>
                    <th className="py-2.5 px-4 text-center">{t('table.deliveredOrders')}</th>
                    <th className="py-2.5 px-4 text-right">{t('table.deliveredValue')}</th>
                    <th className="py-2.5 px-4 text-right">{t('table.capturedCash')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {salesData.dailyTrend.map((row) => (
                    <tr key={row.date} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-mono font-medium text-slate-800 dark:text-slate-200">
                        {row.date}
                      </td>
                      <td className="py-2.5 px-4 text-center font-medium">
                        {row.placedOrdersCount}
                      </td>
                      <td className="py-2.5 px-4 text-center font-medium">
                        {row.deliveredOrdersCount}
                      </td>
                      <td className="py-2.5 px-4 text-right font-medium text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(row.deliveredTotalPoisha)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-medium text-blue-600 dark:text-blue-400">
                        {formatCurrency(row.capturedPaymentsPoisha)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: FULFILLMENT & OPERATIONS */}
      {activeTab === 'fulfillment' && fulfillmentData && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Cycle Times KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('fulfillment.avgProcessingSpeed')}
                </span>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {fulfillmentData.cycleTimes.avgProcessingHours !== null
                    ? `${fulfillmentData.cycleTimes.avgProcessingHours} hrs`
                    : 'N/A'}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{t('fulfillment.processingSub')}</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('fulfillment.avgTransitSpeed')}
                </span>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {fulfillmentData.cycleTimes.avgDeliveryHours !== null
                    ? `${fulfillmentData.cycleTimes.avgDeliveryHours} hrs`
                    : 'N/A'}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{t('fulfillment.transitSub')}</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('fulfillment.avgTotalFulfillment')}
                </span>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                  {fulfillmentData.cycleTimes.avgTotalFulfillmentHours !== null
                    ? `${fulfillmentData.cycleTimes.avgTotalFulfillmentHours} hrs`
                    : 'N/A'}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {fulfillmentData.cycleTimes.measuredOrdersCount} fulfilled orders measured
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('fulfillment.cancellationRate')}
                </span>
                <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
                  {fulfillmentData.cancellationRatePercent}%
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {fulfillmentData.cancelledOrdersCount} of {fulfillmentData.totalOrdersInPeriod}{' '}
                  orders cancelled
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Pipeline Status Distribution Card */}
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-sm font-semibold">
                {t('fulfillment.pipelineTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {Object.entries(fulfillmentData.currentPipelineDistribution).map(
                  ([status, count]) => (
                    <div
                      key={status}
                      className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-lg text-center"
                    >
                      <span className="text-[10px] font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
                        {status}
                      </span>
                      <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                        {count}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Fulfillment Events */}
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-sm font-semibold">
                {t('fulfillment.recentEventsTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 uppercase font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">{t('table.order')}</th>
                    <th className="py-2.5 px-4">{t('table.transition')}</th>
                    <th className="py-2.5 px-4">{t('table.actor')}</th>
                    <th className="py-2.5 px-4">{t('table.date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {fulfillmentData.recentFulfillmentEvents.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-mono font-medium text-blue-600 dark:text-blue-400">
                        {ev.orderNumber}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            {ev.fromStatus || 'INIT'}
                          </Badge>
                          <ArrowRight className="size-3 text-slate-400" />
                          <Badge className="text-[10px]">{ev.toStatus}</Badge>
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                        {ev.actorName || t('system')}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500">
                        {new Date(ev.changedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: INVENTORY & VALUATION */}
      {activeTab === 'inventory' && inventoryData && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Stock Health & Valuation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('inventory.physicalStock')}
                </span>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {inventoryData.stockHealth.totalPhysicalStock} units
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {inventoryData.stockHealth.totalAvailableStock} available •{' '}
                  {inventoryData.stockHealth.totalReservedStock} reserved
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('inventory.retailValuation')}
                </span>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {formatCurrency(inventoryData.valuation.retailValuationPoisha)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">100% active variants valued</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  {t('inventory.costValuation')}
                  <Info className="size-3.5 text-slate-400" />
                </span>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {formatCurrency(inventoryData.valuation.costValuationPoisha)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Indicative: {inventoryData.valuation.costCoveragePercent}% SKU coverage (
                  {inventoryData.valuation.costTrackedVariantsCount}/
                  {inventoryData.valuation.totalVariantsCount})
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('inventory.stockAlerts')}
                </span>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                  {inventoryData.stockHealth.lowStockCount +
                    inventoryData.stockHealth.outOfStockCount}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {inventoryData.stockHealth.outOfStockCount} out of stock •{' '}
                  {inventoryData.stockHealth.lowStockCount} low stock
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Low Stock Action List Table */}
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500" />
                {t('inventory.lowStockTableTitle')}
              </CardTitle>
              <Link
                href="/admin/inventory"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                {t('inventory.manageInventory')} <ArrowRight className="size-3" />
              </Link>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 uppercase font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">{t('table.sku')}</th>
                    <th className="py-2.5 px-4">{t('table.product')}</th>
                    <th className="py-2.5 px-4">{t('table.category')}</th>
                    <th className="py-2.5 px-4 text-center">{t('table.stock')}</th>
                    <th className="py-2.5 px-4 text-center">{t('table.threshold')}</th>
                    <th className="py-2.5 px-4 text-right">{t('table.retailPrice')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {inventoryData.lowStockItems.map((item) => (
                    <tr
                      key={item.variantId}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-2.5 px-4 font-mono font-medium text-slate-900 dark:text-white">
                        {item.sku}
                      </td>
                      <td className="py-2.5 px-4 font-medium">
                        {item.productName} ({item.variantTitle})
                      </td>
                      <td className="py-2.5 px-4 text-slate-500">{item.categoryName}</td>
                      <td className="py-2.5 px-4 text-center">
                        <Badge
                          variant={item.quantity <= 0 ? 'destructive' : 'outline'}
                          className="text-[10px]"
                        >
                          {item.quantity} left
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-center text-slate-500">
                        {item.lowStockThreshold}
                      </td>
                      <td className="py-2.5 px-4 text-right font-medium">
                        {formatCurrency(item.retailPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Stock Movements In Period */}
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-sm font-semibold">
                {t('inventory.movementsTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {inventoryData.movementsInPeriod.map((m) => (
                  <div
                    key={m.type}
                    className="p-3 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/60 rounded-md"
                  >
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {m.type}
                    </span>
                    <div
                      className={`text-lg font-bold mt-1 ${
                        m.deltaQuantity >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {m.deltaQuantity > 0 ? `+${m.deltaQuantity}` : m.deltaQuantity} units
                    </div>
                    <span className="text-[11px] text-slate-400">{m.eventsCount} events</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: RETURNS & REFUNDS */}
      {activeTab === 'returns' && returnsData && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('returns.totalRequests')}
                </span>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {returnsData.returnVolume.totalReturnRequests}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {t('returns.rateLabel')}: {returnsData.returnVolume.returnRatePercent}% of
                  delivered orders
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('returns.totalRefundedValue')}
                </span>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                  {formatCurrency(returnsData.refundSummary.totalCompletedRefundsPoisha)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {returnsData.refundSummary.completedRefundsCount} completed payouts
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('returns.restockedItems')}
                </span>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {returnsData.itemDisposition.restockedItemsCount} units
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Restocked into active inventory</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('returns.damagedItems')}
                </span>
                <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
                  {returnsData.itemDisposition.damagedOrUnusableCount} units
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Damaged or opened unusable</p>
              </CardContent>
            </Card>
          </div>

          {/* Refund Breakdown by Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard className="size-4 text-blue-600" /> SSLCommerz Online Reversals
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Completed Transactions:</span>
                  <span className="font-semibold">
                    {returnsData.refundSummary.byMethod.SSLCOMMERZ.count}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm font-bold">
                  <span className="text-slate-700 dark:text-slate-300">Total Volume:</span>
                  <span className="text-purple-600">
                    {formatCurrency(returnsData.refundSummary.byMethod.SSLCOMMERZ.totalPoisha)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Banknote className="size-4 text-amber-600" /> COD Manual Payouts
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Completed Payouts:</span>
                  <span className="font-semibold">
                    {returnsData.refundSummary.byMethod.COD_PAYOUT.count}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm font-bold">
                  <span className="text-slate-700 dark:text-slate-300">Total Volume:</span>
                  <span className="text-purple-600">
                    {formatCurrency(returnsData.refundSummary.byMethod.COD_PAYOUT.totalPoisha)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
