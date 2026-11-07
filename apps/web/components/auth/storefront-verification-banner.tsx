'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { useAuth } from './auth-provider';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getDismissedSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem('dd_dismiss_verify_banner') === 'true';
  } catch {
    return false;
  }
}

function getDismissedServerSnapshot(): boolean {
  return false;
}

export function StorefrontVerificationBanner() {
  const t = useTranslations('auth.verifyEmail');
  const { user } = useAuth();
  const [localDismissed, setLocalDismissed] = useState(false);
  const isSessionDismissed = useSyncExternalStore(
    subscribe,
    getDismissedSnapshot,
    getDismissedServerSnapshot,
  );

  const isDismissed = localDismissed || isSessionDismissed;
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle');

  if (!user || user.emailVerified || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setLocalDismissed(true);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('dd_dismiss_verify_banner', 'true');
      } catch {
        // Ignore storage exceptions
      }
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setResendStatus('idle');
    try {
      await apiClient('/api/auth/resend-verification', {
        method: 'POST',
      });
      setResendStatus('success');
    } catch {
      setResendStatus('error');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Email verification reminder"
      className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs sm:text-sm px-4 py-2.5 transition-all"
    >
      <div className="container mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            {t('bannerReminder')}{' '}
            <span className="font-medium text-muted-foreground hidden md:inline">
              ({t('checkoutRequirement')})
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {resendStatus === 'success' ? (
            <span className="flex items-center gap-1 text-green-700 dark:text-green-400 font-medium text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('resendSuccessShort')}
            </span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResend}
              disabled={isResending}
              className="h-7 text-xs border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50"
            >
              {isResending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  {t('resending')}
                </>
              ) : (
                t('resendButton')
              )}
            </Button>
          )}

          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss banner"
            className="text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-100 p-1 rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
