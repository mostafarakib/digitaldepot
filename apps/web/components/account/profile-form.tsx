'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  profileFormSchema,
  type ProfileFormInput,
  buildProfileUpdatePayload,
} from '@/lib/auth-schemas';
import { useAuth } from '@/components/auth/auth-provider';
import { apiClient, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useRouter } from '@/i18n/routing';

export function ProfileForm() {
  const t = useTranslations('auth.profile');
  const { user, refreshUser } = useAuth();
  const router = useRouter();

  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormInput>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      firstName: user?.profile?.firstName ?? '',
      lastName: user?.profile?.lastName ?? '',
      phone: user?.profile?.phone ?? '',
    },
  });

  // Re-sync form default values if user auth state updates or loads asynchronously
  useEffect(() => {
    if (user?.profile) {
      reset({
        firstName: user.profile.firstName ?? '',
        lastName: user.profile.lastName ?? '',
        phone: user.profile.phone ?? '',
      });
    }
  }, [user, reset]);

  const onSubmit = async (data: ProfileFormInput) => {
    setServerError(null);
    setSuccessMessage(null);

    const payload = buildProfileUpdatePayload(data);

    try {
      await apiClient('/api/account/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError(t('genericError'));
      }
      return;
    }

    // Backend update succeeded: report success to the user
    setSuccessMessage(t('successNotice'));

    // Separate client-state refresh: failure to re-fetch in-memory user
    // must never mark the successful profile update as failed
    try {
      await refreshUser();
    } catch {
      // Background synchronization error is safely ignored
      // so the confirmed backend change remains successfully indicated.
    }
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-semibold">{t('cardTitle')}</CardTitle>
        </div>
        <CardDescription>{t('cardDescription')}</CardDescription>
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
          {/* Read-only Email Field */}
          <div className="space-y-1">
            <Label htmlFor="email" className="text-muted-foreground">
              {t('emailLabel')}
            </Label>
            <Input
              id="email"
              type="email"
              value={user?.email ?? ''}
              disabled
              readOnly
              className="bg-muted cursor-not-allowed opacity-80"
            />
            <p className="text-xs text-muted-foreground">{t('emailReadOnlyNotice')}</p>
          </div>

          {/* First Name & Last Name Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="firstName">{t('firstNameLabel')}</Label>
              <Input
                id="firstName"
                type="text"
                autoComplete="given-name"
                placeholder={t('firstNamePlaceholder')}
                {...register('firstName')}
                disabled={isSubmitting}
              />
              {errors.firstName && (
                <p className="text-xs text-destructive">{errors.firstName.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="lastName">{t('lastNameLabel')}</Label>
              <Input
                id="lastName"
                type="text"
                autoComplete="family-name"
                placeholder={t('lastNamePlaceholder')}
                {...register('lastName')}
                disabled={isSubmitting}
              />
              {errors.lastName && (
                <p className="text-xs text-destructive">{errors.lastName.message}</p>
              )}
            </div>
          </div>

          {/* Phone Field */}
          <div className="space-y-1">
            <Label htmlFor="phone">{t('phoneLabel')}</Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder={t('phonePlaceholder')}
              {...register('phone')}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">{t('phoneHelpText')}</p>
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => router.push('/account')}
            >
              {t('cancelButton')}
            </Button>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {t('savingButton')}
                </>
              ) : (
                t('saveButton')
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
