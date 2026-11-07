'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useAuth } from './auth-provider';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, Loader2, Mail, ArrowRight } from 'lucide-react';

export function VerifyEmailContent() {
  const t = useTranslations('auth.verifyEmail');
  const searchParams = useSearchParams();
  const { user, refreshUser, isAuthenticated } = useAuth();

  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'idle'>(() =>
    searchParams.get('token') ? 'verifying' : 'idle',
  );
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Resend form state
  const [resendEmail, setResendEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState('');

  const hasExecutedRef = useRef(false);

  useEffect(() => {
    if (hasExecutedRef.current) return;

    const token = searchParams.get('token');

    if (token) {
      hasExecutedRef.current = true;

      // Privacy safeguard: Scrub token immediately from the browser URL bar & history
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      apiClient<{ message: string; emailVerified: boolean }>('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
        .then(async () => {
          setStatus('success');
          // If currently authenticated, refresh authoritative user state to instantly dismiss banners
          if (isAuthenticated) {
            await refreshUser();
          }
        })
        .catch((err: unknown) => {
          setStatus('error');
          const message = err instanceof Error && err.message ? err.message : t('invalidOrExpired');
          setErrorMessage(message);
        });
    }
  }, [searchParams, isAuthenticated, refreshUser, t]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsResending(true);
    setResendSuccess(false);
    setResendError('');

    try {
      const email = isAuthenticated ? undefined : resendEmail.trim().toLowerCase();
      await apiClient('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setResendSuccess(true);
    } catch {
      setResendError(t('resendFailed'));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md shadow-lg border-border">
        {status === 'verifying' && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
              <CardTitle className="text-xl font-bold">{t('verifyingTitle')}</CardTitle>
              <CardDescription>{t('verifyingSubtitle')}</CardDescription>
            </CardHeader>
          </>
        )}

        {status === 'success' && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/50 mb-2">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-xl font-bold text-green-700 dark:text-green-400">
                {t('successTitle')}
              </CardTitle>
              <CardDescription className="text-sm mt-1">{t('successDescription')}</CardDescription>
            </CardHeader>
            <CardFooter className="flex flex-col gap-2">
              <Button asChild className="w-full gap-2">
                <Link href={isAuthenticated ? '/account' : '/login'}>
                  {isAuthenticated ? t('goToAccount') : t('signIn')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/">{t('continueShopping')}</Link>
              </Button>
            </CardFooter>
          </>
        )}

        {status === 'error' && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50 mb-2">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle className="text-xl font-bold text-destructive">
                {t('errorTitle')}
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                {errorMessage || t('invalidOrExpired')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2 border-t border-border mt-2">
              <p className="text-xs text-muted-foreground text-center">
                {t('requestNewLinkPrompt')}
              </p>

              {resendSuccess ? (
                <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-center text-xs text-green-800 dark:text-green-300">
                  <CheckCircle2 className="h-4 w-4 inline mr-1 text-green-600" />
                  {t('resendSuccessGeneric')}
                </div>
              ) : (
                <form onSubmit={handleResend} className="space-y-3">
                  {!isAuthenticated && (
                    <div className="space-y-1">
                      <Label htmlFor="resend-email" className="text-xs">
                        {t('emailLabel')}
                      </Label>
                      <Input
                        id="resend-email"
                        type="email"
                        required
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="text-sm"
                      />
                    </div>
                  )}

                  {resendError && (
                    <p className="text-xs text-destructive text-center">{resendError}</p>
                  )}

                  <Button type="submit" disabled={isResending} className="w-full text-xs h-9">
                    {isResending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        {t('sending')}
                      </>
                    ) : (
                      t('sendNewLinkButton')
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
            <CardFooter>
              <Button asChild variant="ghost" className="w-full text-xs">
                <Link href="/">{t('backToHome')}</Link>
              </Button>
            </CardFooter>
          </>
        )}

        {status === 'idle' && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-2">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-xl font-bold">{t('requestVerificationTitle')}</CardTitle>
              <CardDescription>{t('requestVerificationSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent>
              {resendSuccess ? (
                <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-center text-xs text-green-800 dark:text-green-300">
                  <CheckCircle2 className="h-4 w-4 inline mr-1 text-green-600" />
                  {t('resendSuccessGeneric')}
                </div>
              ) : (
                <form onSubmit={handleResend} className="space-y-4">
                  {!isAuthenticated && (
                    <div className="space-y-1">
                      <Label htmlFor="idle-email">{t('emailLabel')}</Label>
                      <Input
                        id="idle-email"
                        type="email"
                        required
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        placeholder="you@example.com"
                      />
                    </div>
                  )}

                  {resendError && (
                    <p className="text-xs text-destructive text-center">{resendError}</p>
                  )}

                  <Button type="submit" disabled={isResending} className="w-full">
                    {isResending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {t('sending')}
                      </>
                    ) : (
                      t('sendVerificationLink')
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
            <CardFooter>
              <Button asChild variant="ghost" className="w-full text-sm">
                <Link href="/">{t('backToHome')}</Link>
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}
