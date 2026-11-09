'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export interface GoogleAuthButtonProps {
  mode?: 'signin' | 'signup';
  returnUrl?: string;
  className?: string;
  disabled?: boolean;
  onError?: (message: string) => void;
}

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function GoogleAuthButton({
  mode = 'signin',
  returnUrl,
  className,
  disabled = false,
  onError,
}: GoogleAuthButtonProps) {
  const t = useTranslations('auth.oauth');
  const [isLoading, setIsLoading] = useState(false);

  // Validate returnUrl: must be relative, never protocol-relative
  const safeReturnUrl =
    returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : undefined;

  const handleGoogleAuth = async () => {
    setIsLoading(true);
    try {
      const endpoint = safeReturnUrl
        ? `/api/auth/oauth/google?format=json&returnUrl=${encodeURIComponent(safeReturnUrl)}`
        : '/api/auth/oauth/google?format=json';

      const data = await apiClient<{ authUrl: string; statePrefix: string }>(endpoint);

      if (data?.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error('Missing authorization URL');
      }
    } catch (err) {
      setIsLoading(false);
      const message = err instanceof ApiError ? err.message : t('genericError');
      if (onError) {
        onError(message);
      }
    }
  };

  const buttonText = mode === 'signup' ? t('signUpWithGoogle') : t('continueWithGoogle');

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleGoogleAuth}
      disabled={disabled || isLoading}
      className={cn('w-full flex items-center justify-center gap-3 font-medium', className)}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <GoogleIcon />
      )}
      <span>{isLoading ? t('loading') : buttonText}</span>
    </Button>
  );
}
