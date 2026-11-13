'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { inspectAdminReturnApi, ApiError } from '@/lib/api-client';
import type { AdminReturnDetail, ReturnItemCondition } from '@/lib/order-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Boxes,
  Loader2,
  Package,
  AlertCircle,
  X,
  CheckCircle2,
  AlertTriangle,
  FileText,
} from 'lucide-react';

interface InspectReturnModalProps {
  returnRequest: AdminReturnDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function InspectReturnModal({
  returnRequest,
  isOpen,
  onClose,
  onSuccess,
}: InspectReturnModalProps) {
  const t = useTranslations('admin.returns.inspectModal');

  // Condition map for each return item ID
  const [conditions, setConditions] = useState<Record<string, ReturnItemCondition>>(() => {
    const initialConditions: Record<string, ReturnItemCondition> = {};
    if (returnRequest?.items) {
      returnRequest.items.forEach((item) => {
        initialConditions[item.id] = (item.condition as ReturnItemCondition) || 'GOOD';
      });
    }
    return initialConditions;
  });
  const [adminNotes, setAdminNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !returnRequest) return null;

  // Calculate live restock quantity (only items with condition === 'GOOD')
  const totalRestockUnits = returnRequest.items.reduce((acc, item) => {
    const cond = conditions[item.id] || 'GOOD';
    return cond === 'GOOD' ? acc + item.quantity : acc;
  }, 0);

  const handleConditionChange = (itemId: string, cond: ReturnItemCondition) => {
    setConditions((prev) => ({
      ...prev,
      [itemId]: cond,
    }));
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const inspectPayload = {
        items: returnRequest.items.map((item) => ({
          returnItemId: item.id,
          condition: conditions[item.id] || 'GOOD',
          inspectedQuantity: item.quantity,
        })),
        notes: adminNotes.trim() || undefined,
      };

      await inspectAdminReturnApi(returnRequest.returnNumber, inspectPayload);
      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to complete inspection.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-3xl rounded-xl border shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {t('title', { returnNumber: returnRequest.returnNumber })}
              </h2>
              <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="flex items-start gap-3 p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Items Table */}
          <div className="border rounded-lg overflow-hidden bg-background">
            <div className="px-4 py-3 bg-muted/50 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t('itemsHeader')}</h3>
              <span className="text-xs text-muted-foreground">
                {returnRequest.items.length} {returnRequest.items.length === 1 ? 'item' : 'items'}{' '}
                to inspect
              </span>
            </div>
            <div className="divide-y">
              {returnRequest.items.map((item) => {
                const selectedCond = conditions[item.id] || 'GOOD';
                return (
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
                        <p className="text-sm font-medium leading-snug">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.variantTitle} &bull; SKU: {item.sku}
                        </p>
                        <p className="text-xs font-semibold text-primary mt-0.5">
                          Return Qty: {item.quantity}
                        </p>
                      </div>
                    </div>

                    {/* Condition Selector */}
                    <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-muted-foreground">
                          Condition:
                        </label>
                        <select
                          value={selectedCond}
                          onChange={(e) =>
                            handleConditionChange(item.id, e.target.value as ReturnItemCondition)
                          }
                          disabled={isSubmitting}
                          className="text-xs font-medium rounded-md border bg-background px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                        >
                          <option value="GOOD">{t('conditionGood')}</option>
                          <option value="DAMAGED">{t('conditionDamaged')}</option>
                          <option value="OPENED_UNUSABLE">{t('conditionOpenedUnusable')}</option>
                        </select>
                      </div>

                      {/* Restock indicator badge */}
                      {selectedCond === 'GOOD' ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[11px]"
                        >
                          {t('restockBadgeGood', { qty: item.quantity })}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[11px]"
                        >
                          {t('restockBadgeNone')}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Restock Summary Banner */}
          <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-900 dark:text-emerald-200 font-medium">
              {t('restockSummary', { count: totalRestockUnits })}
            </p>
          </div>

          {/* Inspection Notes */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              {t('adminNotesLabel')}
            </label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder={t('adminNotesPlaceholder')}
              rows={3}
              disabled={isSubmitting}
              className="w-full text-sm rounded-lg border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/20">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('confirming')}
              </>
            ) : (
              t('confirm')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
