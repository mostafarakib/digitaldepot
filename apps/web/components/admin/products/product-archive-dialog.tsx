'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { type ProductListItem } from '@/lib/catalogue-types';
import { Button } from '@/components/ui/button';
import { Archive, Trash2, AlertTriangle, Loader2 } from 'lucide-react';

interface ProductArchiveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductListItem | null;
  onArchive: () => Promise<void>;
  onDelete: () => Promise<void>;
}

export function ProductArchiveDialog({
  isOpen,
  onClose,
  product,
  onArchive,
  onDelete,
}: ProductArchiveDialogProps) {
  const t = useTranslations('admin.products.archiveDialog');
  const tCommon = useTranslations('admin.products.modal');

  const [isLoading, setIsLoading] = useState(false);
  const [actionType, setActionType] = useState<'archive' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !product) return null;

  const handleArchive = async () => {
    setIsLoading(true);
    setActionType('archive');
    setError(null);
    try {
      await onArchive();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive product');
    } finally {
      setIsLoading(false);
      setActionType(null);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    setActionType('delete');
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete product');
    } finally {
      setIsLoading(false);
      setActionType(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-md bg-background border border-border rounded-xl shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3.5 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Archive className="h-5 w-5" />
          </div>
          <div>
            <h3 id="archive-dialog-title" className="text-lg font-semibold text-foreground">
              {t('title')}
            </h3>
            <p className="text-sm text-muted-foreground">{product.name}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3 mb-6 text-sm text-muted-foreground">
          <p>{t('archiveConfirm', { name: product.name })}</p>
          <div className="p-3 rounded-lg bg-muted/50 border border-border/80 text-xs text-foreground/80">
            {t('cannotDeleteWarning')}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-2.5 pt-2 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isLoading}
            className="flex items-center gap-1.5"
          >
            {isLoading && actionType === 'delete' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {t('deleteButton')}
          </Button>
          <Button
            type="button"
            onClick={handleArchive}
            disabled={isLoading}
            className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isLoading && actionType === 'archive' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            {t('archiveButton')}
          </Button>
        </div>
      </div>
    </div>
  );
}
