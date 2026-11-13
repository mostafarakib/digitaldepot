'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowRight,
  Copy,
  Check,
  RotateCcw,
  ShoppingBag,
  HelpCircle,
} from 'lucide-react';
import type { PaymentResultStatus } from '@/lib/order-types';

interface PaymentResultViewProps {
  orderNumber?: string;
  status?: string;
  reason?: string;
}

export function PaymentResultView({
  orderNumber = '',
  status = 'FAILED',
  reason,
}: PaymentResultViewProps) {
  const t = useTranslations('paymentResult');
  const tConf = useTranslations('confirmation');
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    if (!orderNumber) return;
    navigator.clipboard.writeText(orderNumber);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const normalizedStatus = (status.toUpperCase() as PaymentResultStatus) || 'FAILED';

  return (
    <div className="max-w-2xl mx-auto py-10 md:py-16 px-4">
      <div className="bg-card border border-border rounded-2xl p-6 md:p-10 shadow-sm text-center space-y-6">
        {/* Status Icon */}
        {normalizedStatus === 'SUCCESS' && (
          <div className="size-20 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
            <CheckCircle2 className="size-10" />
          </div>
        )}

        {normalizedStatus === 'LATE_PAYMENT' && (
          <div className="size-20 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
            <Clock className="size-10" />
          </div>
        )}

        {normalizedStatus === 'CANCELLED' && (
          <div className="size-20 rounded-2xl bg-muted text-muted-foreground mx-auto flex items-center justify-center">
            <XCircle className="size-10" />
          </div>
        )}

        {normalizedStatus === 'FAILED' && (
          <div className="size-20 rounded-2xl bg-destructive/10 text-destructive mx-auto flex items-center justify-center">
            <XCircle className="size-10" />
          </div>
        )}

        {/* Title & Description */}
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-black text-foreground">
            {normalizedStatus === 'SUCCESS' && t('paymentSuccessTitle')}
            {normalizedStatus === 'LATE_PAYMENT' && t('paymentLateTitle')}
            {normalizedStatus === 'CANCELLED' && t('paymentCancelledTitle')}
            {normalizedStatus === 'FAILED' && t('paymentFailedTitle')}
          </h1>

          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            {normalizedStatus === 'SUCCESS' && t('paymentSuccessSubtitle')}
            {normalizedStatus === 'LATE_PAYMENT' && t('paymentLateSubtitle')}
            {normalizedStatus === 'CANCELLED' && t('paymentCancelledSubtitle')}
            {normalizedStatus === 'FAILED' && t('paymentFailedSubtitle')}
          </p>
        </div>

        {/* Order Reference Box */}
        {orderNumber && (
          <div className="p-4 rounded-xl bg-muted/30 border border-border inline-flex items-center gap-3 mx-auto">
            <div className="text-left">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">
                {t('orderNumber')}
              </p>
              <p className="text-sm font-mono font-bold text-foreground">{orderNumber}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-8 px-2 text-xs gap-1"
            >
              {isCopied ? (
                <>
                  <Check className="size-3.5 text-emerald-600" />
                  <span>{tConf('orderNumberCopied')}</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  <span>{tConf('copyOrderNumber')}</span>
                </>
              )}
            </Button>
          </div>
        )}

        {/* Specific Reason / Error Banner */}
        {reason && (
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground max-w-md mx-auto">
            <span className="font-semibold">{reason}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          {normalizedStatus === 'SUCCESS' && (
            <>
              <Button asChild size="lg" className="w-full sm:w-auto h-11 text-sm font-bold gap-2">
                <Link href={`/checkout/confirmation/${encodeURIComponent(orderNumber)}`}>
                  <span>{t('viewOrderConfirmation')}</span>
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full sm:w-auto h-11 text-sm font-semibold"
              >
                <Link href="/products">{t('continueShopping')}</Link>
              </Button>
            </>
          )}

          {normalizedStatus === 'LATE_PAYMENT' && (
            <>
              {orderNumber && (
                <Button asChild size="lg" className="w-full sm:w-auto h-11 text-sm font-bold gap-2">
                  <Link href={`/checkout/confirmation/${encodeURIComponent(orderNumber)}`}>
                    <span>{t('viewOrderConfirmation')}</span>
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              )}
              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full sm:w-auto h-11 text-sm font-semibold"
              >
                <Link href="/products">{t('continueShopping')}</Link>
              </Button>
            </>
          )}

          {(normalizedStatus === 'CANCELLED' || normalizedStatus === 'FAILED') && (
            <>
              <Button asChild size="lg" className="w-full sm:w-auto h-11 text-sm font-bold gap-2">
                <Link href="/checkout">
                  <RotateCcw className="size-4" />
                  <span>{t('tryAgain')}</span>
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full sm:w-auto h-11 text-sm font-semibold gap-2"
              >
                <Link href="/cart">
                  <ShoppingBag className="size-4" />
                  <span>{t('returnToCart')}</span>
                </Link>
              </Button>
            </>
          )}
        </div>

        {/* Support Help Footer */}
        <div className="pt-6 border-t border-border flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <HelpCircle className="size-3.5" />
          <span>{t('supportNotice')}</span>
        </div>
      </div>
    </div>
  );
}
