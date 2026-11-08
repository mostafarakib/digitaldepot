'use client';

import React, { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { AddressItem } from '@/lib/auth-types';
import { Button } from '@/components/ui/button';
import { AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';

interface AddressDeleteDialogProps {
  address: AddressItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
  totalAddresses: number;
}

export function AddressDeleteDialog({
  address,
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  totalAddresses,
}: AddressDeleteDialogProps) {
  const t = useTranslations('auth.addresses');
  const modalRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Focus management: save previous active element and trap focus
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement | null;
      // Focus cancel button by default
      cancelButtonRef.current?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isDeleting) {
          e.preventDefault();
          onClose();
          return;
        }

        if (e.key === 'Tab' && modalRef.current) {
          const focusable = modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [tabindex="0"]',
          );
          if (focusable.length === 0) return;

          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        previousActiveElement.current?.focus();
      };
    }
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen || !address) return null;

  const isDefault = address.isDefault;
  const isSoleAddress = totalAddresses === 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-description"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-md bg-background border border-border rounded-xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3
              id="delete-dialog-title"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              {t('confirmDeleteTitle')}
            </h3>
            <p
              id="delete-dialog-description"
              className="text-sm text-muted-foreground leading-normal"
            >
              {t('confirmDeleteDescription')}
            </p>
          </div>
        </div>

        {/* Warning callout for default address */}
        {isDefault && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <span>
              {isSoleAddress ? t('confirmDeleteSoleWarning') : t('confirmDeleteDefaultWarning')}
            </span>
          </div>
        )}

        {/* Target address summary */}
        <div className="rounded-md border border-border/80 bg-muted/40 p-3 text-xs space-y-1">
          <p className="font-medium text-foreground">
            {address.recipientName} ({address.phone})
          </p>
          <p className="text-muted-foreground">
            {address.streetAddress}, {address.upazila}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            ref={cancelButtonRef}
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
            type="button"
          >
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
            className="gap-2"
            type="button"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('deleting')}
              </>
            ) : (
              t('confirmDelete')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
