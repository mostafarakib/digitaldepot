'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  type ProductVariantItem,
  type VariantFormValues,
  variantFormSchema,
  poishaToBdt,
  bdtToPoisha,
  normalizeSku,
} from '@/lib/catalogue-types';
import { apiClient, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Layers, X, Loader2, AlertCircle } from 'lucide-react';

interface VariantModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  variant: ProductVariantItem | null;
  onSaved: (variant: ProductVariantItem) => void;
}

export function VariantModal({ isOpen, onClose, productId, variant, onSaved }: VariantModalProps) {
  const t = useTranslations('admin.products.variantModal');
  const tCommon = useTranslations('admin.products.modal');

  const isEditing = Boolean(variant);

  const [sku, setSku] = useState(variant ? variant.sku : '');
  const [name, setName] = useState(variant ? variant.name : '');
  const [priceBdt, setPriceBdt] = useState(variant ? String(poishaToBdt(variant.price)) : '');
  const [compareAtPriceBdt, setCompareAtPriceBdt] = useState(
    variant?.compareAtPrice ? String(poishaToBdt(variant.compareAtPrice)) : '',
  );
  const [costPriceBdt, setCostPriceBdt] = useState(
    variant?.costPrice ? String(poishaToBdt(variant.costPrice)) : '',
  );
  const [barcode, setBarcode] = useState(variant?.barcode || '');
  const [isDefault, setIsDefault] = useState(variant ? variant.isDefault : false);
  const [isActive, setIsActive] = useState(variant ? variant.isActive : true);
  const [reason, setReason] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setServerError(null);
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError(null);

    const parsedPrice = parseFloat(priceBdt);
    const parsedCompareAt = compareAtPriceBdt.trim() ? parseFloat(compareAtPriceBdt) : undefined;
    const parsedCost = costPriceBdt.trim() ? parseFloat(costPriceBdt) : undefined;

    const valuesToValidate: VariantFormValues = {
      sku: normalizeSku(sku),
      name: name.trim(),
      priceBdt: isNaN(parsedPrice) ? 0 : parsedPrice,
      compareAtPriceBdt:
        parsedCompareAt !== undefined && !isNaN(parsedCompareAt) ? parsedCompareAt : null,
      costPriceBdt: parsedCost !== undefined && !isNaN(parsedCost) ? parsedCost : null,
      barcode: barcode.trim() || null,
      isDefault,
      isActive,
      reason: reason.trim() || undefined,
    };

    const result = variantFormSchema.safeParse(valuesToValidate);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path[0] as string;
        fieldErrors[path] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    // Default variant invariant: cannot be default if inactive
    if (isDefault && !isActive) {
      setErrors((prev) => ({
        ...prev,
        isDefault: 'An inactive variant cannot be set as the default variant',
      }));
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        sku: valuesToValidate.sku,
        name: valuesToValidate.name,
        price: bdtToPoisha(valuesToValidate.priceBdt),
        compareAtPrice: valuesToValidate.compareAtPriceBdt
          ? bdtToPoisha(valuesToValidate.compareAtPriceBdt)
          : null,
        costPrice:
          valuesToValidate.costPriceBdt !== null && valuesToValidate.costPriceBdt !== undefined
            ? bdtToPoisha(valuesToValidate.costPriceBdt)
            : null,
        barcode: valuesToValidate.barcode,
        isDefault: valuesToValidate.isDefault,
        isActive: valuesToValidate.isActive,
        reason: valuesToValidate.reason,
      };

      let saved: ProductVariantItem;
      if (isEditing && variant) {
        saved = await apiClient<ProductVariantItem>(
          `/api/admin/variants/${encodeURIComponent(variant.id)}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          },
        );
      } else {
        saved = await apiClient<ProductVariantItem>(
          `/api/admin/products/${encodeURIComponent(productId)}/variants`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          },
        );
      }

      onSaved(saved);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError(err instanceof Error ? err.message : 'Failed to save variant');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="variant-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          handleClose();
        }
      }}
    >
      <div className="relative w-full max-w-xl max-h-[90vh] bg-background border border-border rounded-xl shadow-2xl p-6 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 id="variant-modal-title" className="text-lg font-semibold text-foreground">
                {isEditing ? t('editTitle', { sku: variant?.sku ?? '' }) : t('createTitle')}
              </h3>
              <p className="text-xs text-muted-foreground">{t('skuHelp')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4">
          {serverError && (
            <div className="p-3.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="variant-sku">{t('skuLabel')}</Label>
              <Input
                id="variant-sku"
                value={sku}
                onChange={(e) => setSku(normalizeSku(e.target.value))}
                placeholder="e.g. IPH16P-256-BLK"
                disabled={isSubmitting}
                className={errors.sku ? 'border-destructive font-mono' : 'font-mono'}
              />
              {errors.sku && <p className="text-xs text-destructive mt-1">{errors.sku}</p>}
            </div>

            <div>
              <Label htmlFor="variant-name">{t('nameLabel')}</Label>
              <Input
                id="variant-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 256GB / Space Black"
                disabled={isSubmitting}
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="variant-price">{t('priceLabel')}</Label>
              <Input
                id="variant-price"
                type="number"
                step="0.01"
                min="0.01"
                value={priceBdt}
                onChange={(e) => setPriceBdt(e.target.value)}
                placeholder="0.00"
                disabled={isSubmitting}
                className={errors.priceBdt ? 'border-destructive' : ''}
              />
              {errors.priceBdt && (
                <p className="text-xs text-destructive mt-1">{errors.priceBdt}</p>
              )}
            </div>

            <div>
              <Label htmlFor="variant-compare-price">{t('compareAtLabel')}</Label>
              <Input
                id="variant-compare-price"
                type="number"
                step="0.01"
                min="0.01"
                value={compareAtPriceBdt}
                onChange={(e) => setCompareAtPriceBdt(e.target.value)}
                placeholder="Optional"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <Label htmlFor="variant-cost-price">{t('costPriceLabel')}</Label>
              <Input
                id="variant-cost-price"
                type="number"
                step="0.01"
                min="0"
                value={costPriceBdt}
                onChange={(e) => setCostPriceBdt(e.target.value)}
                placeholder="Optional"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="variant-barcode">{t('barcodeLabel')}</Label>
            <Input
              id="variant-barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="e.g. 194253000000"
              disabled={isSubmitting}
            />
          </div>

          {isEditing && (
            <div>
              <Label htmlFor="variant-reason">{t('reasonLabel')}</Label>
              <Input
                id="variant-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('reasonPlaceholder')}
                disabled={isSubmitting}
              />
            </div>
          )}

          <div className="pt-2 border-t border-border space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="variant-is-default"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                disabled={isSubmitting}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label
                htmlFor="variant-is-default"
                className="text-sm font-medium text-foreground cursor-pointer"
              >
                {t('isDefaultLabel')}
              </label>
            </div>
            {errors.isDefault && <p className="text-xs text-destructive">{errors.isDefault}</p>}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="variant-is-active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={isSubmitting}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label
                htmlFor="variant-is-active"
                className="text-sm font-medium text-foreground cursor-pointer"
              >
                {t('isActiveLabel')}
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tCommon('saving')}
                </>
              ) : (
                tCommon('save')
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
