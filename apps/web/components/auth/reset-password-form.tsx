'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/routing';
import { resetPasswordFormSchema, type ResetPasswordFormInput } from '@/lib/auth-schemas';
import { apiClient, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const t = useTranslations('auth.resetPassword');
  const tValidation = useTranslations('auth.validation');
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isTokenInvalid, setIsTokenInvalid] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormInput>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: ResetPasswordFormInput) => {
    setServerError(null);
    setIsTokenInvalid(false);

    try {
      await apiClient<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          password: values.password,
        }),
      });

      setIsSuccess(true);
      // Automatically redirect to login with reset confirmation flag after short delay
      setTimeout(() => {
        router.push('/login?reset=true');
      }, 1500);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'INVALID_OR_EXPIRED_TOKEN' || err.status === 400) {
          setIsTokenInvalid(true);
        } else {
          setServerError(err.message || t('genericError'));
        }
      } else {
        setServerError(t('genericError'));
      }
    }
  };

  if (isTokenInvalid) {
    return (
      <div className="w-full space-y-6">
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col items-center text-center p-6 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive space-y-3"
        >
          <div className="rounded-full bg-destructive/20 p-3">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h3 className="text-base font-semibold text-foreground">{t('invalidLinkTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('invalidLinkNotice')}</p>
        </div>

        <Button asChild className="w-full">
          <Link href="/forgot-password">{t('requestNewLinkButton')}</Link>
        </Button>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="w-full space-y-6">
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center text-center p-6 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 space-y-3"
        >
          <div className="rounded-full bg-emerald-500/20 p-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-base font-semibold text-foreground">{t('successTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('successNotice')}</p>
        </div>

        <Button asChild className="w-full">
          <Link href="/login?reset=true">{t('loginButton')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
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
              autoComplete="new-password"
              placeholder={t('passwordPlaceholder')}
              disabled={isSubmitting}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              className="pr-10"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isSubmitting}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded p-0.5"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p id="password-error" className="text-xs text-destructive">
              {errors.password.type === 'too_small'
                ? tValidation('passwordMinLength')
                : errors.password.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{t('confirmPasswordLabel')}</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={t('confirmPasswordPlaceholder')}
              disabled={isSubmitting}
              aria-invalid={!!errors.confirmPassword}
              aria-describedby={errors.confirmPassword ? 'confirm-error' : undefined}
              className="pr-10"
              {...register('confirmPassword')}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              disabled={isSubmitting}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded p-0.5"
              aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p id="confirm-error" className="text-xs text-destructive">
              {tValidation('passwordsDoNotMatch')}
            </p>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
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
    </div>
  );
}
