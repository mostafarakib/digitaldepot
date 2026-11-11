'use client';

import React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useCart } from './cart-provider';
import { formatPoishaToBDT } from '@/lib/utils';
import {
  X,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Truck,
} from 'lucide-react';

export function CartDrawer() {
  const t = useTranslations('cart');
  const tCommon = useTranslations('common');
  const { cart, isDrawerOpen, closeDrawer, updateQuantity, removeItem } = useCart();

  if (!isDrawerOpen) return null;

  const items = cart?.items ?? [];
  const itemCount = cart?.totalQuantity ?? 0;
  const subtotal = cart?.subtotal ?? 0;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={closeDrawer}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-md bg-background shadow-2xl flex flex-col border-l border-border">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <ShoppingCart className="size-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">{t('title')}</h2>
                <span className="text-xs text-muted-foreground">
                  {t('itemCountBadge', { count: itemCount })}
                </span>
              </div>
            </div>
            <button
              onClick={closeDrawer}
              className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
              aria-label={tCommon('close')}
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Body */}
          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="size-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-4">
                <ShoppingCart className="size-8 opacity-40" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">{t('emptyTitle')}</h3>
              <p className="text-xs text-muted-foreground max-w-xs mb-6">{t('emptyDescription')}</p>
              <Link
                href="/products"
                onClick={closeDrawer}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
              >
                <span>{t('continueShopping')}</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-6 py-4 divide-y divide-border">
              {items.map((item) => {
                const primaryImage = item.product.primaryImage;
                const isOutOfStock = !item.isAvailable;
                const isExceedingStock = !isOutOfStock && !item.isQuantityValid;

                return (
                  <div key={item.id} className="py-4 first:pt-0 last:pb-0 flex gap-4">
                    {/* Thumbnail */}
                    <div className="relative size-20 rounded-lg bg-muted border border-border overflow-hidden shrink-0">
                      {primaryImage?.url ? (
                        <Image
                          src={primaryImage.url}
                          alt={primaryImage.altText || item.product.name}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="size-full flex items-center justify-center text-muted-foreground">
                          <ShoppingCart className="size-6 opacity-30" />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        {item.product.brand && (
                          <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground block truncate">
                            {item.product.brand.name}
                          </span>
                        )}
                        <Link
                          href={`/products/${item.product.slug}`}
                          onClick={closeDrawer}
                          className="text-xs font-semibold text-foreground hover:text-primary transition-colors line-clamp-1"
                        >
                          {item.product.name}
                        </Link>
                        <span className="text-[11px] text-muted-foreground block truncate mt-0.5">
                          {item.variant.name} ({item.variant.sku})
                        </span>

                        {/* Price Display */}
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="text-xs font-bold text-foreground">
                            {formatPoishaToBDT(item.unitPrice)}
                          </span>
                          {item.hasPriceChanged && (
                            <span
                              className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                item.priceDifference > 0
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {item.priceDifference > 0 ? (
                                <TrendingUp className="size-3" />
                              ) : (
                                <TrendingDown className="size-3" />
                              )}
                              <span>
                                {t('wasPrice', {
                                  price: formatPoishaToBDT(item.unitPriceAtAdd),
                                })}
                              </span>
                            </span>
                          )}
                        </div>

                        {/* Stock Warnings */}
                        {isOutOfStock && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-destructive font-medium">
                            <AlertTriangle className="size-3 shrink-0" />
                            <span>{t('outOfStockNotice')}</span>
                          </div>
                        )}
                        {isExceedingStock && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                            <AlertTriangle className="size-3 shrink-0" />
                            <span>
                              {t('insufficientStockNotice', {
                                available: item.availableStock,
                              })}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Stepper & Removal */}
                      <div className="flex items-center justify-between mt-2 pt-1">
                        <div className="flex items-center border border-border rounded-md bg-muted/30">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-l transition-colors cursor-pointer"
                            aria-label={t('decreaseQuantity')}
                          >
                            <Minus className="size-3" />
                          </button>
                          <span className="px-2.5 text-xs font-medium text-foreground min-w-[28px] text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            disabled={item.quantity >= item.availableStock}
                            className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-r transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label={t('increaseQuantity')}
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>

                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors cursor-pointer rounded"
                          title={t('removeItem')}
                          aria-label={t('removeItem')}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          {items.length > 0 && (
            <div className="p-6 border-t border-border bg-muted/20 space-y-4">
              {cart?.couponNotice && (
                <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
                  <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
                  <span>{cart.couponNotice}</span>
                </div>
              )}

              {/* Free Shipping Progress in Drawer */}
              {cart?.shipping && (
                <div className="space-y-1">
                  {cart.shipping.isFreeShipping ? (
                    <div className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 p-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                      <Truck className="size-3.5 shrink-0 text-emerald-600" />
                      <span>{t('shipping.freeShippingUnlocked')}</span>
                    </div>
                  ) : (
                    <div>
                      <div className="flex justify-between text-[11px] text-muted-foreground mb-0.5">
                        <span>
                          {t('shipping.freeShippingProgress', {
                            amount: formatPoishaToBDT(cart.shipping.amountNeededForFreeShipping),
                          })}
                        </span>
                        <span className="font-semibold text-foreground">
                          {cart.shipping.freeShippingProgressPercent}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${cart.shipping.freeShippingProgressPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>{t('subtotalLabel')}</span>
                  <span className="font-semibold text-foreground">
                    {formatPoishaToBDT(cart?.subtotal ?? subtotal)}
                  </span>
                </div>

                {Boolean(cart?.discount && cart.discount > 0) && (
                  <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                    <span>
                      {t('discountLabel')} ({cart?.coupon?.code})
                    </span>
                    <span className="font-semibold">-{formatPoishaToBDT(cart!.discount)}</span>
                  </div>
                )}

                {cart?.shipping && (
                  <div className="flex items-center justify-between">
                    <span>{t('shippingLabel')}</span>
                    {cart.shipping.isFreeShipping ? (
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {t('shipping.free')}
                      </span>
                    ) : cart.shipping.isEstimated ? (
                      <span className="font-semibold text-foreground">
                        {formatPoishaToBDT(cart.shipping.shippingFee)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        {t('calculatedAtCheckout')}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-border/50 text-foreground font-bold">
                  <span>{t('lineTotalLabel')}</span>
                  <span className="text-base text-primary">
                    {formatPoishaToBDT(cart?.total ?? cart?.subtotal ?? subtotal)}
                  </span>
                </div>

                <p className="text-[11px] text-muted-foreground pt-0.5">
                  {t('shippingTaxesNotice')}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <Link
                  href="/cart"
                  onClick={closeDrawer}
                  className="inline-flex items-center justify-center px-4 py-2.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors text-center"
                >
                  {t('viewCart')}
                </Link>
                <Link
                  href="/checkout"
                  onClick={closeDrawer}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-center shadow-sm"
                >
                  <span>{t('checkout')}</span>
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
