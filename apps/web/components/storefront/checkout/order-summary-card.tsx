'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  CheckoutValidationResult,
  AppliedCouponSummary,
  SelectedAddressSummary,
} from '@/lib/checkout-types';
import { formatPoishaToBDT } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ShieldCheck,
  Truck,
  RotateCcw,
  Tag,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface OrderSummaryCardProps {
  summary: CheckoutValidationResult['summary'];
  coupon: AppliedCouponSummary | null;
  couponNotice: string | null;
  selectedAddress: SelectedAddressSummary | null;
  canProceed: boolean;
  hasPriceChanges: boolean;
  isPriceAcknowledged: boolean;
  isEmailVerified: boolean;
  isValidating: boolean;
  onPlaceOrderClick: () => void;
  onApplyCoupon: (code: string) => Promise<void>;
  onRemoveCoupon: () => Promise<void>;
}

export function OrderSummaryCard({
  summary,
  coupon,
  couponNotice,
  selectedAddress,
  canProceed,
  hasPriceChanges,
  isPriceAcknowledged,
  isEmailVerified,
  isValidating,
  onPlaceOrderClick,
  onApplyCoupon,
  onRemoveCoupon,
}: OrderSummaryCardProps) {
  const t = useTranslations('checkout');
  const tCart = useTranslations('cart');

  const [promoCode, setPromoCode] = useState('');
  const [isSubmittingCoupon, setIsSubmittingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoCode.trim()) return;
    setIsSubmittingCoupon(true);
    setCouponError(null);
    try {
      await onApplyCoupon(promoCode.trim());
      setPromoCode('');
    } catch (err) {
      setCouponError(err instanceof Error ? err.message : 'Failed to apply coupon');
    } finally {
      setIsSubmittingCoupon(false);
    }
  };

  const handleRemoveCoupon = async () => {
    setIsSubmittingCoupon(true);
    setCouponError(null);
    try {
      await onRemoveCoupon();
    } catch (err) {
      setCouponError(err instanceof Error ? err.message : 'Failed to remove coupon');
    } finally {
      setIsSubmittingCoupon(false);
    }
  };

  // Blockers check
  const hasAddress = Boolean(selectedAddress);
  const isPriceAcknowledgedValid = !hasPriceChanges || isPriceAcknowledged;
  const isReady = canProceed && hasAddress && isPriceAcknowledgedValid && isEmailVerified;

  return (
    <div className="bg-card border border-border rounded-xl p-5 md:p-6 shadow-xs space-y-5 sticky top-24">
      <h2 className="text-base font-bold text-foreground pb-3 border-b border-border">
        {t('orderSummaryTitle')}
      </h2>

      {/* Free Shipping Progress Indicator */}
      {summary.merchandiseSubtotal > 0 && (
        <div className="p-3 rounded-lg bg-muted/40 border border-border text-xs space-y-1.5">
          <div className="flex items-center justify-between font-semibold">
            <span className="flex items-center gap-1.5 text-foreground">
              <Truck className="size-3.5 text-primary" />
              <span>{t('shippingLabel')}</span>
            </span>
            {summary.isFreeShipping ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase text-[11px]">
                {t('freeShippingEligible')}
              </span>
            ) : (
              <span className="text-muted-foreground text-[11px]">
                {t('freeShippingRemainingNotice', {
                  amount: formatPoishaToBDT(summary.freeShippingRemaining),
                })}
              </span>
            )}
          </div>

          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                summary.isFreeShipping ? 'bg-emerald-500' : 'bg-primary'
              }`}
              style={{
                width: `${Math.min(
                  100,
                  (summary.merchandiseSubtotal / summary.freeShippingThreshold) * 100,
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Coupon Application Form */}
      <div>
        {coupon ? (
          <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs">
            <div className="flex items-center gap-2">
              <Tag className="size-4 text-emerald-600 dark:text-emerald-400" />
              <div>
                <span className="font-bold text-foreground font-mono">{coupon.code}</span>
                <p className="text-[11px] text-muted-foreground">
                  {t('couponSavings', { amount: formatPoishaToBDT(coupon.discountAmount) })}
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemoveCoupon}
              disabled={isSubmittingCoupon}
              className="text-destructive hover:text-destructive text-xs h-7 px-2"
            >
              {isSubmittingCoupon ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                tCart('removeCoupon')
              )}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleApplyCoupon} className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder={tCart('promoCodePlaceholder')}
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                disabled={isSubmittingCoupon}
                className="text-xs h-9 font-mono"
              />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={isSubmittingCoupon || !promoCode.trim()}
                className="h-9 px-3 text-xs font-semibold shrink-0"
              >
                {isSubmittingCoupon ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  tCart('applyCoupon')
                )}
              </Button>
            </div>

            {couponError && (
              <p className="text-[11px] text-destructive font-medium">{couponError}</p>
            )}
            {couponNotice && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                {couponNotice}
              </p>
            )}
          </form>
        )}
      </div>

      {/* Monetary Summary */}
      <div className="space-y-2.5 text-xs border-t border-border pt-4">
        <div className="flex justify-between text-muted-foreground">
          <span>{t('merchandiseSubtotal')}</span>
          <span className="font-semibold text-foreground">
            {formatPoishaToBDT(summary.merchandiseSubtotal)}
          </span>
        </div>

        {summary.discount > 0 && (
          <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="flex items-center gap-1">
              <Tag className="size-3" />
              <span>{t('discount')}</span>
            </span>
            <span>-{formatPoishaToBDT(summary.discount)}</span>
          </div>
        )}

        <div className="flex justify-between text-muted-foreground">
          <span className="flex items-center gap-1">
            <span>{t('deliveryFee')}</span>
            {selectedAddress && (
              <span className="text-[10px] text-muted-foreground">
                ({selectedAddress.districtId === 'DHAKA' ? t('insideDhaka') : t('outsideDhaka')})
              </span>
            )}
          </span>
          <span className="font-semibold text-foreground">
            {!hasAddress ? (
              <span className="text-muted-foreground italic">{t('selectAddressForShipping')}</span>
            ) : summary.shippingFee === 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400 uppercase font-bold text-[11px]">
                {t('free')}
              </span>
            ) : (
              formatPoishaToBDT(summary.shippingFee)
            )}
          </span>
        </div>

        <div className="border-t border-border pt-3 flex justify-between items-baseline">
          <div>
            <span className="text-sm font-bold text-foreground">{t('totalPayable')}</span>
            <p className="text-[10px] text-muted-foreground mt-0.5">{t('allTaxesIncluded')}</p>
          </div>
          <span className="text-lg font-black text-primary">
            {formatPoishaToBDT(summary.finalTotal)}
          </span>
        </div>
      </div>

      {/* Blockers Feedback */}
      {!isReady && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-destructive space-y-1 text-xs">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertCircle className="size-3.5 shrink-0" />
            <span>{t('checkoutBlockedTitle')}</span>
          </div>
          <ul className="list-disc list-inside text-[11px] space-y-0.5 text-destructive/90">
            {!isEmailVerified && <li>{t('blockerEmailUnverified')}</li>}
            {!hasAddress && <li>{t('blockerAddressRequired')}</li>}
            {hasPriceChanges && !isPriceAcknowledged && (
              <li>{t('blockerPriceAcknowledgementRequired')}</li>
            )}
            {!canProceed && <li>{t('blockerItemsUnavailable')}</li>}
          </ul>
        </div>
      )}

      {/* Place Order CTA Button */}
      <Button
        type="button"
        size="lg"
        onClick={onPlaceOrderClick}
        disabled={!isReady || isValidating}
        className="w-full h-11 text-sm font-bold gap-2 shadow-sm"
      >
        {isValidating ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            <span>{t('validatingCheckout')}</span>
          </>
        ) : (
          <>
            <span>{t('placeOrderButton')}</span>
            <ArrowRight className="size-4" />
          </>
        )}
      </Button>

      {/* Trust Badges */}
      <div className="pt-2 border-t border-border grid grid-cols-3 gap-2 text-center text-[10px] text-muted-foreground">
        <div className="flex flex-col items-center gap-1">
          <ShieldCheck className="size-4 text-primary/80" />
          <span>{tCart('secureCheckoutBadge')}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Truck className="size-4 text-primary/80" />
          <span>{tCart('fastDeliveryBadge')}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <RotateCcw className="size-4 text-primary/80" />
          <span>{tCart('easyReturnsBadge')}</span>
        </div>
      </div>
    </div>
  );
}
