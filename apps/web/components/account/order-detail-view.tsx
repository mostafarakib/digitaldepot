'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { getCustomerOrderApi, ApiError } from '@/lib/api-client';
import type { CustomerOrderDetail, OrderStatus } from '@/lib/order-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CancelOrderDialog } from './cancel-order-dialog';
import { RequestReturnDialog } from './request-return-dialog';
import { getReturnEligibilityApi } from '@/lib/api-client';
import type { CustomerReturnEligibilityResponse } from '@/lib/order-types';
import {
  Package,
  Calendar,
  CreditCard,
  MapPin,
  Clock,
  CheckCircle2,
  Truck,
  Box,
  XCircle,
  ArrowLeft,
  Tag,
  Star,
  ShieldCheck,
  AlertTriangle,
  History,
  RotateCcw,
} from 'lucide-react';

interface OrderDetailViewProps {
  orderNumber: string;
}

const ORDER_STEPS: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

export function OrderDetailView({ orderNumber }: OrderDetailViewProps) {
  const t = useTranslations('orders');
  const tReturns = useTranslations('returns');
  const router = useRouter();

  const [order, setOrder] = useState<CustomerOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [returnEligibility, setReturnEligibility] =
    useState<CustomerReturnEligibilityResponse | null>(null);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);

  const fetchOrder = useCallback(() => {
    setIsLoading(true);
    setError(null);
    getCustomerOrderApi(orderNumber)
      .then((res) => {
        setOrder(res.order);
        setIsLoading(false);
        if (res.order.status === 'DELIVERED' && res.order.paymentStatus === 'PAID') {
          getReturnEligibilityApi(orderNumber)
            .then(setReturnEligibility)
            .catch(() => {});
        }
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Failed to load order details.');
        }
        setIsLoading(false);
      });
  }, [orderNumber]);

  useEffect(() => {
    let ignore = false;

    getCustomerOrderApi(orderNumber)
      .then((res) => {
        if (!ignore) {
          setOrder(res.order);
          setIsLoading(false);
          if (res.order.status === 'DELIVERED' && res.order.paymentStatus === 'PAID') {
            getReturnEligibilityApi(orderNumber)
              .then((elig) => {
                if (!ignore) setReturnEligibility(elig);
              })
              .catch(() => {});
          }
        }
      })
      .catch((err) => {
        if (!ignore) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError('Failed to load order details.');
          }
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [orderNumber]);

  const formatPrice = (poysha: number) => {
    return `৳${(poysha / 100).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <Badge
            variant="outline"
            className="border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-500/10 gap-1 text-xs"
          >
            <Clock className="size-3.5" />
            <span>{t('status.PENDING')}</span>
          </Badge>
        );
      case 'CONFIRMED':
        return (
          <Badge
            variant="outline"
            className="border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-500/10 gap-1 text-xs"
          >
            <CheckCircle2 className="size-3.5" />
            <span>{t('status.CONFIRMED')}</span>
          </Badge>
        );
      case 'PROCESSING':
        return (
          <Badge
            variant="outline"
            className="border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 gap-1 text-xs"
          >
            <Box className="size-3.5" />
            <span>{t('status.PROCESSING')}</span>
          </Badge>
        );
      case 'SHIPPED':
        return (
          <Badge
            variant="outline"
            className="border-purple-500 text-purple-600 dark:text-purple-400 bg-purple-500/10 gap-1 text-xs"
          >
            <Truck className="size-3.5" />
            <span>{t('status.SHIPPED')}</span>
          </Badge>
        );
      case 'DELIVERED':
        return (
          <Badge
            variant="outline"
            className="border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 gap-1 text-xs"
          >
            <CheckCircle2 className="size-3.5" />
            <span>{t('status.DELIVERED')}</span>
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge
            variant="outline"
            className="border-destructive/60 text-destructive bg-destructive/10 gap-1 text-xs"
          >
            <XCircle className="size-3.5" />
            <span>{t('status.CANCELLED')}</span>
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 py-12">
        <div className="h-8 bg-muted rounded w-1/3 animate-pulse" />
        <div className="h-32 bg-muted rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-64 bg-muted rounded-2xl md:col-span-2 animate-pulse" />
          <div className="h-64 bg-muted rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-6 py-12">
        <Button asChild variant="outline" size="sm" className="gap-2 text-xs">
          <Link href="/account/orders">
            <ArrowLeft className="size-3.5" />
            <span>{t('backToOrders')}</span>
          </Link>
        </Button>
        <Card className="border-destructive/30 bg-destructive/5 text-center p-8">
          <CardContent className="space-y-3">
            <XCircle className="size-8 text-destructive mx-auto" />
            <p className="text-sm font-semibold text-destructive">{error || 'Order not found'}</p>
            <Button size="sm" variant="outline" onClick={fetchOrder} className="text-xs">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStepIndex = ORDER_STEPS.indexOf(order.status);
  const isCancelled = order.status === 'CANCELLED';

  return (
    <div className="space-y-6">
      {/* Top Navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Button asChild variant="outline" size="sm" className="self-start gap-1.5 text-xs">
          <Link href="/account/orders">
            <ArrowLeft className="size-3.5" />
            <span>{t('backToOrders')}</span>
          </Link>
        </Button>

        <div className="flex items-center gap-2 self-start">
          {order.canCancel && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setIsCancelModalOpen(true)}
              className="text-xs"
            >
              {t('cancelOrder')}
            </Button>
          )}

          {returnEligibility?.isEligible && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsReturnModalOpen(true)}
              className="text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/5"
            >
              <RotateCcw className="size-3.5" />
              <span>{tReturns('requestReturn')}</span>
              <span className="ml-1 text-[10px] bg-primary/10 px-1.5 py-0.5 rounded-full font-medium">
                {tReturns('returnWindowNotice', { days: returnEligibility.daysRemaining })}
              </span>
            </Button>
          )}
        </div>
      </div>

      {/* Order Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {order.orderNumber}
            </h1>
            {getStatusBadge(order.status)}
          </div>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
            <Calendar className="size-3.5" />
            <span>{t('placedOn', { date: new Date(order.createdAt).toLocaleDateString() })}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {t(`paymentMethod.${order.paymentMethod}` as any)}
          </Badge>
          <Badge
            variant={order.paymentStatus === 'PAID' ? 'default' : 'outline'}
            className="text-xs"
          >
            {t(`paymentStatus.${order.paymentStatus}` as any)}
          </Badge>
        </div>
      </div>

      {/* Progress Stepper / Cancelled Banner */}
      {isCancelled ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:p-6 space-y-1">
          <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
            <AlertTriangle className="size-4.5" />
            <span>
              {t('details.cancelledNotice', {
                date: order.cancelledAt ? new Date(order.cancelledAt).toLocaleDateString() : '',
              })}
            </span>
          </div>
          {order.cancellationReason && (
            <p className="text-xs text-muted-foreground pl-6.5">
              {t('details.cancellationReasonLabel', { reason: order.cancellationReason })}
            </p>
          )}
        </div>
      ) : (
        <Card className="p-4 sm:p-6 bg-card/60">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-6">
            {t('details.timelineTitle')}
          </h3>
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 sm:gap-2">
            {ORDER_STEPS.map((step, idx) => {
              const isPast = idx <= currentStepIndex;
              const isCurrent = idx === currentStepIndex;

              return (
                <div
                  key={step}
                  className="flex sm:flex-col items-center gap-3 sm:gap-2 flex-1 relative z-10"
                >
                  <div
                    className={`size-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      isPast
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground border border-border'
                    } ${isCurrent ? 'ring-4 ring-primary/20' : ''}`}
                  >
                    {isPast ? <CheckCircle2 className="size-4" /> : idx + 1}
                  </div>
                  <span
                    className={`text-xs ${
                      isCurrent
                        ? 'font-bold text-foreground'
                        : isPast
                          ? 'font-medium text-foreground/80'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {t(`status.${step}` as any)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Main Grid: Items and Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Items */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b border-border/60">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Package className="size-4 text-primary" />
                <span>{t('details.itemsTitle', { count: order.items.length })}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 divide-y divide-border/60">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="pt-4 first:pt-0 pb-4 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    {item.thumbnailUrl ? (
                      <Image
                        src={item.thumbnailUrl}
                        alt={item.productName}
                        width={64}
                        height={64}
                        className="size-16 rounded-xl object-cover border border-border shrink-0"
                      />
                    ) : (
                      <div className="size-16 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shrink-0 border border-border">
                        <Package className="size-6" />
                      </div>
                    )}
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-foreground leading-snug">
                        {item.productName}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {item.variantTitle} • {t('details.skuLabel', { sku: item.sku })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatPrice(item.unitPrice)} × {item.quantity}
                      </p>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2">
                    <span className="text-sm font-bold text-foreground">
                      {formatPrice(item.lineTotal)}
                    </span>

                    {/* Review Button if Delivered */}
                    {item.isReviewable && item.productSlug && (
                      <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
                        <Link href={`/products/${item.productSlug}#reviews`}>
                          <Star className="size-3 text-amber-500 fill-amber-500" />
                          <span>{t('details.writeReview')}</span>
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Delivery Address Snapshot */}
          <Card>
            <CardHeader className="pb-3 border-b border-border/60">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="size-4 text-primary" />
                <span>{t('details.deliveryAddressTitle')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-2 text-xs">
              <p className="font-semibold text-foreground text-sm">
                {order.shippingAddress.recipientName}
              </p>
              <p className="text-muted-foreground">{order.shippingAddress.phone}</p>
              {order.shippingAddress.alternativePhone && (
                <p className="text-muted-foreground">
                  Alt: {order.shippingAddress.alternativePhone}
                </p>
              )}
              <p className="text-foreground/90 mt-1">
                {order.shippingAddress.streetAddress}, {order.shippingAddress.upazila},{' '}
                {order.shippingAddress.districtId.toUpperCase()}
              </p>
              {order.shippingAddress.deliveryNotes && (
                <div className="mt-2 rounded-lg bg-muted/40 p-2.5 text-muted-foreground italic border border-border/50">
                  Notes: &quot;{order.shippingAddress.deliveryNotes}&quot;
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Financial Breakdown & Payment Info */}
        <div className="space-y-6">
          {/* Financial Breakdown */}
          <Card>
            <CardHeader className="pb-3 border-b border-border/60">
              <CardTitle className="text-sm font-semibold">
                {t('details.financialSummaryTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-3 text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{t('details.subtotal')}</span>
                <span>{formatPrice(order.merchandiseSubtotal)}</span>
              </div>

              {order.coupon && (
                <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                  <span className="flex items-center gap-1">
                    <Tag className="size-3" />
                    <span>{t('details.discount', { code: order.coupon.code })}</span>
                  </span>
                  <span>-{formatPrice(order.discountAmount)}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-muted-foreground">
                <span>{t('details.shippingFee')}</span>
                <span>{formatPrice(order.shippingFee)}</span>
              </div>

              <div className="border-t border-border/80 pt-3 flex items-center justify-between font-bold text-sm text-foreground">
                <span>{t('details.totalPayable')}</span>
                <span>{formatPrice(order.totalPayable)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Payment Info */}
          <Card>
            <CardHeader className="pb-3 border-b border-border/60">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CreditCard className="size-4 text-primary" />
                <span>{t('details.paymentTitle')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Method:</span>
                <span className="font-medium text-foreground">
                  {t(`paymentMethod.${order.paymentMethod}` as any)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span className="font-medium text-foreground">
                  {t(`paymentStatus.${order.paymentStatus}` as any)}
                </span>
              </div>
              {order.payments && order.payments[0] && (
                <div className="flex items-center justify-between border-t border-border/50 pt-2">
                  <span className="text-muted-foreground">{t('details.transactionIdLabel')}:</span>
                  <span className="font-mono text-[11px] text-foreground">
                    {order.payments[0].transactionId}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status History Timeline */}
          {order.statusHistory && order.statusHistory.length > 0 && (
            <Card>
              <CardHeader className="pb-3 border-b border-border/60">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <History className="size-4 text-primary" />
                  <span>{t('details.statusHistoryTitle')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-3 text-xs">
                {order.statusHistory.map((item) => (
                  <div
                    key={item.id}
                    className="relative pl-4 border-l border-border pb-3 last:pb-0"
                  >
                    <div className="absolute -left-1.5 top-0 size-3 rounded-full bg-primary/40 border border-background" />
                    <p className="font-semibold text-foreground">
                      {t(`status.${item.toStatus}` as any)}
                    </p>
                    {item.reason && (
                      <p className="text-muted-foreground text-[11px] mt-0.5">{item.reason}</p>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Cancellation Dialog */}
      {isCancelModalOpen && (
        <CancelOrderDialog
          orderNumber={order.orderNumber}
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          onSuccess={fetchOrder}
        />
      )}

      {/* Return Request Dialog */}
      {isReturnModalOpen && (
        <RequestReturnDialog
          orderNumber={order.orderNumber}
          isOpen={isReturnModalOpen}
          onClose={() => setIsReturnModalOpen(false)}
          onSuccess={() => {
            fetchOrder();
            getReturnEligibilityApi(order.orderNumber)
              .then(setReturnEligibility)
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
