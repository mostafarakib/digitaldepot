'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminCoupon } from '@/lib/coupon-types';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface CouponDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  coupon: AdminCoupon | null;
}

export function CouponDeleteDialog({
  isOpen,
  onClose,
  onConfirm,
  coupon,
}: CouponDeleteDialogProps) {
  const t = useTranslations('admin.coupons');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !coupon) return null;

  const hasUsage = (coupon._count?.usages ?? 0) > 0 || coupon.usageCount > 0;

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete coupon');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="coupon-delete-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-md bg-background border border-border rounded-xl shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3.5 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 id="coupon-delete-dialog-title" className="text-lg font-semibold text-foreground">
              {t('deleteDialogTitle')}
            </h3>
            <p className="text-sm font-mono font-bold text-primary mt-0.5">{coupon.code}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          {t('deleteDialogMessage', { code: coupon.code })}
        </p>

        {hasUsage && (
          <div className="mt-3.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <p>{t('deleteDialogWarning')}</p>
          </div>
        )}

        {error && (
          <div className="mt-3 p-2.5 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2.5">
          <Button type="button" variant="outline" onClick={onClose} disabled={isDeleting}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting || hasUsage}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('deleting')}
              </>
            ) : (
              t('delete')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
