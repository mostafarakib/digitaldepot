'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, CheckCircle2, Loader2, X, Plus, Minus, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { InventoryAdjustmentType, InventoryListItem } from '@/lib/catalogue-types';

interface StockAdjustmentModalProps {
  open: boolean;
  item: InventoryListItem | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function StockAdjustmentModal({
  open,
  item,
  onClose,
  onSuccess,
}: StockAdjustmentModalProps) {
  const t = useTranslations('admin.inventory');

  const [type, setType] = useState<InventoryAdjustmentType>('RECEIVE');
  const [correctionMode, setCorrectionMode] = useState<'DELTA' | 'SET'>('SET');
  const [quantityInput, setQuantityInput] = useState<string>('1');
  const [targetCountInput, setTargetCountInput] = useState<string>(String(item?.quantity ?? 0));
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !item) return null;

  const currentOnHand = item.quantity;
  const currentReserved = item.reservedQuantity;

  // Calculate the effective delta
  let effectiveDelta = 0;
  if (type === 'CORRECTION') {
    if (correctionMode === 'SET') {
      const target = parseInt(targetCountInput, 10);
      effectiveDelta = Number.isNaN(target) ? 0 : target - currentOnHand;
    } else {
      const q = parseInt(quantityInput, 10);
      effectiveDelta = Number.isNaN(q) ? 0 : q;
    }
  } else if (type === 'RECEIVE' || type === 'RETURN_RESTOCK') {
    const q = Math.abs(parseInt(quantityInput, 10) || 0);
    effectiveDelta = q;
  } else if (type === 'DAMAGE' || type === 'THEFT_LOSS') {
    const q = Math.abs(parseInt(quantityInput, 10) || 0);
    effectiveDelta = -q;
  }

  const newOnHand = currentOnHand + effectiveDelta;
  const newAvailable = newOnHand - currentReserved;
  const isNegative = newOnHand < 0 || newAvailable < 0;
  const isZeroDelta = effectiveDelta === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isZeroDelta) {
      setError(t('adjustModal.errors.zeroDelta'));
      return;
    }

    if (isNegative) {
      setError(t('adjustModal.errors.negativeStock'));
      return;
    }

    if (!reason.trim() || reason.trim().length < 3) {
      setError(t('adjustModal.errors.reasonRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      const csrfRes = await fetch('/api/auth/csrf');
      const csrfData = await csrfRes.json();
      const csrfToken = csrfData.data?.csrfToken || '';

      const res = await fetch('/api/admin/inventory/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          variantId: item.variantId,
          type,
          quantityDelta: effectiveDelta,
          reason: reason.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || t('adjustModal.errors.failed'));
      }

      onSuccess(t('adjustModal.successMessage'));
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('adjustModal.errors.failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setReason('');
    setQuantityInput('1');
    setTargetCountInput(String(item.quantity));
    setType('RECEIVE');
    setCorrectionMode('SET');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-background border border-border rounded-xl shadow-2xl p-6 sm:p-8 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {t('adjustModal.title')}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {item.variant.product.name} —{' '}
              <span className="font-semibold text-foreground">{item.variant.name}</span> (
              {item.variant.sku})
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pt-4 space-y-4">
          {/* Current Stock Snapshot Card */}
          <div className="grid grid-cols-3 gap-3 p-3.5 bg-muted/40 rounded-lg border border-border text-center">
            <div>
              <p className="text-xs text-muted-foreground">{t('table.onHand')}</p>
              <p className="text-lg font-bold text-foreground">{currentOnHand}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('table.reserved')}</p>
              <p className="text-lg font-bold text-muted-foreground">{currentReserved}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('table.available')}</p>
              <p
                className={`text-lg font-bold ${
                  item.available <= 0
                    ? 'text-destructive'
                    : item.isLowStock
                      ? 'text-amber-500'
                      : 'text-emerald-500'
                }`}
              >
                {item.available}
              </p>
            </div>
          </div>

          {/* Adjustment Reason/Type Selector */}
          <div className="space-y-1.5">
            <Label htmlFor="adjustmentType">{t('adjustModal.typeLabel')}</Label>
            <select
              id="adjustmentType"
              value={type}
              onChange={(e) => {
                const nextType = e.target.value as InventoryAdjustmentType;
                setType(nextType);
                setError(null);
              }}
              className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="RECEIVE">{t('types.RECEIVE')} (+)</option>
              <option value="CORRECTION">{t('types.CORRECTION')} (+ / -)</option>
              <option value="DAMAGE">{t('types.DAMAGE')} (-)</option>
              <option value="THEFT_LOSS">{t('types.THEFT_LOSS')} (-)</option>
              <option value="RETURN_RESTOCK">{t('types.RETURN_RESTOCK')} (+)</option>
            </select>
          </div>

          {/* Sub-mode for CORRECTION */}
          {type === 'CORRECTION' && (
            <div className="space-y-2 p-3 bg-muted/20 border border-border rounded-lg">
              <Label className="text-xs text-muted-foreground">
                {t('adjustModal.correctionModeLabel')}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={correctionMode === 'SET' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCorrectionMode('SET')}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  {t('adjustModal.setCountMode')}
                </Button>
                <Button
                  type="button"
                  variant={correctionMode === 'DELTA' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCorrectionMode('DELTA')}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <Minus className="w-3.5 h-3.5" />
                  {t('adjustModal.relativeDeltaMode')}
                </Button>
              </div>
            </div>
          )}

          {/* Quantity Inputs */}
          {type === 'CORRECTION' && correctionMode === 'SET' ? (
            <div className="space-y-1.5">
              <Label htmlFor="targetCount">{t('adjustModal.targetCountLabel')}</Label>
              <Input
                id="targetCount"
                type="number"
                min="0"
                value={targetCountInput}
                onChange={(e) => setTargetCountInput(e.target.value)}
                placeholder="0"
                required
              />
              <p className="text-xs text-muted-foreground">{t('adjustModal.targetCountHelp')}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="qtyDelta">
                {type === 'CORRECTION'
                  ? t('adjustModal.deltaAmountLabel')
                  : type === 'DAMAGE' || type === 'THEFT_LOSS'
                    ? t('adjustModal.unitsToDeductLabel')
                    : t('adjustModal.unitsToAddLabel')}
              </Label>
              <Input
                id="qtyDelta"
                type="number"
                min={type === 'CORRECTION' ? undefined : '1'}
                value={quantityInput}
                onChange={(e) => setQuantityInput(e.target.value)}
                placeholder={type === 'CORRECTION' ? '+5 or -3' : '1'}
                required
              />
            </div>
          )}

          {/* Real-time Transition Calculation Card */}
          <div
            className={`p-3.5 rounded-lg border text-sm flex items-center justify-between transition-colors ${
              isNegative
                ? 'bg-destructive/10 border-destructive/30 text-destructive'
                : 'bg-muted/40 border-border text-foreground'
            }`}
          >
            <div>
              <span className="text-xs text-muted-foreground block">
                {t('adjustModal.previewTitle')}
              </span>
              <span className="font-semibold">
                {currentOnHand}{' '}
                <span
                  className={
                    effectiveDelta > 0
                      ? 'text-emerald-500 font-bold'
                      : effectiveDelta < 0
                        ? 'text-destructive font-bold'
                        : 'text-muted-foreground'
                  }
                >
                  {effectiveDelta > 0
                    ? `+${effectiveDelta}`
                    : effectiveDelta === 0
                      ? '±0'
                      : `${effectiveDelta}`}
                </span>{' '}
                &rarr; <span className="font-bold underline">{newOnHand}</span> units
              </span>
            </div>
            {isNegative ? (
              <span className="text-xs font-semibold px-2 py-1 bg-destructive/20 rounded text-destructive">
                {t('adjustModal.invalidNegative')}
              </span>
            ) : isZeroDelta ? (
              <span className="text-xs font-medium px-2 py-1 bg-muted rounded text-muted-foreground">
                {t('adjustModal.noChange')}
              </span>
            ) : (
              <span className="text-xs font-medium px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t('adjustModal.valid')}
              </span>
            )}
          </div>

          {/* Reason Textarea (Mandatory) */}
          <div className="space-y-1.5">
            <Label htmlFor="reason">{t('adjustModal.reasonLabel')}</Label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('adjustModal.reasonPlaceholder')}
              rows={3}
              required
              className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
            <p className="text-xs text-muted-foreground">{t('adjustModal.reasonHelp')}</p>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isNegative || isZeroDelta || !reason.trim()}
              className="min-w-[120px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {t('common.saving')}
                </>
              ) : (
                t('adjustModal.submitButton')
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
