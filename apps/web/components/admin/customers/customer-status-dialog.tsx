'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { updateAdminCustomerStatusApi, ApiError } from '@/lib/api-client';
import type { CustomerStatus } from '@/lib/customer-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';

interface CustomerStatusDialogProps {
  customerId: string | null;
  customerName: string;
  currentStatus: CustomerStatus | null;
  targetStatus: CustomerStatus | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CustomerStatusDialog({
  customerId,
  customerName,
  currentStatus,
  targetStatus,
  isOpen,
  onClose,
  onSuccess,
}: CustomerStatusDialogProps) {
  const t = useTranslations('admin.customers.statusDialog');
  const tCommon = useTranslations('common');

  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !customerId || !targetStatus) return null;

  const isSuspending = targetStatus === 'SUSPENDED';

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMessage(t('reasonRequired'));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await updateAdminCustomerStatusApi(customerId, {
        status: targetStatus,
        reason: reason.trim(),
      });
      setReason('');
      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(t('errorGeneric'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-lg rounded-xl border shadow-xl p-6 relative">
        <div
          className={`flex items-center gap-3 mb-3 ${isSuspending ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}
        >
          <div
            className={`p-2 rounded-full ${isSuspending ? 'bg-destructive/10' : 'bg-emerald-500/10'}`}
          >
            {isSuspending ? (
              <ShieldAlert className="w-6 h-6" />
            ) : (
              <ShieldCheck className="w-6 h-6" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold">
              {isSuspending ? t('suspendTitle') : t('reactivateTitle')}
            </h3>
            <p className="text-xs text-muted-foreground">{customerName}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          {isSuspending ? t('suspendDescription') : t('reactivateDescription')}
        </p>

        {isSuspending && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-700 dark:text-amber-400 mb-4 flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{t('suspendWarning')}</span>
          </div>
        )}

        <form onSubmit={handleConfirm} className="space-y-4">
          <div>
            <Label htmlFor="status-reason" className="text-xs font-medium">
              {t('reasonLabel')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="status-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isSuspending ? t('suspendPlaceholder') : t('reactivatePlaceholder')}
              maxLength={500}
              className="mt-1"
              required
              autoFocus
            />
          </div>

          {errorMessage && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              variant={isSuspending ? 'destructive' : 'default'}
              size="sm"
              disabled={isSubmitting || !reason.trim()}
              className="gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSuspending ? t('confirmSuspend') : t('confirmReactivate')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
