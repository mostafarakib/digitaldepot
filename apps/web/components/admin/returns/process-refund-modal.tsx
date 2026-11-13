'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  X,
  Loader2,
  AlertCircle,
  CreditCard,
  DollarSign,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Receipt,
  Building,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { AdminRefundPreview, AdminProcessRefundInput, PayoutChannel } from '@/lib/order-types';
import {
  getAdminReturnRefundPreviewApi,
  processAdminReturnRefundApi,
  reconcileAdminReturnRefundApi,
  ApiError,
} from '@/lib/api-client';

interface ProcessRefundModalProps {
  returnNumber: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ProcessRefundModal({
  returnNumber,
  isOpen,
  onClose,
  onSuccess,
}: ProcessRefundModalProps) {
  const t = useTranslations('admin.returns.refundModal');
  const tCommon = useTranslations('common');

  const [preview, setPreview] = useState<AdminRefundPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states
  const [shippingAmountTaka, setShippingAmountTaka] = useState<number | ''>(0);
  const [shippingRefundReason, setShippingRefundReason] = useState<string>('');
  const [payoutChannel, setPayoutChannel] = useState<PayoutChannel>('BKASH');
  const [payoutReference, setPayoutReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isReconciling, setIsReconciling] = useState<boolean>(false);

  const handleClose = () => {
    setShippingAmountTaka(0);
    setShippingRefundReason('');
    setPayoutReference('');
    setNotes('');
    setError(null);
    setSuccessMessage(null);
    onClose();
  };

  const fetchPreview = useCallback(async (num: string) => {
    setIsLoadingPreview(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await getAdminReturnRefundPreviewApi(num);
      setPreview(res.preview);
      if (res.preview.targetPayment.method === 'COD') {
        setPayoutChannel('BKASH');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to fetch refund calculation preview.');
      }
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    if (isOpen && returnNumber) {
      getAdminReturnRefundPreviewApi(returnNumber)
        .then((res) => {
          if (!ignore) {
            setPreview(res.preview);
            if (res.preview.targetPayment.method === 'COD') {
              setPayoutChannel('BKASH');
            }
            setIsLoadingPreview(false);
          }
        })
        .catch((err) => {
          if (!ignore) {
            setError(
              err instanceof ApiError ? err.message : 'Failed to fetch refund calculation preview.',
            );
            setIsLoadingPreview(false);
          }
        });
    }

    return () => {
      ignore = true;
    };
  }, [isOpen, returnNumber]);

  if (!isOpen) return null;

  const formatPrice = (poisha: number) => {
    return `৳ ${(poisha / 100).toFixed(2)}`;
  };

  const merchandisePoisha = preview ? preview.merchandiseAmount : 0;
  const shippingPoisha = Math.round(Number(shippingAmountTaka || 0) * 100);
  const totalRefundPoisha = merchandisePoisha + shippingPoisha;

  const maxAllowedShippingPoisha = preview
    ? Math.max(0, preview.maxOrderRefundCapacity - preview.merchandiseAmount)
    : 0;

  const isCod = preview?.targetPayment.method === 'COD';

  const handleReconcile = async () => {
    setIsReconciling(true);
    setError(null);
    try {
      const res = await reconcileAdminReturnRefundApi(returnNumber);
      if (res.refund.status === 'COMPLETED') {
        setSuccessMessage('Refund verified and completed via gateway reconciliation.');
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1200);
      } else if (res.refund.status === 'FAILED') {
        setError(
          `Gateway confirmed refund failed: ${res.refund.failureReason || 'Declined'}. You can now initiate a new refund attempt.`,
        );
        fetchPreview(returnNumber);
      } else {
        setError('Gateway reported refund is still pending. Please try reconciling again later.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reconciliation request failed.');
    } finally {
      setIsReconciling(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview) return;

    setError(null);

    // Frontend validations
    if (shippingPoisha > 0 && !shippingRefundReason.trim()) {
      setError('A reason is required when refunding shipping fee.');
      return;
    }

    if (shippingPoisha > maxAllowedShippingPoisha) {
      setError(
        `Shipping refund cannot exceed available capacity of ${formatPrice(maxAllowedShippingPoisha)}.`,
      );
      return;
    }

    if (isCod && payoutChannel !== 'CASH' && !payoutReference.trim()) {
      setError(`Payout reference is required for ${payoutChannel} disbursements.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: AdminProcessRefundInput = {
        paymentId: preview.targetPayment.id,
        shippingAmount: shippingPoisha,
        shippingRefundReason: shippingPoisha > 0 ? shippingRefundReason.trim() : undefined,
        payoutChannel: isCod ? payoutChannel : undefined,
        payoutReference: isCod && payoutReference.trim() ? payoutReference.trim() : undefined,
        notes: notes.trim() || undefined,
      };

      const res = await processAdminReturnRefundApi(returnNumber, payload);

      if (res.refund.status === 'COMPLETED') {
        setSuccessMessage('Refund processed and finalized successfully.');
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1000);
      } else if (res.refund.status === 'PENDING') {
        setSuccessMessage(
          'Refund initiated with gateway. The outcome is pending verification. Please use Reconcile to verify final status.',
        );
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 2000);
      } else {
        setError(
          res.refund.failureReason || 'Refund failed at gateway. Capacity has been released.',
        );
        fetchPreview(returnNumber);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to process refund.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-xl rounded-xl border shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">{t('title', { returnNumber })}</h2>
              <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 space-y-5 flex-1">
          {isLoadingPreview ? (
            <div className="py-16 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">Calculating authoritative refund breakdown...</p>
            </div>
          ) : error && !preview ? (
            <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : preview ? (
            <>
              {error && (
                <div className="p-3 bg-destructive/10 text-destructive text-xs rounded-lg border border-destructive/20 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-3 bg-emerald-500/10 text-emerald-600 text-xs rounded-lg border border-emerald-500/20 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* Pending Refund Banner */}
              {preview.hasPendingRefund && preview.pendingRefund && (
                <div className="p-4 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold">Active Pending Refund Detected</p>
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                        {t('pendingWarning')}
                      </p>
                      <div className="mt-2 text-xs font-mono bg-background/50 p-2 rounded border border-amber-500/20">
                        Refund #: {preview.pendingRefund.refundNumber} &bull; Amount:{' '}
                        {formatPrice(preview.pendingRefund.amount)} &bull; Initiated:{' '}
                        {new Date(preview.pendingRefund.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleReconcile}
                      disabled={isReconciling}
                      className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5"
                    >
                      {isReconciling ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Checking Gateway...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          {t('reconcilePrompt')}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Refund Financial Summary Box */}
              <div className="p-4 rounded-xl border bg-muted/30 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5" />
                    Financial Breakdown
                  </span>
                  <Badge variant="outline" className="font-mono text-xs">
                    Order #{preview.orderNumber}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">{t('merchandiseRefund')}:</span>
                    <p className="font-semibold text-sm text-foreground">
                      {formatPrice(preview.merchandiseAmount)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('availableCapacity')}:</span>
                    <p className="font-semibold text-sm text-foreground">
                      {formatPrice(preview.maxOrderRefundCapacity)}
                    </p>
                  </div>
                </div>

                {/* Target Payment Card */}
                <div className="pt-2 border-t text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('targetPayment')}:</span>
                    <span className="font-medium">
                      {preview.targetPayment.method}
                      {preview.targetPayment.gateway ? ` (${preview.targetPayment.gateway})` : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground text-[11px] mt-0.5">
                    <span>
                      {t('captured')}: {formatPrice(preview.targetPayment.capturedAmount)}
                    </span>
                    <span>
                      {t('refunded')}: {formatPrice(preview.targetPayment.totalRefunded)}
                    </span>
                    <span className="text-emerald-600 font-semibold">
                      {t('remaining')}: {formatPrice(preview.targetPayment.remainingCapacity)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Processing Form */}
              {!preview.hasPendingRefund && (
                <form id="process-refund-form" onSubmit={handleSubmit} className="space-y-4">
                  {/* Shipping Fee Override */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-foreground">
                        {t('shippingFeeRefund')}
                      </label>
                      <span className="text-[11px] text-muted-foreground">
                        Max: {formatPrice(maxAllowedShippingPoisha)}
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-semibold">
                        ৳
                      </span>
                      <Input
                        type="number"
                        min="0"
                        max={maxAllowedShippingPoisha / 100}
                        step="0.01"
                        value={shippingAmountTaka}
                        onChange={(e) =>
                          setShippingAmountTaka(
                            e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value)),
                          )
                        }
                        className="pl-7 h-9 text-xs"
                      />
                    </div>
                  </div>

                  {/* Shipping Refund Reason (Required if shipping > 0) */}
                  {shippingPoisha > 0 && (
                    <div className="space-y-1.5 animate-in fade-in duration-150">
                      <label className="text-xs font-medium text-amber-700 dark:text-amber-300">
                        {t('shippingReason')} *
                      </label>
                      <Input
                        type="text"
                        required
                        value={shippingRefundReason}
                        onChange={(e) => setShippingRefundReason(e.target.value)}
                        placeholder={t('shippingReasonPlaceholder')}
                        className="h-9 text-xs"
                      />
                    </div>
                  )}

                  {/* COD Specific Payout Fields */}
                  {isCod && (
                    <div className="p-3.5 rounded-lg border bg-muted/20 space-y-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <Building className="w-3.5 h-3.5 text-primary" />
                        COD Disbursement Details
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">
                          {t('payoutChannel')} *
                        </label>
                        <select
                          value={payoutChannel}
                          onChange={(e) => setPayoutChannel(e.target.value as PayoutChannel)}
                          className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="BKASH">bKash Personal / Merchant</option>
                          <option value="NAGAD">Nagad</option>
                          <option value="BANK_TRANSFER">Bank EFT / Wire Transfer</option>
                          <option value="CASH">Store Cash Counter (Receipt)</option>
                        </select>
                      </div>

                      {payoutChannel !== 'CASH' && (
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">
                            {t('payoutRef')} *
                          </label>
                          <Input
                            type="text"
                            required
                            value={payoutReference}
                            onChange={(e) => setPayoutReference(e.target.value)}
                            placeholder={t('payoutRefPlaceholder')}
                            className="h-9 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Operational Notes */}
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t('notes')}</label>
                    <Input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={t('notesPlaceholder')}
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* Total Payable Refund Highlight */}
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-emerald-950 dark:text-emerald-200">
                        {t('totalRefund')}
                      </p>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                        Will be disbursed via {isCod ? payoutChannel : 'SSLCOMMERZ'}
                      </p>
                    </div>
                    <span className="text-base font-bold text-emerald-600">
                      {formatPrice(totalRefundPoisha)}
                    </span>
                  </div>
                </form>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-muted/20">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting || isReconciling}>
            Cancel
          </Button>

          {preview && !preview.hasPendingRefund && (
            <Button
              type="submit"
              form="process-refund-form"
              disabled={isSubmitting || totalRefundPoisha <= 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t('processing')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t('confirm')}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
