'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/routing';
import { registerFormSchema, type RegisterFormInput } from '@/lib/auth-schemas';
import { useAuth } from './auth-provider';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';

export function RegisterForm() {
  const t = useTranslations('auth.register');
  const tValidation = useTranslations('auth.validation');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register: registerUser } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const rawReturnUrl = searchParams.get('returnUrl');
  const returnUrl =
    rawReturnUrl && rawReturnUrl.startsWith('/') && !rawReturnUrl.startsWith('//')
      ? rawReturnUrl
      : '/';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormInput>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: RegisterFormInput) => {
    setServerError(null);
    try {
      await registerUser({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
        locale: locale === 'bn' ? 'bn' : 'en',
      });

      const redirectPath = `/login?registered=true${
        returnUrl !== '/' ? `&returnUrl=${encodeURIComponent(returnUrl)}` : ''
      }`;
      router.push(redirectPath);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'EMAIL_ALREADY_EXISTS' || err.status === 409) {
          setServerError(t('emailConflictError'));
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">{t('firstNameLabel')}</Label>
            <Input
              id="firstName"
              type="text"
              autoComplete="given-name"
              placeholder={t('firstNamePlaceholder')}
              disabled={isSubmitting}
              aria-invalid={!!errors.firstName}
              aria-describedby={errors.firstName ? 'firstName-error' : undefined}
              {...register('firstName')}
            />
            {errors.firstName && (
              <p id="firstName-error" className="text-xs text-destructive">
                {errors.firstName.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">{t('lastNameLabel')}</Label>
            <Input
              id="lastName"
              type="text"
              autoComplete="family-name"
              placeholder={t('lastNamePlaceholder')}
              disabled={isSubmitting}
              aria-invalid={!!errors.lastName}
              aria-describedby={errors.lastName ? 'lastName-error' : undefined}
              {...register('lastName')}
            />
            {errors.lastName && (
              <p id="lastName-error" className="text-xs text-destructive">
                {errors.lastName.message}
              </p>
            )}
          </div>
        </div>

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
              {errors.password.message}
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
              aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
              className="pr-10"
              {...register('confirmPassword')}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              disabled={isSubmitting}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded p-0.5"
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p id="confirmPassword-error" className="text-xs text-destructive">
              {errors.confirmPassword.message}
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
        {t('hasAccountPrompt')}{' '}
        <Link
          href={`/login${returnUrl !== '/' ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t('signInLink')}
        </Link>
      </div>
    </div>
  );
}
