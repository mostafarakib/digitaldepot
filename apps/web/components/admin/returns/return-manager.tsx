'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  RotateCcw,
  Search,
  RefreshCw,
  Loader2,
  AlertCircle,
  Package,
  Eye,
  CheckCircle2,
  XCircle,
  Boxes,
  Ban,
  Clock,
  CreditCard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type {
  AdminReturnSummary,
  AdminReturnListResponse,
  ReturnRequestStatus,
  AdminReturnDetail,
} from '@/lib/order-types';
import { getAdminReturnsApi, getAdminReturnDetailApi } from '@/lib/api-client';
import { ReturnDetailModal } from './return-detail-modal';
import { ApproveReturnDialog } from './approve-return-dialog';
import { RejectReturnDialog } from './reject-return-dialog';
import { InspectReturnModal } from './inspect-return-modal';
import { ProcessRefundModal } from './process-refund-modal';

const STATUS_TABS: Array<{
  key: 'ALL' | ReturnRequestStatus;
  labelKey:
    | 'statusAll'
    | 'statusRequested'
    | 'statusApproved'
    | 'statusReceived'
    | 'statusRejected'
    | 'statusCancelled';
}> = [
  { key: 'ALL', labelKey: 'statusAll' },
  { key: 'REQUESTED', labelKey: 'statusRequested' },
  { key: 'APPROVED', labelKey: 'statusApproved' },
  { key: 'RECEIVED', labelKey: 'statusReceived' },
  { key: 'REJECTED', labelKey: 'statusRejected' },
  { key: 'CANCELLED', labelKey: 'statusCancelled' },
];

export function ReturnManager() {
  const t = useTranslations('admin.returns');

  const [returns, setReturns] = useState<AdminReturnSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ReturnRequestStatus>('ALL');

  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Modals state
  const [selectedReturnNumber, setSelectedReturnNumber] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  const [actionReturnNumber, setActionReturnNumber] = useState<string | null>(null);
  const [isApproveOpen, setIsApproveOpen] = useState<boolean>(false);
  const [isRejectOpen, setIsRejectOpen] = useState<boolean>(false);
  const [isRefundOpen, setIsRefundOpen] = useState<boolean>(false);

  // For inspect modal, we need full return detail
  const [inspectDetail, setInspectDetail] = useState<AdminReturnDetail | null>(null);
  const [isInspectOpen, setIsInspectOpen] = useState<boolean>(false);
  const [isInspectLoading, setIsInspectLoading] = useState<boolean>(false);

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

  const fetchReturns = useCallback(async () => {
    setIsLoading(true);
    setFeedbackError(null);
    try {
      const isReturnNumber = debouncedSearch.startsWith('RET-');
      const isOrderNumber = debouncedSearch.startsWith('ORD-');

      const res = await getAdminReturnsApi({
        page,
        limit: 15,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        returnNumber: isReturnNumber ? debouncedSearch : undefined,
        orderNumber: isOrderNumber ? debouncedSearch : undefined,
        sortBy: 'createdAt:desc',
      });
      setReturns(res.returns);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.total);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to fetch returns');
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, debouncedSearch]);

  useEffect(() => {
    let ignore = false;
    const isReturnNumber = debouncedSearch.startsWith('RET-');
    const isOrderNumber = debouncedSearch.startsWith('ORD-');

    getAdminReturnsApi({
      page,
      limit: 15,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      returnNumber: isReturnNumber ? debouncedSearch : undefined,
      orderNumber: isOrderNumber ? debouncedSearch : undefined,
      sortBy: 'createdAt:desc',
    })
      .then((res) => {
        if (!ignore) {
          setReturns(res.returns);
          setTotalPages(res.pagination.totalPages);
          setTotalCount(res.pagination.total);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setFeedbackError(err instanceof Error ? err.message : 'Failed to fetch returns');
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [page, statusFilter, debouncedSearch]);

  const formatPrice = (poysha: number) => {
    return `৳${(poysha / 100).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (status: ReturnRequestStatus) => {
    switch (status) {
      case 'REQUESTED':
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
            {t('statusRequested')}
          </Badge>
        );
      case 'APPROVED':
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
            {t('statusApproved')}
          </Badge>
        );
      case 'RECEIVED':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
          >
            {t('statusReceived')}
          </Badge>
        );
      case 'REJECTED':
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">
            {t('statusRejected')}
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/30">
            {t('statusCancelled')}
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleOpenDetail = (returnNumber: string) => {
    setSelectedReturnNumber(returnNumber);
    setIsDetailModalOpen(true);
  };

  const handleOpenApprove = (returnNumber: string) => {
    setActionReturnNumber(returnNumber);
    setIsApproveOpen(true);
  };

  const handleOpenReject = (returnNumber: string) => {
    setActionReturnNumber(returnNumber);
    setIsRejectOpen(true);
  };

  const handleOpenInspect = async (returnNumber: string) => {
    setIsInspectLoading(true);
    try {
      const res = await getAdminReturnDetailApi(returnNumber);
      setInspectDetail(res.return);
      setIsInspectOpen(true);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to load return for inspection');
    } finally {
      setIsInspectLoading(false);
    }
  };

  const handleOpenRefund = (returnNumber: string) => {
    setActionReturnNumber(returnNumber);
    setIsRefundOpen(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <RotateCcw className="w-6 h-6 text-primary" />
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchReturns}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {t('refresh')}
          </Button>
        </div>
      </div>

      {feedbackError && (
        <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{feedbackError}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-card rounded-xl border p-4 space-y-4">
        {/* Status Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b">
          {STATUS_TABS.map((tab) => {
            const isActive = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setStatusFilter(tab.key);
                  setPage(1);
                }}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-2 ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <span>{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </div>

        {/* Search controls */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="pl-9 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Returns Table */}
      <div className="bg-card rounded-xl border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b text-xs uppercase font-semibold text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{t('colReturnNumber')}</th>
                <th className="px-4 py-3">{t('colOrderNumber')}</th>
                <th className="px-4 py-3">{t('colCustomer')}</th>
                <th className="px-4 py-3">{t('colDate')}</th>
                <th className="px-4 py-3">{t('colStatus')}</th>
                <th className="px-4 py-3">{t('colItems')}</th>
                <th className="px-4 py-3">{t('colEstimatedRefund')}</th>
                <th className="px-4 py-3 text-right">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && returns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    Loading return requests...
                  </td>
                </tr>
              ) : returns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-muted-foreground">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-medium">{t('noReturnsFound')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('noReturnsMatching')}</p>
                  </td>
                </tr>
              ) : (
                returns.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3.5 font-medium font-mono text-primary">
                      {item.returnNumber}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">
                      {item.orderNumber}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="leading-tight">
                        <p className="font-medium text-xs">{item.customer.name}</p>
                        <p className="text-[11px] text-muted-foreground">{item.customer.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3.5">{getStatusBadge(item.status)}</td>
                    <td className="px-4 py-3.5 text-xs">
                      {t('itemsCount', { count: item.itemCount })}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-semibold text-emerald-600">
                      {formatPrice(item.estimatedRefundAmount)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDetail(item.returnNumber)}
                          className="h-8 px-2 text-xs flex items-center gap-1"
                          title={t('viewDetails')}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{t('viewDetails')}</span>
                        </Button>

                        {item.status === 'REQUESTED' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenApprove(item.returnNumber)}
                              className="h-8 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-500/30 flex items-center gap-1"
                              title={t('approve')}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{t('approve')}</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenReject(item.returnNumber)}
                              className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10 border-destructive/30 flex items-center gap-1"
                              title={t('reject')}
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{t('reject')}</span>
                            </Button>
                          </>
                        )}

                        {item.status === 'APPROVED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenInspect(item.returnNumber)}
                            disabled={isInspectLoading}
                            className="h-8 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-500/30 flex items-center gap-1"
                            title={t('inspect')}
                          >
                            <Boxes className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{t('inspect')}</span>
                          </Button>
                        )}

                        {item.status === 'RECEIVED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenRefund(item.returnNumber)}
                            className="h-8 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-500/30 flex items-center gap-1"
                            title={t('processRefund')}
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{t('processRefund')}</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {(page - 1) * 15 + 1} to {Math.min(page * 15, totalCount)} of {totalCount}{' '}
              results
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                className="h-7 px-2.5 text-xs"
              >
                Previous
              </Button>
              <span className="px-2">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
                className="h-7 px-2.5 text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <ReturnDetailModal
        returnNumber={selectedReturnNumber}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onReturnUpdated={fetchReturns}
      />

      {/* Approve Dialog */}
      {actionReturnNumber && (
        <ApproveReturnDialog
          returnNumber={actionReturnNumber}
          isOpen={isApproveOpen}
          onClose={() => {
            setIsApproveOpen(false);
            setActionReturnNumber(null);
          }}
          onSuccess={fetchReturns}
        />
      )}

      {/* Reject Dialog */}
      {actionReturnNumber && (
        <RejectReturnDialog
          returnNumber={actionReturnNumber}
          isOpen={isRejectOpen}
          onClose={() => {
            setIsRejectOpen(false);
            setActionReturnNumber(null);
          }}
          onSuccess={fetchReturns}
        />
      )}

      {/* Inspect Modal */}
      {inspectDetail && (
        <InspectReturnModal
          returnRequest={inspectDetail}
          isOpen={isInspectOpen}
          onClose={() => {
            setIsInspectOpen(false);
            setInspectDetail(null);
          }}
          onSuccess={fetchReturns}
        />
      )}

      {/* Process Refund Modal */}
      {actionReturnNumber && (
        <ProcessRefundModal
          returnNumber={actionReturnNumber}
          isOpen={isRefundOpen}
          onClose={() => {
            setIsRefundOpen(false);
            setActionReturnNumber(null);
          }}
          onSuccess={fetchReturns}
        />
      )}
    </div>
  );
}
