'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { type BrandItem } from '@/lib/catalogue-types';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface BrandDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  brand: BrandItem | null;
}

export function BrandDeleteDialog({ isOpen, onClose, onConfirm, brand }: BrandDeleteDialogProps) {
  const t = useTranslations('admin.catalogue.brandDelete');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !brand) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete brand');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="brand-delete-dialog-title"
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
            <h3 id="brand-delete-dialog-title" className="text-lg font-semibold text-foreground">
              {t('title')}
            </h3>
            <p className="text-sm text-muted-foreground">{t('confirm', { name: brand.name })}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('deletingButton')}
              </>
            ) : (
              t('deleteButton')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
