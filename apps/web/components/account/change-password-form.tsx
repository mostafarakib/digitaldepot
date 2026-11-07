'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordFormSchema, type ChangePasswordFormInput } from '@/lib/auth-schemas';
import { apiClient, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export function ChangePasswordForm({ onPasswordChanged }: { onPasswordChanged?: () => void }) {
  const t = useTranslations('auth.security.password');
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormInput>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      revokeAllSessions: false,
    },
  });

  const onSubmit = async (data: ChangePasswordFormInput) => {
    setServerError(null);
    setSuccessMessage(null);

    try {
      const response = await apiClient<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
          revokeAllSessions: data.revokeAllSessions,
        }),
      });

      setSuccessMessage(response.message || t('successNotice'));
      reset();
      if (onPasswordChanged) {
        onPasswordChanged();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError(t('genericError'));
      }
    }
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-semibold">{t('title')}</CardTitle>
        </div>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {successMessage && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-sm text-green-800 dark:text-green-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {serverError && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="currentPassword">{t('currentPasswordLabel')}</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              {...register('currentPassword')}
              disabled={isSubmitting}
            />
            {errors.currentPassword && (
              <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="newPassword">{t('newPasswordLabel')}</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              {...register('newPassword')}
              disabled={isSubmitting}
            />
            {errors.newPassword && (
              <p className="text-xs text-destructive">{errors.newPassword.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="confirmPassword">{t('confirmPasswordLabel')}</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword')}
              disabled={isSubmitting}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="revokeAllSessions"
              type="checkbox"
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              {...register('revokeAllSessions')}
              disabled={isSubmitting}
            />
            <Label htmlFor="revokeAllSessions" className="text-xs font-normal cursor-pointer">
              {t('revokeAllSessionsNotice')}
            </Label>
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('submitting')}
              </>
            ) : (
              t('submitButton')
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
