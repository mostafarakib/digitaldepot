'use client';

import React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { CheckoutItemSummary } from '@/lib/checkout-types';
import { formatPoishaToBDT } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Package,
  ExternalLink,
  AlertTriangle,
  AlertCircle,
  CheckSquare,
  Square,
} from 'lucide-react';

interface CheckoutItemsReviewProps {
  items: CheckoutItemSummary[];
  hasPriceChanges: boolean;
  isPriceAcknowledged: boolean;
  onTogglePriceAcknowledgement: (val: boolean) => void;
  disabled?: boolean;
}

export function CheckoutItemsReview({
  items,
  hasPriceChanges,
  isPriceAcknowledged,
  onTogglePriceAcknowledgement,
  disabled = false,
}: CheckoutItemsReviewProps) {
  const t = useTranslations('checkout');

  return (
    <div className="bg-card border border-border rounded-xl p-5 md:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Package className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">{t('orderItemsTitle')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('orderItemsSubtitle', { count: items.length })}
            </p>
          </div>
        </div>

        <Link
          href="/cart"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <span>{t('editCart')}</span>
          <ExternalLink className="size-3" />
        </Link>
      </div>

      {/* Price Change Acknowledgement Callout (Clarification #1) */}
      {hasPriceChanges && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold">{t('priceChangeAlertTitle')}</p>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5 leading-relaxed">
                {t('priceChangeAlertDescription')}
              </p>
            </div>
          </div>

          <label
            onClick={() => !disabled && onTogglePriceAcknowledgement(!isPriceAcknowledged)}
            className={`flex items-center gap-2 pt-1.5 cursor-pointer select-none text-xs font-bold text-foreground hover:text-primary transition-colors ${
              disabled ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isPriceAcknowledged ? (
              <CheckSquare className="size-4.5 text-primary shrink-0" />
            ) : (
              <Square className="size-4.5 text-muted-foreground shrink-0" />
            )}
            <span>{t('acknowledgePriceChangesCheckbox')}</span>
          </label>
        </div>
      )}

      {/* Items List */}
      <div className="divide-y divide-border">
        {items.map((item) => {
          return (
            <div key={item.id} className="py-3.5 first:pt-0 last:pb-0 flex items-start gap-3.5">
              {/* Product Thumbnail */}
              <div className="relative size-16 md:size-18 rounded-lg overflow-hidden border border-border bg-muted/40 shrink-0">
                {item.primaryImage ? (
                  <Image
                    src={item.primaryImage.url}
                    alt={item.primaryImage.altText || item.productName}
                    fill
                    className="object-cover"
                    sizes="72px"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <Package className="size-6 opacity-40" />
                  </div>
                )}
              </div>

              {/* Item Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/products/${item.productSlug}`}
                      className="text-xs md:text-sm font-semibold text-foreground hover:text-primary transition-colors line-clamp-1"
                    >
                      {item.productName}
                    </Link>

                    {item.variantName && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-medium line-clamp-1">
                        {item.variantName}
                      </p>
                    )}

                    <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                      SKU: {item.sku}
                    </p>
                  </div>

                  {/* Line Total */}
                  <div className="text-right shrink-0">
                    <p className="text-xs md:text-sm font-bold text-foreground">
                      {formatPoishaToBDT(item.lineTotal)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {item.quantity} × {formatPoishaToBDT(item.unitPrice)}
                    </p>
                  </div>
                </div>

                {/* Status Warnings & Price Change Notice */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {!item.isAvailable && (
                    <Badge variant="destructive" className="text-[10px] py-0 gap-1 h-5">
                      <AlertCircle className="size-3" />
                      <span>{t('itemUnavailable')}</span>
                    </Badge>
                  )}

                  {item.isAvailable && !item.isQuantityValid && (
                    <Badge variant="destructive" className="text-[10px] py-0 gap-1 h-5">
                      <AlertCircle className="size-3" />
                      <span>{t('insufficientStock', { available: item.availableStock })}</span>
                    </Badge>
                  )}

                  {item.hasPriceChanged && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] py-0 gap-1 h-5 border-amber-500/30 text-amber-700 dark:text-amber-300 bg-amber-500/10"
                    >
                      <AlertTriangle className="size-3" />
                      <span>
                        {t('priceUpdatedFrom', {
                          oldPrice: formatPoishaToBDT(item.oldUnitPrice),
                          newPrice: formatPoishaToBDT(item.unitPrice),
                        })}
                      </span>
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
