'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useCart } from './cart-provider';
import { formatPoishaToBDT } from '@/lib/utils';
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Truck,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  TicketPercent,
  Check,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DeliveryEstimator } from './delivery-estimator';

export function CartPageView() {
  const t = useTranslations('cart');
  const tCommon = useTranslations('common');
  const { cart, isLoading, updateQuantity, removeItem, clearCart, applyCoupon, removeCoupon } =
    useCart();

  const [couponCode, setCouponCode] = useState('');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isRemovingCoupon, setIsRemovingCoupon] = useState(false);

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;

    setIsApplyingCoupon(true);
    setCouponError(null);
    try {
      await applyCoupon(couponCode.trim());
      setCouponCode('');
    } catch (err) {
      setCouponError(err instanceof Error ? err.message : 'Failed to apply coupon');
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = async () => {
    setIsRemovingCoupon(true);
    setCouponError(null);
    try {
      await removeCoupon();
    } catch (err) {
      setCouponError(err instanceof Error ? err.message : 'Failed to remove coupon');
    } finally {
      setIsRemovingCoupon(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 flex items-center justify-center min-h-[400px]">
        <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const items = cart?.items ?? [];
  const itemCount = cart?.totalQuantity ?? 0;
  const subtotal = cart?.subtotal ?? 0;

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center max-w-lg">
        <div className="size-20 rounded-full bg-muted mx-auto flex items-center justify-center text-muted-foreground mb-6">
          <ShoppingCart className="size-10 opacity-30" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
          {t('emptyTitle')}
        </h1>
        <p className="text-sm text-muted-foreground mb-8">{t('emptyDescription')}</p>
        <Link
          href="/products"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
        >
          <span>{t('continueShopping')}</span>
          <ArrowRight className="size-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {t('title')}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t('itemCountBadge', { count: itemCount })}
          </p>
        </div>

        <button
          onClick={clearCart}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive hover:underline cursor-pointer self-start sm:self-auto"
        >
          <Trash2 className="size-3.5" />
          <span>{t('clearCart')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Cart Items List */}
        <div className="lg:col-span-8 bg-card rounded-xl border border-border shadow-sm overflow-hidden divide-y divide-border">
          {items.map((item) => {
            const primaryImage = item.product.primaryImage;
            const isOutOfStock = !item.isAvailable;
            const isExceedingStock = !isOutOfStock && !item.isQuantityValid;

            return (
              <div key={item.id} className="p-4 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-6">
                {/* Thumbnail */}
                <div className="relative size-24 sm:size-28 rounded-lg bg-muted border border-border overflow-hidden shrink-0 mx-auto sm:mx-0">
                  {primaryImage?.url ? (
                    <Image
                      src={primaryImage.url}
                      alt={primaryImage.altText || item.product.name}
                      fill
                      sizes="112px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="size-full flex items-center justify-center text-muted-foreground">
                      <ShoppingCart className="size-8 opacity-30" />
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        {item.product.brand && (
                          <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground block">
                            {item.product.brand.name}
                          </span>
                        )}
                        <Link
                          href={`/products/${item.product.slug}`}
                          className="text-sm sm:text-base font-semibold text-foreground hover:text-primary transition-colors line-clamp-2"
                        >
                          {item.product.name}
                        </Link>
                        <span className="text-xs text-muted-foreground block mt-0.5">
                          {item.variant.name} ({item.variant.sku})
                        </span>
                      </div>

                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded cursor-pointer"
                        title={t('removeItem')}
                        aria-label={t('removeItem')}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    {/* Price and Alerts */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm sm:text-base font-bold text-foreground">
                        {formatPoishaToBDT(item.unitPrice)}
                      </span>
                      {item.hasPriceChanged && (
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded ${
                            item.priceDifference > 0
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {item.priceDifference > 0 ? (
                            <TrendingUp className="size-3.5" />
                          ) : (
                            <TrendingDown className="size-3.5" />
                          )}
                          <span>
                            {t('wasPrice', {
                              price: formatPoishaToBDT(item.unitPriceAtAdd),
                            })}
                          </span>
                        </span>
                      )}
                    </div>

                    {isOutOfStock && (
                      <div className="mt-2 inline-flex items-center gap-1 text-xs text-destructive font-medium">
                        <AlertTriangle className="size-3.5 shrink-0" />
                        <span>{t('outOfStockNotice')}</span>
                      </div>
                    )}
                    {isExceedingStock && (
                      <div className="mt-2 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                        <AlertTriangle className="size-3.5 shrink-0" />
                        <span>
                          {t('insufficientStockNotice', {
                            available: item.availableStock,
                          })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Stepper & Line Total */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
                    <div className="flex items-center border border-border rounded-lg bg-muted/20">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-l-lg transition-colors cursor-pointer"
                        aria-label={t('decreaseQuantity')}
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="px-4 text-xs sm:text-sm font-semibold text-foreground min-w-[36px] text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        disabled={item.quantity >= item.availableStock}
                        className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-r-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label={t('increaseQuantity')}
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] text-muted-foreground block">
                        {t('lineTotalLabel')}
                      </span>
                      <span className="text-sm sm:text-base font-bold text-foreground">
                        {formatPoishaToBDT(item.lineTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Order Summary Sidebar */}
        <div className="lg:col-span-4 bg-card rounded-xl border border-border p-6 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-foreground">{t('orderSummaryTitle')}</h2>

          {cart?.couponNotice && (
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
              <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="font-semibold">{t('couponNoticeTitle')}</p>
                <p className="mt-0.5">{cart.couponNotice}</p>
              </div>
            </div>
          )}

          <div className="space-y-3 text-xs sm:text-sm divide-y divide-border/60">
            <div className="flex justify-between text-muted-foreground pt-1">
              <span>{t('subtotalLabel')}</span>
              <span className="font-semibold text-foreground">
                {formatPoishaToBDT(cart?.subtotal ?? 0)}
              </span>
            </div>

            {Boolean(cart?.discount && cart.discount > 0) && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400 pt-3">
                <span>
                  {t('discountLabel')} ({cart?.coupon?.code})
                </span>
                <span className="font-semibold">-{formatPoishaToBDT(cart!.discount)}</span>
              </div>
            )}

            <div className="flex justify-between text-muted-foreground pt-3">
              <span>{t('shippingLabel')}</span>
              {cart?.shipping?.isFreeShipping ? (
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0"
                  >
                    {t('shipping.free')}
                  </Badge>
                  <span>৳0</span>
                </span>
              ) : cart?.shipping?.isEstimated ? (
                <span className="font-semibold text-foreground">
                  {formatPoishaToBDT(cart.shipping.shippingFee)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">{t('calculatedAtCheckout')}</span>
              )}
            </div>

            <div className="flex justify-between text-base font-bold text-foreground pt-3">
              <span>{t('totalPayable')}</span>
              <span className="text-primary">
                {formatPoishaToBDT(cart?.total ?? cart?.subtotal ?? 0)}
              </span>
            </div>
          </div>

          {/* Coupon Input Section */}
          <div className="pt-2">
            {cart?.coupon ? (
              <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TicketPercent className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-xs text-foreground tracking-wider">
                        {cart.coupon.code}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-0"
                      >
                        {cart.coupon.discountType === 'PERCENTAGE'
                          ? `${cart.coupon.discountValue}%`
                          : `৳${cart.coupon.discountValue / 100}`}
                      </Badge>
                    </div>
                    {cart.coupon.description && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                        {cart.coupon.description}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveCoupon}
                  disabled={isRemovingCoupon}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive shrink-0"
                >
                  {isRemovingCoupon ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <X className="size-3.5" />
                  )}
                  <span className="ml-1">{t('removeCoupon')}</span>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleApplyCoupon} className="space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <TicketPercent className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder={t('promoCodePlaceholder')}
                      className="pl-9 text-xs font-mono uppercase"
                      disabled={isApplyingCoupon}
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={isApplyingCoupon || !couponCode.trim()}
                    className="text-xs shrink-0"
                  >
                    {isApplyingCoupon ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                    {isApplyingCoupon ? t('applyingCoupon') : t('applyCoupon')}
                  </Button>
                </div>
                {couponError && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertCircle className="size-3 shrink-0" />
                    <span>{couponError}</span>
                  </p>
                )}
              </form>
            )}
          </div>

          {/* Delivery Estimator */}
          <DeliveryEstimator />

          <Link
            href="/checkout"
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            <span>{t('proceedToCheckout')}</span>
            <ArrowRight className="size-4" />
          </Link>

          {/* Value Props */}
          <div className="pt-4 border-t border-border space-y-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary shrink-0" />
              <span>{t('secureCheckoutBadge')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Truck className="size-4 text-primary shrink-0" />
              <span>{t('fastDeliveryBadge')}</span>
            </div>
            <div className="flex items-center gap-2">
              <RotateCcw className="size-4 text-primary shrink-0" />
              <span>{t('easyReturnsBadge')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
