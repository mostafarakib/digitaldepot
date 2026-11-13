'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  ShoppingBag,
  Search,
  RefreshCw,
  Loader2,
  AlertCircle,
  X,
  Package,
  Eye,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type {
  AdminOrderSummary,
  AdminOrderListResponse,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
} from '@/lib/order-types';
import { getAdminOrdersApi } from '@/lib/api-client';
import { OrderDetailModal } from './order-detail-modal';

const STATUS_TABS: Array<{
  key: 'ALL' | OrderStatus;
  labelKey:
    | 'statusAll'
    | 'statusPending'
    | 'statusConfirmed'
    | 'statusProcessing'
    | 'statusShipped'
    | 'statusDelivered'
    | 'statusCancelled';
  countKey: keyof AdminOrderListResponse['statusCounts'];
}> = [
  { key: 'ALL', labelKey: 'statusAll', countKey: 'all' },
  { key: 'PENDING', labelKey: 'statusPending', countKey: 'pending' },
  { key: 'CONFIRMED', labelKey: 'statusConfirmed', countKey: 'confirmed' },
  { key: 'PROCESSING', labelKey: 'statusProcessing', countKey: 'processing' },
  { key: 'SHIPPED', labelKey: 'statusShipped', countKey: 'shipped' },
  { key: 'DELIVERED', labelKey: 'statusDelivered', countKey: 'delivered' },
  { key: 'CANCELLED', labelKey: 'statusCancelled', countKey: 'cancelled' },
];

export function OrderManager() {
  const t = useTranslations('admin.orders');

  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [statusCounts, setStatusCounts] = useState<AdminOrderListResponse['statusCounts']>({
    all: 0,
    pending: 0,
    confirmed: 0,
    processing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'ALL' | PaymentStatus>('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<'ALL' | PaymentMethod>('ALL');

  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Modal state
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  // Debounce search input by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setFeedbackError(null);
    try {
      const res = await getAdminOrdersApi({
        page,
        limit: 15,
        search: debouncedSearch || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        paymentStatus: paymentStatusFilter === 'ALL' ? undefined : paymentStatusFilter,
        paymentMethod: paymentMethodFilter === 'ALL' ? undefined : paymentMethodFilter,
        sortBy: 'newest',
      });
      setOrders(res.orders);
      setStatusCounts(res.statusCounts);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.total);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to fetch orders');
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, paymentStatusFilter, paymentMethodFilter, debouncedSearch]);

  useEffect(() => {
    let ignore = false;

    getAdminOrdersApi({
      page,
      limit: 15,
      search: debouncedSearch || undefined,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      paymentStatus: paymentStatusFilter === 'ALL' ? undefined : paymentStatusFilter,
      paymentMethod: paymentMethodFilter === 'ALL' ? undefined : paymentMethodFilter,
      sortBy: 'newest',
    })
      .then((res) => {
        if (!ignore) {
          setOrders(res.orders);
          setStatusCounts(res.statusCounts);
          setTotalPages(res.pagination.totalPages);
          setTotalCount(res.pagination.total);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setFeedbackError(err instanceof Error ? err.message : 'Failed to fetch orders');
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [page, statusFilter, paymentStatusFilter, paymentMethodFilter, debouncedSearch]);

  const handleOpenDetail = (orderId: string) => {
    setSelectedOrderId(orderId);
    setIsDetailModalOpen(true);
  };

  const handleCloseDetail = () => {
    setIsDetailModalOpen(false);
    setSelectedOrderId(null);
  };

  const formatPrice = (poysha: number) => {
    return `৳${(poysha / 100).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
            Pending
          </Badge>
        );
      case 'CONFIRMED':
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">
            Confirmed
          </Badge>
        );
      case 'PROCESSING':
        return (
          <Badge
            variant="outline"
            className="bg-purple-500/10 text-purple-400 border-purple-500/30"
          >
            Processing
          </Badge>
        );
      case 'SHIPPED':
        return (
          <Badge variant="outline" className="bg-sky-500/10 text-sky-400 border-sky-500/30">
            Shipped
          </Badge>
        );
      case 'DELIVERED':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
          >
            Delivered
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/30">
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'PAID':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
          >
            Paid
          </Badge>
        );
      case 'PENDING':
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
            Pending
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/30">
            Failed
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="outline" className="bg-slate-700/50 text-slate-400 border-slate-600">
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <ShoppingBag className="size-6 text-blue-500" />
            <span>{t('title')}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('subtitle')}</p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void fetchOrders()}
          disabled={isLoading}
          className="border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-white"
        >
          <RefreshCw className={`size-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{t('refresh')}</span>
        </Button>
      </div>

      {/* Notifications / Errors */}
      {feedbackError && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{feedbackError}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackError(null)}
            className="text-rose-400 hover:text-rose-300"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex bg-slate-800/80 p-1 rounded-lg border border-slate-700/80 gap-1 overflow-x-auto">
        {STATUS_TABS.map((tab) => {
          const count = statusCounts[tab.countKey];
          const isSelected = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setStatusFilter(tab.key);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <span>{t(tab.labelKey)}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  isSelected ? 'bg-blue-800 text-white' : 'bg-slate-700/80 text-slate-300'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search and Secondary Filters Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="pl-9 h-9 text-xs bg-slate-800/60 border-slate-700 text-slate-200 placeholder:text-slate-500 focus-visible:ring-blue-500"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Secondary Select Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Payment Status Dropdown */}
          <div className="flex items-center gap-1.5">
            <Filter className="size-3.5 text-slate-400" />
            <select
              value={paymentStatusFilter}
              onChange={(e) => {
                setPaymentStatusFilter(e.target.value as 'ALL' | PaymentStatus);
                setPage(1);
              }}
              className="h-9 px-2.5 py-1 text-xs rounded-md bg-slate-800/80 border border-slate-700 text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">{t('paymentStatusAll')}</option>
              <option value="PENDING">{t('paymentStatusPending')}</option>
              <option value="PAID">{t('paymentStatusPaid')}</option>
              <option value="FAILED">{t('paymentStatusFailed')}</option>
              <option value="CANCELLED">{t('paymentStatusCancelled')}</option>
            </select>
          </div>

          {/* Payment Method Dropdown */}
          <select
            value={paymentMethodFilter}
            onChange={(e) => {
              setPaymentMethodFilter(e.target.value as 'ALL' | PaymentMethod);
              setPage(1);
            }}
            className="h-9 px-2.5 py-1 text-xs rounded-md bg-slate-800/80 border border-slate-700 text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">{t('paymentMethodAll')}</option>
            <option value="COD">{t('paymentMethodCod')}</option>
            <option value="SSLCOMMERZ">{t('paymentMethodOnline')}</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xs">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="size-8 animate-spin text-blue-500" />
            <p className="text-xs">Loading orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center p-4">
            <Package className="size-10 text-slate-600 mb-2" />
            <h3 className="text-sm font-semibold text-slate-300">{t('noOrdersFound')}</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">{t('noOrdersMatching')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">{t('colOrderNumber')}</th>
                  <th className="py-3 px-4">{t('colCustomer')}</th>
                  <th className="py-3 px-4">{t('colDate')}</th>
                  <th className="py-3 px-4">{t('colStatus')}</th>
                  <th className="py-3 px-4">{t('colPayment')}</th>
                  <th className="py-3 px-4">{t('colMethod')}</th>
                  <th className="py-3 px-4">{t('colTotal')}</th>
                  <th className="py-3 px-4">{t('colItems')}</th>
                  <th className="py-3 px-4 text-right">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Order Number */}
                    <td className="py-3 px-4 font-mono font-medium text-slate-200">
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(order.id)}
                        className="hover:text-blue-400 transition-colors cursor-pointer text-left font-semibold"
                      >
                        {order.orderNumber}
                      </button>
                    </td>

                    {/* Customer */}
                    <td className="py-3 px-4">
                      <div className="max-w-[160px] truncate">
                        <div
                          className="font-medium text-slate-200 truncate"
                          title={order.customer.name}
                        >
                          {order.customer.name}
                        </div>
                        <div
                          className="text-[11px] text-slate-400 truncate"
                          title={order.customer.email}
                        >
                          {order.customer.email}
                        </div>
                      </div>
                    </td>

                    {/* Date */}
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {new Date(order.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 whitespace-nowrap">{getStatusBadge(order.status)}</td>

                    {/* Payment Status */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getPaymentStatusBadge(order.paymentStatus)}
                    </td>

                    {/* Payment Method */}
                    <td className="py-3 px-4 whitespace-nowrap text-slate-300 font-medium">
                      {order.paymentMethod === 'COD'
                        ? t('paymentMethodCod')
                        : t('paymentMethodOnline')}
                    </td>

                    {/* Total */}
                    <td className="py-3 px-4 font-semibold text-slate-100 whitespace-nowrap">
                      {formatPrice(order.totalPayable)}
                    </td>

                    {/* Items */}
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {t('itemsCount', { count: order.itemCount })}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDetail(order.id)}
                        className="h-7 text-xs border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white"
                      >
                        <Eye className="size-3 mr-1" />
                        <span>{t('manageOrder')}</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!isLoading && orders.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-800 bg-slate-800/30 text-xs text-slate-400">
            <div>
              Showing {orders.length > 0 ? (page - 1) * 15 + 1 : 0} to{' '}
              {Math.min(page * 15, totalCount)} of {totalCount} orders
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-7 text-xs border-slate-700 bg-slate-800 text-slate-300"
              >
                Previous
              </Button>
              <span className="text-slate-400 px-1">
                {page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-7 text-xs border-slate-700 bg-slate-800 text-slate-300"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Order Detail & Management Modal */}
      <OrderDetailModal
        orderId={selectedOrderId}
        isOpen={isDetailModalOpen}
        onClose={handleCloseDetail}
        onOrderUpdated={fetchOrders}
      />
    </div>
  );
}
