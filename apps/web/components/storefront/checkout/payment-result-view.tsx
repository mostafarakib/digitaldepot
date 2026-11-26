'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { getOrderConfirmationApi } from '@/lib/api-client';
import type { PaymentResultStatus } from '@/lib/order-types';
import {
  resolveAuthoritativePaymentStatus,
  resolveFallbackWithoutOrder,
} from '@/lib/payment-result';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Copy,
  Check,
  RotateCcw,
  ShoppingBag,
  HelpCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface PaymentResultViewProps {
  orderNumber?: string;
  /**
   * Non-authoritative fallback hint used ONLY when no orderNumber is present.
   * Never grants SUCCESS state without authoritative backend confirmation.
   */
  fallbackHint?: string;
}

const MAX_PENDING_POLLS = 5;
const PENDING_POLL_INTERVAL_MS = 3000;

export function PaymentResultView({ orderNumber = '', fallbackHint }: PaymentResultViewProps) {
  const t = useTranslations('paymentResult');
  const tConf = useTranslations('confirmation');

  const trimmedOrderNumber = orderNumber.trim();
  const [resolvedStatus, setResolvedStatus] = useState<PaymentResultStatus>(() =>
    trimmedOrderNumber ? 'LOADING' : resolveFallbackWithoutOrder(fallbackHint),
  );
  const [lookupFailed, setLookupFailed] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const fetchAuthoritativeStatus = useCallback(async () => {
    if (!trimmedOrderNumber) {
      setResolvedStatus(resolveFallbackWithoutOrder(fallbackHint));
      return;
    }

    setIsRefreshing(true);
    try {
      const res = await getOrderConfirmationApi(trimmedOrderNumber);
      setLookupFailed(false);
      setResolvedStatus(resolveAuthoritativePaymentStatus(res.order));
    } catch {
      setLookupFailed(true);
      setResolvedStatus('FAILED');
    } finally {
      setIsRefreshing(false);
    }
  }, [trimmedOrderNumber, fallbackHint]);

  useEffect(() => {
    if (!trimmedOrderNumber) return;

    let isActive = true;
    getOrderConfirmationApi(trimmedOrderNumber)
      .then((res) => {
        if (!isActive) return;
        setLookupFailed(false);
        setResolvedStatus(resolveAuthoritativePaymentStatus(res.order));
      })
      .catch(() => {
        if (!isActive) return;
        setLookupFailed(true);
        setResolvedStatus('FAILED');
      });

    return () => {
      isActive = false;
    };
  }, [trimmedOrderNumber]);

  useEffect(() => {
    if (!trimmedOrderNumber || resolvedStatus !== 'PENDING' || pollCount >= MAX_PENDING_POLLS) {
      return;
    }

    let isActive = true;
    const timer = setTimeout(() => {
      getOrderConfirmationApi(trimmedOrderNumber)
        .then((res) => {
          if (!isActive) return;
          setLookupFailed(false);
          setResolvedStatus(resolveAuthoritativePaymentStatus(res.order));
          setPollCount((c) => c + 1);
        })
        .catch(() => {
          if (!isActive) return;
          setLookupFailed(true);
          setResolvedStatus('FAILED');
        });
    }, PENDING_POLL_INTERVAL_MS);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [trimmedOrderNumber, resolvedStatus, pollCount]);

  const handleCopy = () => {
    if (!trimmedOrderNumber) return;
    navigator.clipboard.writeText(trimmedOrderNumber);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto py-10 md:py-16 px-4">
      <div className="bg-card border border-border rounded-2xl p-6 md:p-10 shadow-sm text-center space-y-6">
        {/* Status Icon */}
        {resolvedStatus === 'LOADING' && (
          <div className="size-20 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
            <Loader2 className="size-10 animate-spin" />
          </div>
        )}

        {resolvedStatus === 'SUCCESS' && (
          <div className="size-20 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
            <CheckCircle2 className="size-10" />
          </div>
        )}

        {(resolvedStatus === 'LATE_PAYMENT' || resolvedStatus === 'PENDING') && (
          <div className="size-20 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
            <Clock className="size-10" />
          </div>
        )}

        {resolvedStatus === 'CANCELLED' && (
          <div className="size-20 rounded-2xl bg-muted text-muted-foreground mx-auto flex items-center justify-center">
            <XCircle className="size-10" />
          </div>
        )}

        {resolvedStatus === 'FAILED' && (
          <div className="size-20 rounded-2xl bg-destructive/10 text-destructive mx-auto flex items-center justify-center">
            <XCircle className="size-10" />
          </div>
        )}

        {/* Title & Description */}
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-black text-foreground">
            {resolvedStatus === 'LOADING' && t('paymentVerifyingTitle')}
            {resolvedStatus === 'SUCCESS' && t('paymentSuccessTitle')}
            {resolvedStatus === 'LATE_PAYMENT' && t('paymentLateTitle')}
            {resolvedStatus === 'PENDING' && t('paymentPendingTitle')}
            {resolvedStatus === 'CANCELLED' && t('paymentCancelledTitle')}
            {resolvedStatus === 'FAILED' && t('paymentFailedTitle')}
          </h1>

          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            {resolvedStatus === 'LOADING' && t('paymentVerifyingSubtitle')}
            {resolvedStatus === 'SUCCESS' && t('paymentSuccessSubtitle')}
            {resolvedStatus === 'LATE_PAYMENT' && t('paymentLateSubtitle')}
            {resolvedStatus === 'PENDING' && t('paymentPendingSubtitle')}
            {resolvedStatus === 'CANCELLED' && t('paymentCancelledSubtitle')}
            {resolvedStatus === 'FAILED' &&
              (lookupFailed ? t('paymentOrderNotFoundSubtitle') : t('paymentFailedSubtitle'))}
          </p>
        </div>

        {/* Order Reference Box */}
        {trimmedOrderNumber && !lookupFailed && (
          <div className="p-4 rounded-xl bg-muted/30 border border-border inline-flex items-center gap-3 mx-auto">
            <div className="text-left">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">
                {t('orderNumber')}
              </p>
              <p className="text-sm font-mono font-bold text-foreground">{trimmedOrderNumber}</p>
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

        {/* Action Buttons */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          {resolvedStatus === 'SUCCESS' && trimmedOrderNumber && (
            <>
              <Button asChild size="lg" className="w-full sm:w-auto h-11 text-sm font-bold gap-2">
                <Link href={`/checkout/confirmation/${encodeURIComponent(trimmedOrderNumber)}`}>
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

          {resolvedStatus === 'LATE_PAYMENT' && (
            <>
              {trimmedOrderNumber && (
                <Button asChild size="lg" className="w-full sm:w-auto h-11 text-sm font-bold gap-2">
                  <Link href={`/checkout/confirmation/${encodeURIComponent(trimmedOrderNumber)}`}>
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

          {resolvedStatus === 'PENDING' && (
            <>
              {trimmedOrderNumber && (
                <Button
                  type="button"
                  size="lg"
                  disabled={isRefreshing}
                  onClick={() => void fetchAuthoritativeStatus()}
                  className="w-full sm:w-auto h-11 text-sm font-bold gap-2"
                >
                  <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>{t('refreshStatus')}</span>
                </Button>
              )}
              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full sm:w-auto h-11 text-sm font-semibold"
              >
                <Link href={trimmedOrderNumber ? '/account/orders' : '/checkout'}>
                  {trimmedOrderNumber ? t('viewOrderConfirmation') : t('tryAgain')}
                </Link>
              </Button>
            </>
          )}

          {(resolvedStatus === 'CANCELLED' || resolvedStatus === 'FAILED') && (
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
