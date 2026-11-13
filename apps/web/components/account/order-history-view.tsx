'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { getCustomerOrdersApi, ApiError } from '@/lib/api-client';
import type { CustomerOrderSummaryItem, OrderStatus } from '@/lib/order-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CancelOrderDialog } from './cancel-order-dialog';
import {
  Package,
  Calendar,
  CreditCard,
  ChevronRight,
  ChevronLeft,
  XCircle,
  ShoppingBag,
  Loader2,
  Clock,
  CheckCircle2,
  Truck,
  Box,
} from 'lucide-react';

const STATUS_FILTERS: Array<{ id: string; status?: OrderStatus }> = [
  { id: 'all' },
  { id: 'pending', status: 'PENDING' },
  { id: 'confirmed', status: 'CONFIRMED' },
  { id: 'processing', status: 'PROCESSING' },
  { id: 'shipped', status: 'SHIPPED' },
  { id: 'delivered', status: 'DELIVERED' },
  { id: 'cancelled', status: 'CANCELLED' },
];

export function OrderHistoryView() {
  const t = useTranslations('orders');
  const [orders, setOrders] = useState<CustomerOrderSummaryItem[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cancellation modal state
  const [cancelOrderNumber, setCancelOrderNumber] = useState<string | null>(null);

  const fetchOrders = useCallback(() => {
    setIsLoading(true);
    setError(null);
    getCustomerOrdersApi({
      page,
      limit: 10,
      status: selectedStatus,
    })
      .then((res) => {
        setOrders(res.orders);
        setTotalPages(res.pagination.totalPages);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Failed to load orders. Please try again.');
        }
        setIsLoading(false);
      });
  }, [page, selectedStatus]);

  useEffect(() => {
    let ignore = false;

    getCustomerOrdersApi({
      page,
      limit: 10,
      status: selectedStatus,
    })
      .then((res) => {
        if (!ignore) {
          setOrders(res.orders);
          setTotalPages(res.pagination.totalPages);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError('Failed to load orders. Please try again.');
          }
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [page, selectedStatus]);

  const handleStatusChange = (status?: OrderStatus) => {
    setSelectedStatus(status);
    setPage(1);
  };

  const formatPrice = (poysha: number) => {
    return `৳${(poysha / 100).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <Badge
            variant="outline"
            className="border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-500/10 gap-1 text-[11px]"
          >
            <Clock className="size-3" />
            <span>{t('status.PENDING')}</span>
          </Badge>
        );
      case 'CONFIRMED':
        return (
          <Badge
            variant="outline"
            className="border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-500/10 gap-1 text-[11px]"
          >
            <CheckCircle2 className="size-3" />
            <span>{t('status.CONFIRMED')}</span>
          </Badge>
        );
      case 'PROCESSING':
        return (
          <Badge
            variant="outline"
            className="border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 gap-1 text-[11px]"
          >
            <Box className="size-3" />
            <span>{t('status.PROCESSING')}</span>
          </Badge>
        );
      case 'SHIPPED':
        return (
          <Badge
            variant="outline"
            className="border-purple-500 text-purple-600 dark:text-purple-400 bg-purple-500/10 gap-1 text-[11px]"
          >
            <Truck className="size-3" />
            <span>{t('status.SHIPPED')}</span>
          </Badge>
        );
      case 'DELIVERED':
        return (
          <Badge
            variant="outline"
            className="border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 gap-1 text-[11px]"
          >
            <CheckCircle2 className="size-3" />
            <span>{t('status.DELIVERED')}</span>
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge
            variant="outline"
            className="border-destructive/60 text-destructive bg-destructive/10 gap-1 text-[11px]"
          >
            <XCircle className="size-3" />
            <span>{t('status.CANCELLED')}</span>
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('pageTitle')}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="self-start text-xs">
          <Link href="/account">{t('backToAccount')}</Link>
        </Button>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-border/60">
        {STATUS_FILTERS.map((tab) => {
          const isActive = selectedStatus === tab.status;
          const labelKey = tab.status
            ? `filter${tab.status.charAt(0) + tab.status.slice(1).toLowerCase()}`
            : 'filterAll';
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleStatusChange(tab.status)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {t(labelKey as any)}
            </button>
          );
        })}
      </div>

      {/* Main Content State */}
      {isLoading ? (
        <div className="space-y-4 py-8">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse bg-card/60">
              <CardContent className="p-6 space-y-4">
                <div className="h-4 bg-muted rounded w-1/4" />
                <div className="h-12 bg-muted rounded w-full" />
                <div className="h-4 bg-muted rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card className="border-destructive/30 bg-destructive/5 text-center p-8">
          <CardContent className="space-y-3">
            <XCircle className="size-8 text-destructive mx-auto" />
            <p className="text-sm font-semibold text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={fetchOrders} className="text-xs">
              Try Again
            </Button>
          </CardContent>
        </Card>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-border bg-card/40 p-8 space-y-4">
          <div className="p-4 rounded-full bg-muted/60 text-muted-foreground">
            <ShoppingBag className="size-8" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-base font-semibold text-foreground">
              {selectedStatus ? t('noOrdersMatchingFilter') : t('noOrdersTitle')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {selectedStatus ? '' : t('noOrdersSubtitle')}
            </p>
          </div>
          <Button asChild size="sm" className="text-xs">
            <Link href="/products">{t('startShopping')}</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const isCancellable =
              (order.status === 'PENDING' || order.status === 'CONFIRMED') &&
              order.paymentStatus !== 'PAID';

            return (
              <Card
                key={order.id}
                className="overflow-hidden border border-border/80 hover:border-primary/40 transition-all duration-200"
              >
                {/* Order Card Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-4 py-3 sm:px-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-xs text-foreground tracking-wide">
                      {order.orderNumber}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="size-3" />
                      {new Date(order.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">{getStatusBadge(order.status)}</div>
                </div>

                {/* Order Card Body */}
                <CardContent className="p-4 sm:p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Item Previews */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        {order.items.slice(0, 3).map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-2 text-xs"
                          >
                            {item.thumbnailUrl ? (
                              <Image
                                src={item.thumbnailUrl}
                                alt={item.productName}
                                width={36}
                                height={36}
                                className="size-9 rounded-md object-cover border border-border"
                              />
                            ) : (
                              <div className="size-9 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                                <Package className="size-4" />
                              </div>
                            )}
                            <div className="max-w-[140px] truncate">
                              <p className="font-medium text-foreground truncate text-[11px]">
                                {item.productName}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                Qty: {item.quantity}
                              </p>
                            </div>
                          </div>
                        ))}

                        {order.items.length > 3 && (
                          <span className="text-xs text-muted-foreground font-medium">
                            +{order.items.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Financial Total & CTA */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-3 sm:pt-0 border-border/60 shrink-0">
                      <div>
                        <p className="text-[10px] text-muted-foreground sm:text-right uppercase tracking-wider">
                          {t('total')}
                        </p>
                        <p className="text-base font-bold text-foreground sm:text-right">
                          {formatPrice(order.totalPayable)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        {isCancellable && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setCancelOrderNumber(order.orderNumber)}
                            className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            {t('cancelOrder')}
                          </Button>
                        )}
                        <Button asChild size="sm" className="gap-1 text-xs">
                          <Link href={`/account/orders/${order.orderNumber}`}>
                            <span>{t('viewDetails')}</span>
                            <ChevronRight className="size-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-border/60">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="gap-1 text-xs"
              >
                <ChevronLeft className="size-3.5" />
                <span>Previous</span>
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="gap-1 text-xs"
              >
                <span>Next</span>
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Cancel Order Dialog */}
      {cancelOrderNumber && (
        <CancelOrderDialog
          orderNumber={cancelOrderNumber}
          isOpen={true}
          onClose={() => setCancelOrderNumber(null)}
          onSuccess={fetchOrders}
        />
      )}
    </div>
  );
}
