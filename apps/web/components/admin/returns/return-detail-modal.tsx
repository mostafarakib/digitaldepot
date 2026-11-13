'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  X,
  Loader2,
  Package,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  User,
  ShieldCheck,
  Ban,
  Boxes,
  FileText,
  CreditCard,
  ShoppingBag,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type {
  AdminReturnDetail,
  ReturnRequestStatus,
  ReturnItemCondition,
} from '@/lib/order-types';
import { getAdminReturnDetailApi, reconcileAdminReturnRefundApi, ApiError } from '@/lib/api-client';
import { ApproveReturnDialog } from './approve-return-dialog';
import { RejectReturnDialog } from './reject-return-dialog';
import { InspectReturnModal } from './inspect-return-modal';
import { ProcessRefundModal } from './process-refund-modal';

interface ReturnDetailModalProps {
  returnNumber: string | null;
  isOpen: boolean;
  onClose: () => void;
  onReturnUpdated: () => void;
}

export function ReturnDetailModal({
  returnNumber,
  isOpen,
  onClose,
  onReturnUpdated,
}: ReturnDetailModalProps) {
  const t = useTranslations('admin.returns.detailsModal');
  const tReturns = useTranslations('admin.returns');

  const [returnDetail, setReturnDetail] = useState<AdminReturnDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [isApproveOpen, setIsApproveOpen] = useState<boolean>(false);
  const [isRejectOpen, setIsRejectOpen] = useState<boolean>(false);
  const [isInspectOpen, setIsInspectOpen] = useState<boolean>(false);
  const [isRefundOpen, setIsRefundOpen] = useState<boolean>(false);

  const [reconcilingRefundId, setReconcilingRefundId] = useState<string | null>(null);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  const fetchDetail = useCallback(async (num: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getAdminReturnDetailApi(num);
      setReturnDetail(res.return);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to fetch return details.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    if (isOpen && returnNumber) {
      getAdminReturnDetailApi(returnNumber)
        .then((res) => {
          if (!ignore) {
            setReturnDetail(res.return);
            setIsLoading(false);
          }
        })
        .catch((err) => {
          if (!ignore) {
            setError(err instanceof ApiError ? err.message : 'Failed to fetch return details.');
            setIsLoading(false);
          }
        });
    }

    return () => {
      ignore = true;
    };
  }, [isOpen, returnNumber]);

  if (!isOpen || !returnNumber) return null;

  const formatPrice = (poysha: number) => {
    return `৳${(poysha / 100).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (status: ReturnRequestStatus) => {
    switch (status) {
      case 'REQUESTED':
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
            {tReturns('statusRequested')}
          </Badge>
        );
      case 'APPROVED':
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
            {tReturns('statusApproved')}
          </Badge>
        );
      case 'RECEIVED':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
          >
            {tReturns('statusReceived')}
          </Badge>
        );
      case 'REJECTED':
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">
            {tReturns('statusRejected')}
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/30">
            {tReturns('statusCancelled')}
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getConditionBadge = (condition: ReturnItemCondition | null) => {
    if (!condition) {
      return (
        <Badge
          variant="outline"
          className="bg-slate-500/10 text-slate-400 border-slate-500/30 text-xs"
        >
          {t('notInspected')}
        </Badge>
      );
    }
    switch (condition) {
      case 'GOOD':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs"
          >
            GOOD (Restocked)
          </Badge>
        );
      case 'DAMAGED':
        return (
          <Badge
            variant="outline"
            className="bg-rose-500/10 text-rose-600 border-rose-500/30 text-xs"
          >
            DAMAGED (Quarantined)
          </Badge>
        );
      case 'OPENED_UNUSABLE':
        return (
          <Badge
            variant="outline"
            className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs"
          >
            OPENED / UNUSABLE
          </Badge>
        );
      default:
        return <Badge variant="outline">{condition}</Badge>;
    }
  };

  const getRefundStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs font-semibold"
          >
            COMPLETED
          </Badge>
        );
      case 'PENDING':
        return (
          <Badge
            variant="outline"
            className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs font-semibold animate-pulse"
          >
            PENDING
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge
            variant="outline"
            className="bg-rose-500/10 text-rose-600 border-rose-500/30 text-xs font-semibold"
          >
            FAILED
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleInlineReconcile = async () => {
    if (!returnNumber) return;
    setReconcileError(null);
    setReconcilingRefundId('reconciling');
    try {
      await reconcileAdminReturnRefundApi(returnNumber);
      await fetchDetail(returnNumber);
      onReturnUpdated();
    } catch (err) {
      setReconcileError(err instanceof ApiError ? err.message : 'Reconciliation failed.');
    } finally {
      setReconcilingRefundId(null);
    }
  };

  const handleActionSuccess = () => {
    if (returnNumber) {
      fetchDetail(returnNumber);
    }
    onReturnUpdated();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-card w-full max-w-4xl rounded-xl border shadow-xl flex flex-col max-h-[92vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-semibold text-foreground">
                    {t('title', { returnNumber })}
                  </h2>
                  {returnDetail && getStatusBadge(returnDetail.status)}
                </div>
                {returnDetail && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Requested on {new Date(returnDetail.createdAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="overflow-y-auto p-6 space-y-6 flex-1">
            {isLoading ? (
              <div className="py-20 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">Loading return details...</p>
              </div>
            ) : error ? (
              <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            ) : returnDetail ? (
              <>
                {/* Action Banner for Staff */}
                {returnDetail.status === 'REQUESTED' && (
                  <div className="p-4 rounded-xl border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-amber-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                          Awaiting Admin Decision
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Review return reason and approve for drop-off or reject with a reason.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="destructive" onClick={() => setIsRejectOpen(true)}>
                        <Ban className="w-4 h-4 mr-1.5" />
                        {tReturns('reject')}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => setIsApproveOpen(true)}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1.5" />
                        {tReturns('approve')}
                      </Button>
                    </div>
                  </div>
                )}

                {returnDetail.status === 'APPROVED' && (
                  <div className="p-4 rounded-xl border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Boxes className="w-5 h-5 text-blue-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                          Approved & Pending Physical Inspection
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          Inspect physical merchandise conditions to transition to RECEIVED and
                          restock inventory.
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                      onClick={() => setIsInspectOpen(true)}
                    >
                      <Boxes className="w-4 h-4 mr-1.5" />
                      {tReturns('inspect')}
                    </Button>
                  </div>
                )}

                {returnDetail.status === 'RECEIVED' && (
                  <div className="p-4 rounded-xl border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                          Inspection Complete & Ready for Refund
                        </p>
                        <p className="text-xs text-emerald-700 dark:text-emerald-300">
                          {returnDetail.refunds?.some((r) => r.status === 'PENDING')
                            ? 'A refund transaction is currently PENDING. Reconcile with the gateway or view details.'
                            : 'Physical items have been inspected and received. Review refund capacities and process payment refund.'}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                      onClick={() => setIsRefundOpen(true)}
                    >
                      <CreditCard className="w-4 h-4 mr-1.5" />
                      {tReturns('processRefund')}
                    </Button>
                  </div>
                )}

                {/* Return Overview Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Customer Information */}
                  <div className="p-4 rounded-lg border bg-card space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      {t('customerInfo')}
                    </h3>
                    <p className="text-sm font-semibold">{returnDetail.customer.name}</p>
                    <p className="text-xs text-muted-foreground">{returnDetail.customer.email}</p>
                    {returnDetail.customer.phone && (
                      <p className="text-xs text-muted-foreground">{returnDetail.customer.phone}</p>
                    )}
                  </div>

                  {/* Order Information */}
                  <div className="p-4 rounded-lg border bg-card space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5" />
                      {t('orderInfo')}
                    </h3>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{t('orderNumber')}:</span>
                      <span className="text-sm font-medium">{returnDetail.orderNumber}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Order Status:</span>
                      <Badge variant="outline" className="text-xs">
                        {returnDetail.orderSummary.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Payment Status:</span>
                      <Badge variant="outline" className="text-xs">
                        {returnDetail.orderSummary.paymentStatus} (
                        {returnDetail.orderSummary.paymentMethod})
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Return Reason & Notes */}
                <div className="p-4 rounded-lg border bg-card space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('reason')}
                      </p>
                      <p className="text-sm font-medium mt-0.5">{returnDetail.customerReason}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('estimatedRefund')}
                      </p>
                      <p className="text-sm font-bold text-emerald-600 mt-0.5">
                        {formatPrice(returnDetail.estimatedRefundAmount)}
                      </p>
                    </div>
                  </div>

                  {returnDetail.customerNotes && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('customerNotes')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
                        {returnDetail.customerNotes}
                      </p>
                    </div>
                  )}

                  {returnDetail.rejectionReason && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
                        {t('rejectionReason')}
                      </p>
                      <p className="text-xs text-destructive mt-0.5 whitespace-pre-wrap font-medium">
                        {returnDetail.rejectionReason}
                      </p>
                    </div>
                  )}
                </div>

                {/* Items & Inspection Breakdown */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" />
                    {t('itemsTitle')}
                  </h3>
                  <div className="border rounded-lg overflow-hidden bg-background divide-y">
                    {returnDetail.items.map((item) => (
                      <div
                        key={item.id}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative w-12 h-12 rounded-md bg-muted border overflow-hidden shrink-0 flex items-center justify-center">
                            {item.thumbnailUrl ? (
                              <Image
                                src={item.thumbnailUrl}
                                alt={item.productName}
                                fill
                                className="object-cover"
                                sizes="48px"
                              />
                            ) : (
                              <Package className="w-5 h-5 text-muted-foreground/60" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{item.productName}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.variantTitle} &bull; SKU: {item.sku}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Unit Price: {formatPrice(item.unitPrice)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col sm:items-end gap-1 shrink-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{t('colQty')}:</span>
                            <span className="text-xs font-semibold">{item.quantity}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {getConditionBadge(item.condition)}
                          </div>
                          {item.restockedQuantity > 0 && (
                            <span className="text-[11px] font-medium text-emerald-600">
                              {t('colRestocked')}: {item.restockedQuantity}
                            </span>
                          )}
                          {item.inspectedByUser && (
                            <span className="text-[10px] text-muted-foreground">
                              Inspected by {item.inspectedByUser.name}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Refund Transactions (Phase 7D) */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-primary" />
                      {t('refundsTitle')}
                    </h3>
                    {returnDetail.status === 'RECEIVED' && (
                      <Button
                        size="sm"
                        onClick={() => setIsRefundOpen(true)}
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        {tReturns('processRefund')}
                      </Button>
                    )}
                  </div>

                  {reconcileError && (
                    <div className="p-3 mb-3 bg-destructive/10 text-destructive text-xs rounded-lg border border-destructive/20 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{reconcileError}</span>
                    </div>
                  )}

                  <div className="border rounded-lg p-4 bg-background space-y-3">
                    {!returnDetail.refunds || returnDetail.refunds.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">{t('noRefunds')}</p>
                    ) : (
                      returnDetail.refunds.map((ref) => (
                        <div
                          key={ref.id}
                          className="p-3 rounded-lg border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-foreground">
                                {ref.refundNumber}
                              </span>
                              {getRefundStatusBadge(ref.status)}
                              <Badge variant="outline" className="text-[10px]">
                                {ref.method}
                              </Badge>
                            </div>
                            <div className="text-muted-foreground text-[11px] flex flex-wrap gap-x-3 gap-y-0.5">
                              <span>Merchandise: {formatPrice(ref.merchandiseAmount)}</span>
                              {ref.shippingAmount > 0 && (
                                <span className="text-primary font-medium">
                                  Shipping: {formatPrice(ref.shippingAmount)}
                                </span>
                              )}
                              {ref.payoutChannel && <span>Channel: {ref.payoutChannel}</span>}
                              {ref.payoutReference && <span>Ref: {ref.payoutReference}</span>}
                              {ref.gatewayReference && (
                                <span>Gateway Ref: {ref.gatewayReference}</span>
                              )}
                            </div>
                            {ref.failureReason && (
                              <p className="text-destructive font-medium text-[11px] mt-0.5">
                                Failure: {ref.failureReason}
                              </p>
                            )}
                            {ref.notes && (
                              <p className="text-muted-foreground italic text-[11px]">
                                &ldquo;{ref.notes}&rdquo;
                              </p>
                            )}
                          </div>

                          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0">
                            <span className="font-bold text-sm text-foreground">
                              {formatPrice(ref.amount)}
                            </span>
                            {ref.status === 'PENDING' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleInlineReconcile}
                                disabled={Boolean(reconcilingRefundId)}
                                className="h-7 px-2 text-xs text-amber-600 border-amber-500/30 hover:bg-amber-50 flex items-center gap-1"
                              >
                                {reconcilingRefundId ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                {t('reconcile')}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Status & Transition Audit Timeline */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    {t('timelineTitle')}
                  </h3>
                  <div className="border rounded-lg p-4 bg-background space-y-4">
                    {returnDetail.statusHistory.map((history, idx) => (
                      <div key={history.id} className="flex items-start gap-3 relative">
                        {idx !== returnDetail.statusHistory.length - 1 && (
                          <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-border -mb-4" />
                        )}
                        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 z-10">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 text-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 font-semibold">
                              <span>{history.fromStatus || 'INIT'}</span>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                              <span className="text-primary">{history.toStatus}</span>
                            </div>
                            <span className="text-muted-foreground">
                              {new Date(history.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-muted-foreground mt-0.5">
                            {history.changedByUser
                              ? t('byActor', {
                                  name: history.changedByUser.name,
                                  role: history.changedByUser.email,
                                })
                              : t('systemActor')}
                          </p>
                          {history.reason && (
                            <p className="text-foreground/90 bg-muted/50 p-2 rounded mt-1.5 italic">
                              &ldquo;{history.reason}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end px-6 py-4 border-t bg-muted/20">
            <Button variant="outline" onClick={onClose}>
              {t('close')}
            </Button>
          </div>
        </div>
      </div>

      {/* Subdialogs */}
      {returnDetail && (
        <>
          <ApproveReturnDialog
            returnNumber={returnDetail.returnNumber}
            isOpen={isApproveOpen}
            onClose={() => setIsApproveOpen(false)}
            onSuccess={handleActionSuccess}
          />
          <RejectReturnDialog
            returnNumber={returnDetail.returnNumber}
            isOpen={isRejectOpen}
            onClose={() => setIsRejectOpen(false)}
            onSuccess={handleActionSuccess}
          />
          <InspectReturnModal
            returnRequest={returnDetail}
            isOpen={isInspectOpen}
            onClose={() => setIsInspectOpen(false)}
            onSuccess={handleActionSuccess}
          />
          <ProcessRefundModal
            returnNumber={returnDetail.returnNumber}
            isOpen={isRefundOpen}
            onClose={() => setIsRefundOpen(false)}
            onSuccess={handleActionSuccess}
          />
        </>
      )}
    </>
  );
}
