'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { getOrderConfirmationApi, ApiError } from '@/lib/api-client';
import type { ConfirmedOrderDetails } from '@/lib/order-types';
import { formatPoishaToBDT } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  Copy,
  Check,
  PackageCheck,
  MapPin,
  Phone,
  Banknote,
  Calendar,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShoppingBag,
} from 'lucide-react';

interface OrderConfirmationViewProps {
  orderNumber: string;
}

export function OrderConfirmationView({ orderNumber }: OrderConfirmationViewProps) {
  const t = useTranslations('confirmation');
  const [order, setOrder] = useState<ConfirmedOrderDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    let ignore = false;

    getOrderConfirmationApi(orderNumber)
      .then((res) => {
        if (!ignore) {
          setOrder(res.order);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err instanceof ApiError ? err.message : t('orderNotFound'));
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [orderNumber, t]);

  const handleCopyOrderNumber = () => {
    if (!order) return;
    navigator.clipboard.writeText(order.orderNumber);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
        <Loader2 className="size-10 animate-spin text-primary" />
        <p className="text-sm font-semibold text-muted-foreground">{t('loadingOrder')}</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-5">
        <div className="size-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <AlertCircle className="size-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-foreground">{t('orderNotFound')}</h1>
          <p className="text-xs text-muted-foreground">
            {error || 'Unable to retrieve order details.'}
          </p>
        </div>
        <Link href="/">
          <Button className="mt-2 text-xs font-bold px-6">{t('returnHome')}</Button>
        </Link>
      </div>
    );
  }

  const formattedDate = new Date(order.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="max-w-4xl mx-auto py-8 md:py-12 px-4 space-y-8 animate-in fade-in-50 duration-300">
      {/* Celebration Header */}
      <div className="text-center space-y-3">
        <div className="size-16 md:size-20 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto ring-8 ring-emerald-500/5">
          <CheckCircle2 className="size-10 md:size-12" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-black text-foreground">{t('pageTitle')}</h1>
          <p className="text-xs md:text-sm text-muted-foreground max-w-md mx-auto">
            {t('pageSubtitle')}
          </p>
        </div>
      </div>

      {/* Primary Order Meta Bar */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {t('orderNumberLabel')}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-base md:text-lg font-black font-mono text-foreground">
              {order.orderNumber}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyOrderNumber}
              className="h-7 px-2 text-[11px] gap-1 font-semibold"
            >
              {isCopied ? (
                <>
                  <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
                  <span>{t('orderNumberCopied')}</span>
                </>
              ) : (
                <>
                  <Copy className="size-3 text-muted-foreground" />
                  <span>{t('copyOrderNumber')}</span>
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              {t('orderDateLabel')}
            </span>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Calendar className="size-3.5 text-muted-foreground" />
              <span>{formattedDate}</span>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              {t('orderStatusLabel')}
            </span>
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold text-xs">
              {t('statusConfirmed')}
            </Badge>
          </div>
        </div>
      </div>

      {/* Cash on Delivery Guidance Banner */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 md:p-5 flex items-start gap-3.5 text-amber-900 dark:text-amber-200">
        <div className="p-2 rounded-lg bg-amber-500/20 shrink-0 text-amber-700 dark:text-amber-300">
          <Banknote className="size-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-amber-900 dark:text-amber-100">
            {t('codNoticeTitle')}
          </h3>
          <p className="text-xs text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
            {t('codNoticeDescription', { amount: formatPoishaToBDT(order.totalPayable) })}
          </p>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left: Delivery Details & Items List */}
        <div className="md:col-span-7 space-y-6">
          {/* Delivery Details */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-3.5">
            <div className="flex items-center gap-2 pb-2.5 border-b border-border">
              <MapPin className="size-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">{t('deliveryDetailsTitle')}</h2>
            </div>

            <div className="text-xs space-y-2 text-muted-foreground">
              <div>
                <span className="font-semibold text-foreground">
                  {order.shippingAddress.recipientName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="size-3 text-muted-foreground" />
                <span>{order.shippingAddress.phone}</span>
                {order.shippingAddress.alternativePhone && (
                  <span className="text-[11px] text-muted-foreground/80">
                    ({order.shippingAddress.alternativePhone})
                  </span>
                )}
              </div>
              <div>
                <span>{order.shippingAddress.streetAddress}</span>
                <div>
                  {order.shippingAddress.upazila}, {order.shippingAddress.districtId},{' '}
                  {order.shippingAddress.divisionId}
                </div>
              </div>
              {order.shippingAddress.deliveryNotes && (
                <div className="pt-2 border-t border-border mt-2">
                  <span className="font-semibold text-foreground block">{t('notesLabel')}:</span>
                  <p className="italic mt-0.5">{order.shippingAddress.deliveryNotes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Ordered Items */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <PackageCheck className="size-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">{t('orderedItemsTitle')}</h2>
              </div>
              <span className="text-xs text-muted-foreground font-semibold">
                {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            <div className="divide-y divide-border">
              {order.items.map((item) => (
                <div key={item.id} className="py-3.5 first:pt-0 last:pb-0 flex items-start gap-3">
                  <div className="size-14 rounded-lg bg-muted border border-border shrink-0 overflow-hidden relative flex items-center justify-center">
                    {item.thumbnailUrl ? (
                      <Image
                        src={item.thumbnailUrl}
                        alt={item.productName}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : (
                      <ShoppingBag className="size-6 text-muted-foreground/40" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-0.5">
                    <h3 className="text-xs font-bold text-foreground line-clamp-1">
                      {item.productName}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {item.variantTitle} &bull; <span className="font-mono">{item.sku}</span>
                    </p>
                    <div className="text-[11px] text-muted-foreground pt-0.5">
                      {formatPoishaToBDT(item.unitPrice)} &times; {item.quantity}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-foreground">
                      {formatPoishaToBDT(item.lineTotal)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Payment & Financial Summary */}
        <div className="md:col-span-5 space-y-6">
          <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-4 sticky top-24">
            {/* Payment Method Badge */}
            <div className="space-y-2 pb-3 border-b border-border">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                {t('paymentMethodLabel')}
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Banknote className="size-4 text-primary" />
                  <span>Cash on Delivery (COD)</span>
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 font-bold"
                >
                  {t('paymentStatusPending')}
                </Badge>
              </div>
            </div>

            {/* Financial Breakdown */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>{t('subtotalLabel')}</span>
                <span className="font-semibold text-foreground">
                  {formatPoishaToBDT(order.merchandiseSubtotal)}
                </span>
              </div>

              {order.coupon && order.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>
                    {t('discountLabel')} ({order.coupon.code})
                  </span>
                  <span className="font-semibold">-{formatPoishaToBDT(order.discountAmount)}</span>
                </div>
              )}

              <div className="flex justify-between text-muted-foreground">
                <span>{t('shippingFeeLabel')}</span>
                <span className="font-semibold text-foreground">
                  {order.shippingFee === 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase text-[11px]">
                      FREE
                    </span>
                  ) : (
                    formatPoishaToBDT(order.shippingFee)
                  )}
                </span>
              </div>

              <div className="pt-3 border-t border-border flex justify-between items-baseline">
                <div>
                  <span className="text-sm font-bold text-foreground">
                    {t('totalPayableLabel')}
                  </span>
                </div>
                <span className="text-base font-black text-primary">
                  {formatPoishaToBDT(order.totalPayable)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2">
              <Link href="/" className="block">
                <Button className="w-full text-xs font-bold h-10 gap-1.5">
                  <span>{t('continueShopping')}</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
