'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  CreditCard,
  Banknote,
  Search,
  RefreshCw,
  Loader2,
  AlertCircle,
  Eye,
  CheckCircle2,
  Clock,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  Receipt,
  ArrowUpDown,
  Filter,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type {
  AdminPaymentListItem,
  AdminPaymentStats,
  PaymentStatus,
  PaymentMethod,
} from '@/lib/payment-types';
import { getAdminPaymentsApi } from '@/lib/api-client';
import { PaymentDetailModal } from './payment-detail-modal';
import { Link } from '@/i18n/routing';

export function PaymentManager() {
  const t = useTranslations('admin.payments');
  const tCommon = useTranslations('common');

  const [payments, setPayments] = useState<AdminPaymentListItem[]>([]);
  const [stats, setStats] = useState<AdminPaymentStats>({
    totalAttempts: 0,
    successfulPayments: 0,
    failedPayments: 0,
    pendingPayments: 0,
    cancelledPayments: 0,
    totalCapturedPoisha: 0,
    totalRefundedPoisha: 0,
    netRetainedPoisha: 0,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters & Pagination State
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PaymentStatus>('ALL');
  const [methodFilter, setMethodFilter] = useState<'ALL' | PaymentMethod>('ALL');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Modals State
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  // Search debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(handler);
  }, [searchTerm]);

  const loadPayments = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await getAdminPaymentsApi({
        page,
        limit: 20,
        search: debouncedSearch || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        method: methodFilter === 'ALL' ? undefined : methodFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortBy: sortBy as any,
      });

      setPayments(res.payments);
      setStats(res.stats);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.total);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('errorLoading'));
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, methodFilter, dateFrom, dateTo, sortBy, t]);

  useEffect(() => {
    let ignore = false;

    getAdminPaymentsApi({
      page,
      limit: 20,
      search: debouncedSearch || undefined,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      method: methodFilter === 'ALL' ? undefined : methodFilter,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sortBy: sortBy as any,
    })
      .then((res) => {
        if (!ignore) {
          setPayments(res.payments);
          setStats(res.stats);
          setTotalPages(res.pagination.totalPages);
          setTotalCount(res.pagination.total);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : t('errorLoading'));
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [page, debouncedSearch, statusFilter, methodFilter, dateFrom, dateTo, sortBy, t]);

  const formatCurrency = (poisha: number) => {
    return `৳${(poisha / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const renderStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'PAID':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="size-3" /> {t(`statusOptions.${status}`)}
          </Badge>
        );
      case 'PENDING':
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 flex items-center gap-1">
            <Clock className="size-3" /> {t(`statusOptions.${status}`)}
          </Badge>
        );
      case 'REFUNDED':
        return (
          <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30 flex items-center gap-1">
            <RotateCcw className="size-3" /> {t(`statusOptions.${status}`)}
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30 flex items-center gap-1">
            <AlertCircle className="size-3" /> {t(`statusOptions.${status}`)}
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge className="bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30 flex items-center gap-1">
            {t(`statusOptions.${status}`)}
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <CreditCard className="size-6 text-blue-600 dark:text-blue-400" />
            {t('title')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadPayments}
            disabled={isLoading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {tCommon('refresh')}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('stats.totalAttempts')}
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {stats.totalAttempts}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {t('stats.attemptsBreakdown', {
                  success: stats.successfulPayments,
                  pending: stats.pendingPayments,
                  failed: stats.failedPayments,
                })}
              </p>
            </div>
            <div className="size-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Receipt className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('stats.totalCaptured')}
              </p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {formatCurrency(stats.totalCapturedPoisha)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {t('stats.capturedCount', { count: stats.successfulPayments })}
              </p>
            </div>
            <div className="size-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('stats.totalRefunded')}
              </p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                {formatCurrency(stats.totalRefundedPoisha)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">{t('stats.refundsNote')}</p>
            </div>
            <div className="size-10 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <RotateCcw className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('stats.netRetained')}
              </p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {formatCurrency(stats.netRetainedPoisha)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">{t('stats.netNote')}</p>
            </div>
            <div className="size-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <ShieldCheck className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="border-slate-200 dark:border-slate-800">
        {/* Filters and Controls */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>

            {/* Status Dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">{t('filters.allStatuses')}</option>
              <option value="PAID">{t('statusOptions.PAID')}</option>
              <option value="PENDING">{t('statusOptions.PENDING')}</option>
              <option value="REFUNDED">{t('statusOptions.REFUNDED')}</option>
              <option value="FAILED">{t('statusOptions.FAILED')}</option>
              <option value="CANCELLED">{t('statusOptions.CANCELLED')}</option>
            </select>

            {/* Method Dropdown */}
            <select
              value={methodFilter}
              onChange={(e) => {
                setMethodFilter(e.target.value as any);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">{t('filters.allMethods')}</option>
              <option value="SSLCOMMERZ">SSLCommerz</option>
              <option value="COD">Cash on Delivery (COD)</option>
            </select>

            {/* Sorting Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="newest">{t('sort.newest')}</option>
              <option value="oldest">{t('sort.oldest')}</option>
              <option value="amountDesc">{t('sort.amountDesc')}</option>
              <option value="amountAsc">{t('sort.amountAsc')}</option>
              <option value="paidAtDesc">{t('sort.paidAtDesc')}</option>
            </select>
          </div>

          {/* Date Range Sub-row */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1 font-medium">
              <Calendar className="size-3.5" />
              {t('filters.dateRange')}:
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span>{tCommon('to')}</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
            />
            {(dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setPage(1);
                }}
                className="h-6 px-2 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                {tCommon('clear')}
              </Button>
            )}
          </div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border-b border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 text-sm flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Loading Spinner */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
            <Loader2 className="size-8 animate-spin mb-3 text-blue-600 dark:text-blue-400" />
            <p className="text-sm">{t('loadingPayments')}</p>
          </div>
        ) : payments.length === 0 ? (
          <div className="py-16 text-center text-slate-500 dark:text-slate-400">
            <CreditCard className="size-12 mx-auto mb-3 opacity-30" />
            <h3 className="font-semibold text-slate-900 dark:text-white text-base">
              {t('noPaymentsFound')}
            </h3>
            <p className="text-sm mt-1 max-w-md mx-auto">{t('adjustFilterTip')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 text-xs uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">{t('table.transaction')}</th>
                  <th className="py-3 px-4">{t('table.order')}</th>
                  <th className="py-3 px-4">{t('table.customer')}</th>
                  <th className="py-3 px-4">{t('table.method')}</th>
                  <th className="py-3 px-4">{t('table.status')}</th>
                  <th className="py-3 px-4 text-right">{t('table.amount')}</th>
                  <th className="py-3 px-4 text-right">{t('table.netRetained')}</th>
                  <th className="py-3 px-4">{t('table.date')}</th>
                  <th className="py-3 px-4 text-center">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {payments.map((p) => {
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Transaction */}
                      <td className="py-3 px-4">
                        <div className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                          {p.transactionId}
                        </div>
                        {p.gatewayTransactionId && (
                          <div className="font-mono text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                            GW: {p.gatewayTransactionId}
                          </div>
                        )}
                      </td>

                      {/* Order */}
                      <td className="py-3 px-4">
                        <Link
                          href={`/admin/orders?search=${encodeURIComponent(p.order.orderNumber)}`}
                          className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {p.order.orderNumber}
                        </Link>
                      </td>

                      {/* Customer */}
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 dark:text-white">
                          {p.order.customer.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {p.order.customer.email}
                        </p>
                      </td>

                      {/* Method */}
                      <td className="py-3 px-4">
                        <Badge
                          variant="outline"
                          className="text-xs font-normal flex items-center gap-1 w-fit"
                        >
                          {p.method === 'COD' ? (
                            <>
                              <Banknote className="size-3 text-amber-600" /> COD
                            </>
                          ) : (
                            <>
                              <CreditCard className="size-3 text-blue-600" /> SSLCommerz
                            </>
                          )}
                        </Badge>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">{renderStatusBadge(p.status)}</td>

                      {/* Amount */}
                      <td className="py-3 px-4 text-right font-medium text-slate-900 dark:text-white">
                        {formatCurrency(p.amount)}
                      </td>

                      {/* Net Retained */}
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`font-semibold ${
                            p.netAmount > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {formatCurrency(p.netAmount)}
                        </span>
                        {p.refundedAmount > 0 && (
                          <div className="text-[10px] text-purple-600 dark:text-purple-400">
                            -{formatCurrency(p.refundedAmount)} ref.
                          </div>
                        )}
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">
                        {new Date(p.createdAt).toLocaleDateString()}
                        <div className="text-[11px] text-slate-400">
                          {new Date(p.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedPaymentId(p.id);
                            setIsDetailModalOpen(true);
                          }}
                          className="h-8 px-2 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                        >
                          <Eye className="size-3.5 mr-1" />
                          {t('view')}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              {t('pagination.showing', {
                start: (page - 1) * 20 + 1,
                end: Math.min(page * 20, totalCount),
                total: totalCount,
              })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
              >
                {tCommon('previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
              >
                {tCommon('next')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Payment Detail Modal */}
      <PaymentDetailModal
        paymentId={selectedPaymentId}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedPaymentId(null);
        }}
      />
    </div>
  );
}
