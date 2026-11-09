'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { setPasswordFormSchema, type SetPasswordFormInput } from '@/lib/auth-schemas';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { ReauthDialog } from './reauth-dialog';

export function SetPasswordForm({ onPasswordSet }: { onPasswordSet?: () => void }) {
  const t = useTranslations('auth.security.setPassword');
  const { refreshUser } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isReauthOpen, setIsReauthOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordFormInput>({
    resolver: zodResolver(setPasswordFormSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const doSubmit = async (data: SetPasswordFormInput) => {
    setServerError(null);
    setSuccessMessage(null);

    try {
      const response = await apiClient<{ message: string }>('/api/auth/set-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          password: data.password,
        }),
      });

      setSuccessMessage(response.message || t('successNotice'));
      reset();
      await refreshUser();
      if (onPasswordSet) {
        onPasswordSet();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'REAUTHENTICATION_REQUIRED') {
          setIsReauthOpen(true);
          return;
        }
        setServerError(err.message);
      } else {
        setServerError(t('genericError'));
      }
    }
  };

  const handleReauthSuccess = () => {
    // Retry submission with the entered values
    const currentValues = getValues();
    if (currentValues.password && currentValues.confirmPassword) {
      void doSubmit(currentValues);
    }
  };

  return (
    <>
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

          <form onSubmit={handleSubmit(doSubmit)} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="new-password">{t('newPasswordLabel')}</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                disabled={isSubmitting}
                {...register('password')}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t('confirmPasswordLabel')}</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                disabled={isSubmitting}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('submitting')}
                </>
              ) : (
                t('submitButton')
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ReauthDialog
        isOpen={isReauthOpen}
        onClose={() => setIsReauthOpen(false)}
        onSuccess={handleReauthSuccess}
        hasPassword={false}
        hasGoogle={true}
      />
    </>
  );
}
