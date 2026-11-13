'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { getCustomerReturnsApi, ApiError } from '@/lib/api-client';
import type { CustomerReturnSummary, ReturnRequestStatus } from '@/lib/order-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  RotateCcw,
  Calendar,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Package,
} from 'lucide-react';

const STATUS_FILTERS: Array<{ id: string; status?: ReturnRequestStatus }> = [
  { id: 'all' },
  { id: 'requested', status: 'REQUESTED' },
  { id: 'approved', status: 'APPROVED' },
  { id: 'received', status: 'RECEIVED' },
  { id: 'completed', status: 'COMPLETED' },
  { id: 'rejected', status: 'REJECTED' },
  { id: 'cancelled', status: 'CANCELLED' },
];

export function ReturnHistoryView() {
  const t = useTranslations('returns');
  const [returns, setReturns] = useState<CustomerReturnSummary[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<ReturnRequestStatus | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReturns = useCallback(() => {
    setIsLoading(true);
    setError(null);
    getCustomerReturnsApi({
      page,
      limit: 10,
      status: selectedStatus,
    })
      .then((res) => {
        setReturns(res.returns);
        setTotalPages(res.pagination.totalPages);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Failed to load return requests. Please try again.');
        }
        setIsLoading(false);
      });
  }, [page, selectedStatus]);

  useEffect(() => {
    let ignore = false;

    getCustomerReturnsApi({
      page,
      limit: 10,
      status: selectedStatus,
    })
      .then((res) => {
        if (!ignore) {
          setReturns(res.returns);
          setTotalPages(res.pagination.totalPages);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError('Failed to load return requests. Please try again.');
          }
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [page, selectedStatus]);

  const formatPrice = (poysha: number) => {
    return `৳${(poysha / 100).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (status: ReturnRequestStatus) => {
    switch (status) {
      case 'REQUESTED':
        return (
          <Badge
            variant="outline"
            className="border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-500/10 gap-1 text-xs"
          >
            <Clock className="size-3.5" />
            <span>{t('status.REQUESTED')}</span>
          </Badge>
        );
      case 'APPROVED':
        return (
          <Badge
            variant="outline"
            className="border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-500/10 gap-1 text-xs"
          >
            <CheckCircle2 className="size-3.5" />
            <span>{t('status.APPROVED')}</span>
          </Badge>
        );
      case 'RECEIVED':
        return (
          <Badge
            variant="outline"
            className="border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 gap-1 text-xs"
          >
            <Package className="size-3.5" />
            <span>{t('status.RECEIVED')}</span>
          </Badge>
        );
      case 'COMPLETED':
        return (
          <Badge
            variant="outline"
            className="border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 gap-1 text-xs"
          >
            <CheckCircle2 className="size-3.5" />
            <span>{t('status.COMPLETED')}</span>
          </Badge>
        );
      case 'REJECTED':
        return (
          <Badge
            variant="outline"
            className="border-destructive text-destructive bg-destructive/10 gap-1 text-xs"
          >
            <XCircle className="size-3.5" />
            <span>{t('status.REJECTED')}</span>
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge
            variant="outline"
            className="border-border text-muted-foreground bg-muted gap-1 text-xs"
          >
            <XCircle className="size-3.5" />
            <span>{t('status.CANCELLED')}</span>
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <RotateCcw className="size-6 text-primary" />
            <span>{t('pageTitle')}</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="self-start sm:self-auto text-xs">
          <Link href="/account">{t('backToAccount')}</Link>
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-border/40 scrollbar-none text-xs">
        {STATUS_FILTERS.map((f) => {
          const isActive = selectedStatus === f.status;
          return (
            <button
              key={f.id}
              onClick={() => {
                setSelectedStatus(f.status);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {f.id === 'all' ? t('filterAll') : t(`status.${f.status}` as any)}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm">Loading returns...</p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={fetchReturns} className="text-xs">
            Retry
          </Button>
        </div>
      ) : returns.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-border bg-card/50 space-y-3">
          <div className="mx-auto size-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <RotateCcw className="size-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            {selectedStatus ? t('noReturnsMatchingFilter') : t('noReturnsTitle')}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {selectedStatus ? '' : t('noReturnsSubtitle')}
          </p>
          <div className="pt-2">
            <Button asChild size="sm">
              <Link href="/account/orders">{t('backToOrder')}</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {returns.map((ret) => (
            <Card
              key={ret.id}
              className="overflow-hidden border-border/80 hover:border-primary/40 transition-colors"
            >
              <CardContent className="p-4 sm:p-5 space-y-4">
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-border/60">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">
                        {t('returnNumber', { returnNumber: ret.returnNumber })}
                      </span>
                      {getStatusBadge(ret.status)}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3.5" />
                        <span>
                          {t('requestedOn', {
                            date: new Date(ret.createdAt).toLocaleDateString(),
                          })}
                        </span>
                      </span>
                      <span>•</span>
                      <Link
                        href={`/account/orders/${ret.orderNumber}`}
                        className="text-primary hover:underline"
                      >
                        {t('orderNumber', { orderNumber: ret.orderNumber })}
                      </Link>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-xs text-muted-foreground">
                      {ret.actualRefundAmount !== null ? t('actualRefund') : t('estimatedRefund')}
                    </span>
                    <p className="text-sm font-bold text-foreground font-mono">
                      {formatPrice(
                        ret.actualRefundAmount !== null
                          ? ret.actualRefundAmount
                          : ret.estimatedRefundAmount,
                      )}
                    </p>
                  </div>
                </div>

                {/* Footer action row */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">
                    {ret.itemCount} {ret.itemCount === 1 ? 'item' : 'items'}
                  </span>
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs hover:bg-muted"
                  >
                    <Link href={`/account/returns/${ret.returnNumber}`}>
                      <span>{t('viewDetails')}</span>
                      <ChevronRight className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="size-8 p-0"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-xs text-muted-foreground font-medium px-2">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="size-8 p-0"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
