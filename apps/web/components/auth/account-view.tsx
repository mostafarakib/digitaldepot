'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from './auth-provider';
import { useRouter, Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  User,
  Mail,
  Phone,
  ShieldCheck,
  LogOut,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Shield,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export function AccountView() {
  const t = useTranslations('auth.account');
  const tVerify = useTranslations('auth.verifyEmail');
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle');

  if (!user) {
    return null;
  }

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      router.push('/');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleResendVerification = async () => {
    setIsResending(true);
    setResendStatus('idle');
    try {
      await apiClient('/api/auth/resend-verification', { method: 'POST' });
      setResendStatus('success');
    } catch {
      setResendStatus('error');
    } finally {
      setIsResending(false);
    }
  };

  const fullName = user.profile
    ? `${user.profile.firstName} ${user.profile.lastName}`.trim()
    : user.email.split('@')[0];

  return (
    <div className="space-y-6">
      {!user.emailVerified && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  {tVerify('accountWarningTitle')}
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {tVerify('accountWarningDescription')}
                </p>
              </div>
            </div>

            <div className="shrink-0 self-start sm:self-center">
              {resendStatus === 'success' ? (
                <span className="flex items-center gap-1 text-green-700 dark:text-green-400 font-medium text-xs">
                  <CheckCircle2 className="h-4 w-4" />
                  {tVerify('resendSuccessShort')}
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleResendVerification}
                  disabled={isResending}
                  className="border-amber-300 dark:border-amber-700 text-xs h-8 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                >
                  {isResending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      {tVerify('sending')}
                    </>
                  ) : (
                    tVerify('resendButton')
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          {user.role === 'ADMIN' && (
            <Button asChild variant="outline" className="gap-2">
              <Link href="/admin">
                <ShieldCheck className="h-4 w-4 text-primary" />
                {t('adminPortalCta')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}

          <Button
            variant="destructive"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="gap-2"
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('loggingOut')}
              </>
            ) : (
              <>
                <LogOut className="h-4 w-4" />
                {t('logoutButton')}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">{t('personalInfoTitle')}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t('nameLabel')}</p>
                <p className="text-sm font-medium">{fullName}</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{t('emailLabel')}</p>
                  <p className="text-sm font-medium">{user.email}</p>
                </div>
              </div>
              <div>
                {user.emailVerified ? (
                  <Badge
                    variant="outline"
                    className="border-green-600 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20 gap-1 text-xs"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {tVerify('statusVerified')}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-500 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 gap-1 text-xs"
                  >
                    <AlertCircle className="h-3 w-3" />
                    {tVerify('statusUnverified')}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <Phone className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t('phoneLabel')}</p>
                <p className="text-sm font-medium">{user.profile?.phone || t('notProvided')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">{t('roleLabel')}</CardTitle>
              <CardDescription>Security and access privileges</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {user.role === 'ADMIN' ? t('adminRole') : t('customerRole')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user.role === 'ADMIN'
                      ? 'Authorized to manage store operations and catalog'
                      : 'Standard customer privileges for orders and browsing'}
                  </p>
                </div>
                <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>{user.role}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                {t('securityTitle')}
              </CardTitle>
              <CardDescription>{t('securityDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full justify-between">
                <Link href="/account/security">
                  <span className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    {t('manageSecurityCta')}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
