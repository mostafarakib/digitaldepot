'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { forgotPasswordFormSchema, type ForgotPasswordFormInput } from '@/lib/auth-schemas';
import { apiClient, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertCircle, CheckCircle2, ArrowLeft, Mail } from 'lucide-react';

export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgotPassword');
  const tValidation = useTranslations('auth.validation');
  const locale = useLocale();

  const [isSuccess, setIsSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormInput>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (values: ForgotPasswordFormInput) => {
    setServerError(null);
    try {
      await apiClient<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: values.email,
          locale: locale === 'bn' ? 'bn' : 'en',
        }),
      });

      setIsSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message || t('genericError'));
      } else {
        setServerError(t('genericError'));
      }
    }
  };

  if (isSuccess) {
    return (
      <div className="w-full space-y-6">
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center text-center p-6 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 space-y-3"
        >
          <div className="rounded-full bg-emerald-500/20 p-3">
            <Mail className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-base font-semibold text-foreground">{t('successTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('successNotice')}</p>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setIsSuccess(false);
              reset();
            }}
          >
            {t('tryAnother')}
          </Button>

          <Button asChild variant="ghost" className="w-full">
            <Link href="/login" className="flex items-center justify-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              {t('returnToLogin')}
            </Link>
          </Button>
        </div>
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

      <div className="text-center pt-2">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('returnToLogin')}
        </Link>
      </div>
    </div>
  );
}
