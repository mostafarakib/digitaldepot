'use client';

import React, { useState, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { AuthGuard } from '@/components/auth/auth-guard';
import { useAuth } from '@/components/auth/auth-provider';
import { ChangePasswordForm } from '@/components/account/change-password-form';
import { SetPasswordForm } from '@/components/account/set-password-form';
import { OAuthProviders } from '@/components/account/oauth-providers';
import { SessionList } from '@/components/account/session-list';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

function SecurityContent() {
  const t = useTranslations('auth.security');
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [sessionsRefreshKey, setSessionsRefreshKey] = useState(0);

  const handlePasswordChanged = () => {
    // When password change/set occurs, refresh session list
    setSessionsRefreshKey((prev) => prev + 1);
  };

  let statusMessage: { type: 'success' | 'error'; message: string } | null = null;
  if (searchParams.get('linked') === 'true') {
    statusMessage = { type: 'success', message: t('oauth.linkSuccess') };
  } else if (searchParams.get('reauth') === 'true') {
    statusMessage = { type: 'success', message: 'Identity confirmed successfully.' };
  } else if (searchParams.get('error')) {
    statusMessage = { type: 'error', message: searchParams.get('error')! };
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button asChild variant="ghost" size="sm" className="h-7 px-2 -ml-2 text-xs">
              <Link href="/account">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                {t('backToAccount')}
              </Link>
            </Button>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-primary" />
            {t('pageTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('pageSubtitle')}</p>
        </div>
      </div>

      <div className="space-y-8">
        {user?.hasPassword ? (
          <ChangePasswordForm onPasswordChanged={handlePasswordChanged} />
        ) : (
          <SetPasswordForm onPasswordSet={handlePasswordChanged} />
        )}
        <OAuthProviders statusMessage={statusMessage} />
        <SessionList refreshKey={sessionsRefreshKey} />
      </div>
    </div>
  );
}

export default function AccountSecurityPage() {
  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-4xl">
      <AuthGuard returnUrl="/account/security">
        <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-muted/40" />}>
          <SecurityContent />
        </Suspense>
      </AuthGuard>
    </div>
  );
}
