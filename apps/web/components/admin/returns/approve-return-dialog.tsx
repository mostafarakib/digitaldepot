'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { approveAdminReturnApi, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface ApproveReturnDialogProps {
  returnNumber: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ApproveReturnDialog({
  returnNumber,
  isOpen,
  onClose,
  onSuccess,
}: ApproveReturnDialogProps) {
  const t = useTranslations('admin.returns.approveDialog');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await approveAdminReturnApi(returnNumber, {
        notes: notes.trim() || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to approve return request.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-lg rounded-xl border shadow-xl p-6 relative">
        <div className="flex items-center gap-3 text-emerald-600 mb-3">
          <div className="p-2 bg-emerald-500/10 rounded-full">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">{t('title', { returnNumber })}</h3>
        </div>

        <p className="text-sm text-muted-foreground mb-4">{t('prompt')}</p>

        {errorMessage && (
          <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleConfirm}>
          <div className="mb-5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              {t('notesLabel')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notesPlaceholder')}
              rows={3}
              disabled={isSubmitting}
              className="w-full text-sm rounded-lg border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('confirming')}
                </>
              ) : (
                t('confirm')
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
