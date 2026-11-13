'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { getReturnEligibilityApi, createReturnRequestApi, ApiError } from '@/lib/api-client';
import type {
  CustomerReturnEligibilityItem,
  CustomerReturnEligibilityResponse,
} from '@/lib/order-types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RotateCcw, AlertTriangle, Loader2, PackageCheck, X } from 'lucide-react';

interface RequestReturnDialogProps {
  orderNumber: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const RETURN_REASONS = [
  'DEFECTIVE_ITEM',
  'WRONG_ITEM_SENT',
  'NOT_AS_DESCRIBED',
  'DAMAGED_IN_TRANSIT',
  'CHANGED_MIND',
  'OTHER',
] as const;

export function RequestReturnDialog({
  orderNumber,
  isOpen,
  onClose,
  onSuccess,
}: RequestReturnDialogProps) {
  const t = useTranslations('returns');

  const [eligibility, setEligibility] = useState<CustomerReturnEligibilityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedItems, setSelectedItems] = useState<
    Record<string, { selected: boolean; quantity: number; reason?: string }>
  >({});
  const [customerReason, setCustomerReason] = useState<string>('DEFECTIVE_ITEM');
  const [customerNotes, setCustomerNotes] = useState<string>('');

  const handleClose = () => {
    setIsLoading(true);
    setError(null);
    setEligibility(null);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    let ignore = false;

    getReturnEligibilityApi(orderNumber)
      .then((res) => {
        if (!ignore) {
          setEligibility(res);
          // Initialize selection state
          const initialMap: Record<string, { selected: boolean; quantity: number }> = {};
          for (const item of res.items) {
            if (item.isReturnable) {
              initialMap[item.orderItemId] = {
                selected: false,
                quantity: Math.min(1, item.returnableQuantity),
              };
            }
          }
          setSelectedItems(initialMap);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError(t('form.errorGeneric'));
          }
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [isOpen, orderNumber, t]);

  const handleToggleItem = (orderItemId: string) => {
    setSelectedItems((prev) => ({
      ...prev,
      [orderItemId]: {
        ...prev[orderItemId],
        selected: !prev[orderItemId]?.selected,
      },
    }));
  };

  const handleQuantityChange = (orderItemId: string, maxQty: number, nextQty: number) => {
    const clamped = Math.max(1, Math.min(maxQty, nextQty));
    setSelectedItems((prev) => ({
      ...prev,
      [orderItemId]: {
        ...prev[orderItemId],
        quantity: clamped,
      },
    }));
  };

  // Real-time estimated refund calculation
  const totalEstimatedRefund = useMemo(() => {
    if (!eligibility) return 0;
    let sum = 0;
    for (const item of eligibility.items) {
      const sel = selectedItems[item.orderItemId];
      if (sel?.selected) {
        sum += item.netUnitPrice * sel.quantity;
      }
    }
    return sum;
  }, [eligibility, selectedItems]);

  const formatPrice = (poysha: number) => {
    return `৳${(poysha / 100).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`;
  };

  const hasSelectedItems = Object.values(selectedItems).some((s) => s.selected && s.quantity > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasSelectedItems || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const itemsToReturn = Object.entries(selectedItems)
      .filter(([, val]) => val.selected && val.quantity > 0)
      .map(([orderItemId, val]) => ({
        orderItemId,
        quantity: val.quantity,
        reason: val.reason || customerReason,
      }));

    try {
      await createReturnRequestApi(orderNumber, {
        customerReason,
        customerNotes: customerNotes.trim() ? customerNotes.trim() : undefined,
        items: itemsToReturn,
      });

      onSuccess();
      handleClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('form.errorGeneric'));
      }
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-card border border-border shadow-xl rounded-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-border/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw className="size-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              {t('requestReturnTitle', { orderNumber })}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground rounded-lg p-1 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm">Checking return eligibility...</p>
            </div>
          ) : error && !eligibility ? (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
              <AlertTriangle className="size-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : eligibility && !eligibility.isEligible ? (
            <div className="p-5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm flex items-start gap-3">
              <AlertTriangle className="size-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">{t('noReturnableItems')}</p>
                <p className="text-xs text-muted-foreground">
                  {eligibility.reason === 'RETURN_WINDOW_EXPIRED'
                    ? t('returnWindowExpired')
                    : eligibility.reason === 'ORDER_NOT_DELIVERED'
                      ? t('orderNotDelivered')
                      : t('noReturnableItems')}
                </p>
              </div>
            </div>
          ) : (
            <form id="return-form" onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {error}
                </div>
              )}

              {/* Window Banner */}
              {eligibility && (
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg">
                  <PackageCheck className="size-4 shrink-0" />
                  <span>{t('returnWindowNotice', { days: eligibility.daysRemaining })}</span>
                </div>
              )}

              {/* Items Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">
                  {t('form.selectItemsPrompt')}
                </label>
                <div className="space-y-2.5">
                  {eligibility?.items
                    .filter((it) => it.isReturnable)
                    .map((item) => {
                      const sel = selectedItems[item.orderItemId] || {
                        selected: false,
                        quantity: 1,
                      };
                      return (
                        <Card
                          key={item.orderItemId}
                          className={`p-3.5 transition-colors border ${
                            sel.selected
                              ? 'border-primary bg-primary/5'
                              : 'border-border/70 hover:border-border'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              id={`check-${item.orderItemId}`}
                              checked={sel.selected}
                              onChange={() => handleToggleItem(item.orderItemId)}
                              className="mt-1 size-4 rounded border-border text-primary focus:ring-primary"
                            />
                            <div className="flex-1 min-w-0">
                              <label
                                htmlFor={`check-${item.orderItemId}`}
                                className="text-sm font-medium text-foreground cursor-pointer block truncate"
                              >
                                {item.productName}
                              </label>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                <span>{item.variantTitle}</span>
                                <span>•</span>
                                <span>
                                  {t('form.maxReturnable', { count: item.returnableQuantity })}
                                </span>
                              </div>
                              <p className="text-xs font-medium text-foreground mt-1">
                                Net unit price: {formatPrice(item.netUnitPrice)}
                              </p>
                            </div>

                            {/* Quantity Stepper */}
                            {sel.selected && (
                              <div className="flex items-center gap-2 shrink-0">
                                <label className="text-xs text-muted-foreground">
                                  {t('form.quantityLabel')}:
                                </label>
                                <div className="flex items-center border border-border rounded-md bg-background">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleQuantityChange(
                                        item.orderItemId,
                                        item.returnableQuantity,
                                        sel.quantity - 1,
                                      )
                                    }
                                    disabled={sel.quantity <= 1}
                                    className="px-2 py-1 text-xs hover:bg-muted disabled:opacity-40"
                                  >
                                    -
                                  </button>
                                  <span className="px-2 py-1 text-xs font-medium min-w-[24px] text-center">
                                    {sel.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleQuantityChange(
                                        item.orderItemId,
                                        item.returnableQuantity,
                                        sel.quantity + 1,
                                      )
                                    }
                                    disabled={sel.quantity >= item.returnableQuantity}
                                    className="px-2 py-1 text-xs hover:bg-muted disabled:opacity-40"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                </div>
              </div>

              {/* Return Reason Selector */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  {t('form.reasonLabel')} <span className="text-destructive">*</span>
                </label>
                <select
                  value={customerReason}
                  onChange={(e) => setCustomerReason(e.target.value)}
                  className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {RETURN_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {t(`reasons.${r}` as any)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  {t('form.notesLabel')}
                </label>
                <textarea
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  placeholder={t('form.notesPlaceholder')}
                  rows={3}
                  maxLength={1000}
                  className="w-full text-sm rounded-md border border-input bg-background p-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              {/* Live Estimated Refund Notice */}
              <div className="p-3.5 rounded-lg bg-muted/60 border border-border/80 flex items-center justify-between">
                <div className="text-xs">
                  <span className="font-semibold text-foreground">
                    {t('form.estimatedRefundLabel')}
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Subject to physical item inspection.
                  </p>
                </div>
                <span className="text-base font-bold text-primary font-mono">
                  {formatPrice(totalEstimatedRefund)}
                </span>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/80 bg-muted/20 flex items-center justify-end gap-2.5">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
            {t('form.cancelButton')}
          </Button>
          <Button
            type="submit"
            form="return-form"
            disabled={!hasSelectedItems || isSubmitting || isLoading}
            className="gap-2"
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            <span>{isSubmitting ? t('form.submittingButton') : t('form.submitButton')}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
