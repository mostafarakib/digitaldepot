'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cancelCustomerReturnApi, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface CancelReturnDialogProps {
  returnNumber: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CancelReturnDialog({
  returnNumber,
  isOpen,
  onClose,
  onSuccess,
}: CancelReturnDialogProps) {
  const t = useTranslations('returns');

  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCancel = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      await cancelCustomerReturnApi(returnNumber, reason.trim() ? reason.trim() : undefined);
      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('cancelDialog.errorToast'));
      }
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-card border border-border shadow-xl rounded-xl p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-full bg-destructive/10 text-destructive shrink-0">
            <AlertTriangle className="size-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              {t('cancelDialog.title', { returnNumber })}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('cancelDialog.description')}
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 text-xs rounded-md bg-destructive/10 border border-destructive/20 text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            {t('cancelDialog.reasonLabel')}
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('cancelDialog.reasonPlaceholder')}
            maxLength={255}
            className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {t('cancelDialog.closeButton')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="gap-2"
          >
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
            <span>
              {isSubmitting ? t('cancelDialog.cancellingButton') : t('cancelDialog.confirmButton')}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
