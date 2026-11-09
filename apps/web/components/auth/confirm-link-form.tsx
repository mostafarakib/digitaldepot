'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/routing';
import { confirmLinkFormSchema, type ConfirmLinkFormInput } from '@/lib/auth-schemas';
import { useAuth } from './auth-provider';
import { apiClient, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2, AlertCircle, ShieldAlert } from 'lucide-react';

export function ConfirmLinkForm() {
  const t = useTranslations('auth.confirmLink');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();

  const challengePrefix = searchParams.get('challengePrefix');
  const rawReturnUrl = searchParams.get('returnUrl');

  // Sanitize returnUrl: must be relative, never protocol-relative
  const returnUrl =
    rawReturnUrl && rawReturnUrl.startsWith('/') && !rawReturnUrl.startsWith('//')
      ? rawReturnUrl
      : '/account';

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLockedOut, setIsLockedOut] = useState(!challengePrefix);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConfirmLinkFormInput>({
    resolver: zodResolver(confirmLinkFormSchema),
    defaultValues: {
      password: '',
    },
  });

  const onSubmit = async (values: ConfirmLinkFormInput) => {
    if (!challengePrefix) {
      setServerError(t('expiredNotice'));
      setIsLockedOut(true);
      return;
    }

    setServerError(null);
    try {
      await apiClient('/api/auth/oauth/google/confirm-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengePrefix,
          password: values.password,
        }),
      });

      // 1. Refresh auth state in current tab
      await refreshUser();

      // 2. Broadcast login event across open tabs
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const channel = new BroadcastChannel('dd_auth_channel');
        channel.postMessage({ type: 'LOGIN' });
        channel.close();
      }

      // 3. Redirect to destination
      router.push(returnUrl);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'INVALID_CREDENTIALS') {
          const match = err.message.match(/(\d+)\s+attempts\s+remaining/i);
          const remaining = match ? parseInt(match[1], 10) : null;
          setServerError(
            remaining !== null
              ? t('remainingAttemptsNotice', { remaining })
              : err.message || t('invalidPassword'),
          );
        } else if (err.code === 'MAX_ATTEMPTS_EXCEEDED') {
          setIsLockedOut(true);
          setServerError(t('maxAttemptsNotice'));
        } else if (err.code === 'LINK_CHALLENGE_EXPIRED') {
          setIsLockedOut(true);
          setServerError(t('expiredNotice'));
        } else if (err.code === 'OAUTH_PROVIDER_IDENTITY_CONFLICT') {
          setIsLockedOut(true);
          setServerError(t('identityConflictNotice'));
        } else if (err.code === 'ACCOUNT_SUSPENDED') {
          setIsLockedOut(true);
          setServerError(t('accountSuspendedNotice'));
        } else {
          setServerError(err.message || t('genericError'));
        }
      } else {
        setServerError(t('genericError'));
      }
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground/90">
        <p>{t('description')}</p>
      </div>

      {!challengePrefix && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive"
        >
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{t('expiredNotice')}</p>
        </div>
      )}

      {serverError && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{serverError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="password">{t('passwordLabel')}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder={t('passwordPlaceholder')}
              disabled={isSubmitting || isLockedOut}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              className="pr-10"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isSubmitting || isLockedOut}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded p-0.5"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p id="password-error" className="text-xs text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting || isLockedOut} className="w-full">
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('submittingButton')}
            </>
          ) : (
            t('submitButton')
          )}
        </Button>
      </form>

      <div className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t('backToLogin')}
        </Link>
      </div>
    </div>
  );
}
