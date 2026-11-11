'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminCoupon, CreateCouponInput, UpdateCouponInput } from '@/lib/coupon-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TicketPercent, Loader2, AlertCircle } from 'lucide-react';

interface CouponModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateCouponInput | UpdateCouponInput) => Promise<void>;
  coupon?: AdminCoupon | null;
}

export function CouponModal({ isOpen, onClose, onSubmit, coupon }: CouponModalProps) {
  const t = useTranslations('admin.coupons');
  const isEditing = Boolean(coupon);

  const [code, setCode] = useState(() => coupon?.code || '');
  const [description, setDescription] = useState(() => coupon?.description || '');
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>(
    () => coupon?.discountType || 'PERCENTAGE',
  );
  const [discountValue, setDiscountValue] = useState<string>(() => {
    if (!coupon) return '';
    return coupon.discountType === 'PERCENTAGE'
      ? String(coupon.discountValue)
      : String(coupon.discountValue / 100);
  });
  const [minOrderTaka, setMinOrderTaka] = useState<string>(() =>
    coupon?.minOrderAmount ? String(coupon.minOrderAmount / 100) : '',
  );
  const [maxDiscountTaka, setMaxDiscountTaka] = useState<string>(() =>
    coupon?.maxDiscountAmount ? String(coupon.maxDiscountAmount / 100) : '',
  );
  const [startDate, setStartDate] = useState<string>(() => {
    if (coupon) return new Date(coupon.startDate).toISOString().slice(0, 16);
    return new Date().toISOString().slice(0, 16);
  });
  const [endDate, setEndDate] = useState<string>(() => {
    if (coupon) return new Date(coupon.endDate).toISOString().slice(0, 16);
    const inOneWeek = new Date(Date.now() + 7 * 86400000);
    return inOneWeek.toISOString().slice(0, 16);
  });
  const [usageLimit, setUsageLimit] = useState<string>(() =>
    coupon?.usageLimit ? String(coupon.usageLimit) : '',
  );
  const [perCustomerLimit, setPerCustomerLimit] = useState<string>(() =>
    coupon?.perCustomerLimit ? String(coupon.perCustomerLimit) : '1',
  );
  const [isActive, setIsActive] = useState<boolean>(() => (coupon ? coupon.isActive : true));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const valNum = Number(discountValue);
    if (!valNum || valNum <= 0) {
      setError(
        discountType === 'PERCENTAGE'
          ? 'Percentage discount must be between 1 and 100'
          : 'Discount amount must be greater than 0',
      );
      return;
    }

    if (discountType === 'PERCENTAGE' && (valNum < 1 || valNum > 100)) {
      setError('Percentage discount must be between 1 and 100');
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setError('Please provide valid start and end dates');
      return;
    }

    if (end <= start) {
      setError('End date must be later than start date');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CreateCouponInput = {
        code: code.trim().toUpperCase(),
        description: description.trim() || null,
        discountType,
        discountValue:
          discountType === 'PERCENTAGE' ? Math.round(valNum) : Math.round(valNum * 100),
        minOrderAmount: minOrderTaka ? Math.round(Number(minOrderTaka) * 100) : null,
        maxDiscountAmount:
          discountType === 'PERCENTAGE' && maxDiscountTaka
            ? Math.round(Number(maxDiscountTaka) * 100)
            : null,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        usageLimit: usageLimit ? Number(usageLimit) : null,
        perCustomerLimit: perCustomerLimit ? Number(perCustomerLimit) : null,
        isActive,
      };

      await onSubmit(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save coupon');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="coupon-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-xl bg-background border border-border rounded-xl shadow-2xl p-6 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 mb-5 border-b border-border pb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <TicketPercent className="h-5 w-5" />
          </div>
          <div>
            <h2 id="coupon-modal-title" className="text-lg font-semibold text-foreground">
              {isEditing ? t('modalEditTitle') : t('modalCreateTitle')}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('description')}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Code & Description */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="coupon-code">{t('codeLabel')} *</Label>
              <Input
                id="coupon-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t('codePlaceholder')}
                required
                className="font-mono uppercase font-bold"
              />
            </div>
            <div>
              <Label htmlFor="coupon-desc">{t('descriptionLabel')}</Label>
              <Input
                id="coupon-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('descriptionPlaceholder')}
              />
            </div>
          </div>

          {/* Discount Type & Value */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="coupon-type">{t('typeLabel')} *</Label>
              <select
                id="coupon-type"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as 'PERCENTAGE' | 'FIXED_AMOUNT')}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="PERCENTAGE">{t('percentage')} (%)</option>
                <option value="FIXED_AMOUNT">{t('fixedAmount')} (৳)</option>
              </select>
            </div>
            <div>
              <Label htmlFor="coupon-value">
                {t('valueLabel')} * ({discountType === 'PERCENTAGE' ? '%' : '৳'})
              </Label>
              <Input
                id="coupon-value"
                type="number"
                min="1"
                max={discountType === 'PERCENTAGE' ? '100' : undefined}
                step={discountType === 'PERCENTAGE' ? '1' : '0.01'}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                required
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {discountType === 'PERCENTAGE' ? t('percentageHelp') : t('fixedHelp')}
              </p>
            </div>
          </div>

          {/* Minimum Order & Max Discount */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="coupon-min-order">{t('minOrderLabel')}</Label>
              <Input
                id="coupon-min-order"
                type="number"
                min="0"
                step="1"
                value={minOrderTaka}
                onChange={(e) => setMinOrderTaka(e.target.value)}
                placeholder={t('minOrderPlaceholder')}
              />
            </div>
            {discountType === 'PERCENTAGE' ? (
              <div>
                <Label htmlFor="coupon-max-discount">{t('maxDiscountLabel')}</Label>
                <Input
                  id="coupon-max-discount"
                  type="number"
                  min="1"
                  step="1"
                  value={maxDiscountTaka}
                  onChange={(e) => setMaxDiscountTaka(e.target.value)}
                  placeholder={t('maxDiscountPlaceholder')}
                />
              </div>
            ) : (
              <div />
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="coupon-start">{t('startDateLabel')} *</Label>
              <Input
                id="coupon-start"
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="coupon-end">{t('endDateLabel')} *</Label>
              <Input
                id="coupon-end"
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Limits */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="coupon-usage-limit">{t('usageLimitLabel')}</Label>
              <Input
                id="coupon-usage-limit"
                type="number"
                min="1"
                step="1"
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
                placeholder={t('usageLimitPlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="coupon-cust-limit">{t('perCustomerLimitLabel')}</Label>
              <Input
                id="coupon-cust-limit"
                type="number"
                min="1"
                step="1"
                value={perCustomerLimit}
                onChange={(e) => setPerCustomerLimit(e.target.value)}
              />
            </div>
          </div>

          {/* Active status */}
          <div className="flex items-center gap-2 pt-1">
            <input
              id="coupon-active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded-sm border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="coupon-active" className="cursor-pointer text-sm font-normal">
              {t('isActiveLabel')}
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border mt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('saving')}
                </>
              ) : (
                t('saveButton')
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
