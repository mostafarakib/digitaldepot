'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Banknote,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Circle,
  Clock,
  Smartphone,
} from 'lucide-react';
import type { PaymentMethod } from '@/lib/order-types';

interface PaymentMethodSelectorProps {
  selectedMethod: PaymentMethod;
  onSelectMethod: (method: PaymentMethod) => void;
  deliveryNotes: string;
  onDeliveryNotesChange: (notes: string) => void;
  alternativePhone: string;
  onAlternativePhoneChange: (phone: string) => void;
  disabled?: boolean;
}

export function PaymentMethodSelector({
  selectedMethod,
  onSelectMethod,
  deliveryNotes,
  onDeliveryNotesChange,
  alternativePhone,
  onAlternativePhoneChange,
  disabled = false,
}: PaymentMethodSelectorProps) {
  const t = useTranslations('checkout');

  return (
    <div className="bg-card border border-border rounded-xl p-5 md:p-6 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Banknote className="size-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-foreground">{t('paymentMethodTitle')}</h2>
          <p className="text-xs text-muted-foreground">{t('paymentMethodSubtitle')}</p>
        </div>
      </div>

      {/* Payment Options Grid */}
      <div className="space-y-3">
        {/* Cash on Delivery (COD) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => !disabled && onSelectMethod('COD')}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
              onSelectMethod('COD');
            }
          }}
          className={`relative flex items-start gap-3.5 p-4 rounded-xl cursor-pointer transition-all ${
            selectedMethod === 'COD'
              ? 'border-2 border-primary bg-primary/5 shadow-xs'
              : 'border border-border bg-card hover:bg-muted/30'
          }`}
        >
          <div className="mt-0.5 text-primary">
            {selectedMethod === 'COD' ? (
              <CheckCircle2 className="size-5 fill-primary text-primary-foreground" />
            ) : (
              <Circle className="size-5 text-muted-foreground/60" />
            )}
          </div>

          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-foreground">{t('codTitle')}</span>
              <Badge
                variant="outline"
                className="text-[10px] bg-primary/10 text-primary border-primary/20 font-semibold py-0"
              >
                Default
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{t('codDescription')}</p>
          </div>
        </div>

        {/* Online Payment (SSLCommerz) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => !disabled && onSelectMethod('SSLCOMMERZ')}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
              onSelectMethod('SSLCOMMERZ');
            }
          }}
          className={`relative flex items-start gap-3.5 p-4 rounded-xl cursor-pointer transition-all ${
            selectedMethod === 'SSLCOMMERZ'
              ? 'border-2 border-primary bg-primary/5 shadow-xs'
              : 'border border-border bg-card hover:bg-muted/30'
          }`}
        >
          <div className="mt-0.5 text-primary">
            {selectedMethod === 'SSLCOMMERZ' ? (
              <CheckCircle2 className="size-5 fill-primary text-primary-foreground" />
            ) : (
              <Circle className="size-5 text-muted-foreground/60" />
            )}
          </div>

          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-foreground">{t('onlinePaymentTitle')}</span>
              <Badge variant="secondary" className="text-[10px] font-semibold py-0">
                SSLCommerz
              </Badge>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <CreditCard className="size-3.5" />
                <span>Cards</span>
                <span>•</span>
                <Smartphone className="size-3.5" />
                <span>bKash / Nagad</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('onlinePaymentDescription')}
            </p>

            {selectedMethod === 'SSLCOMMERZ' && (
              <div className="mt-2.5 flex items-center gap-1.5 p-2.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-medium">
                <Clock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>{t('onlinePaymentReservationNotice')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Additional Instructions & Alternative Phone */}
      <div className="pt-2 border-t border-border grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Alternative Phone */}
        <div className="space-y-1.5">
          <Label htmlFor="alternativePhone" className="text-xs font-semibold text-foreground">
            {t('alternativePhoneLabel')}
          </Label>
          <Input
            id="alternativePhone"
            type="tel"
            placeholder={t('alternativePhonePlaceholder')}
            value={alternativePhone}
            onChange={(e) => onAlternativePhoneChange(e.target.value)}
            disabled={disabled}
            className="h-9 text-xs"
          />
        </div>

        {/* Delivery Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="deliveryNotes" className="text-xs font-semibold text-foreground">
            {t('deliveryNotesLabel')}
          </Label>
          <Input
            id="deliveryNotes"
            placeholder={t('deliveryNotesPlaceholder')}
            value={deliveryNotes}
            onChange={(e) => onDeliveryNotesChange(e.target.value)}
            disabled={disabled}
            className="h-9 text-xs"
          />
        </div>
      </div>

      {/* Trust Notice */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
        <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
        <span>
          {selectedMethod === 'COD'
            ? 'Cash on Delivery — inspect your package before paying'
            : 'SSLCommerz Sandbox — 128-bit SSL encrypted online payment'}
        </span>
      </div>
    </div>
  );
}
