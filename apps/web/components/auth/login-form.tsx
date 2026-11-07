'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/routing';
import { loginSchema, type LoginInput } from '@/lib/auth-schemas';
import { useAuth } from './auth-provider';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export function LoginForm() {
  const t = useTranslations('auth.login');
  const tValidation = useTranslations('auth.validation');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const registeredNotice = searchParams.get('registered') === 'true';
  const resetNotice = searchParams.get('reset') === 'true';
  const rawReturnUrl = searchParams.get('returnUrl');

  // Sanitize returnUrl: must be relative, never protocol-relative
  const returnUrl =
    rawReturnUrl && rawReturnUrl.startsWith('/') && !rawReturnUrl.startsWith('//')
      ? rawReturnUrl
      : '/';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      router.push(returnUrl);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'INVALID_CREDENTIALS') {
          setServerError(t('invalidCredentialsError'));
        } else if (err.code === 'ACCOUNT_SUSPENDED') {
          setServerError(t('accountSuspendedError'));
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
      {registeredNotice && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-300"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <p className="text-sm font-medium">{t('registrationSuccessNotice')}</p>
        </div>
      )}

      {resetNotice && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-300"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <p className="text-sm font-medium">{t('passwordResetSuccessNotice')}</p>
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
          <Label htmlFor="email">{t('emailLabel')}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t('emailPlaceholder')}
            disabled={isSubmitting}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
          {errors.email && (
            <p id="email-error" className="text-xs text-destructive">
              {errors.email.type === 'invalid_string'
                ? tValidation('emailInvalid')
                : errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t('passwordLabel')}</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-primary hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
            >
              {t('forgotPassword')}
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
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
              {errors.password.message}
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

      <div className="text-center text-sm text-muted-foreground">
        {t('noAccountPrompt')}{' '}
        <Link
          href={`/register${returnUrl !== '/' ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t('signUpLink')}
        </Link>
      </div>
    </div>
  );
}
