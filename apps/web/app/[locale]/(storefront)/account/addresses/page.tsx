'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { AuthGuard } from '@/components/auth/auth-guard';
import { useAuth } from '@/components/auth/auth-provider';
import { AddressManager } from '@/components/account/address-manager';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, MapPin, ShieldCheck } from 'lucide-react';

function AddressesPageContent() {
  const tProfile = useTranslations('auth.profile');
  const { user } = useAuth();

  // Defensive guard for admin users visiting customer delivery addresses route
  if (user?.role === 'ADMIN') {
    return (
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold">{tProfile('adminNoticeTitle')}</CardTitle>
          </div>
          <CardDescription>{tProfile('adminNoticeDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button asChild variant="outline">
            <Link href="/account">{tProfile('backToAccount')}</Link>
          </Button>
          <Button asChild>
            <Link href="/admin">{tProfile('goToAdminPortal')}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <AddressManager />;
}

export default function AccountAddressesPage() {
  const t = useTranslations('auth.addresses');

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-5xl">
      <AuthGuard returnUrl="/account/addresses">
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
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 text-foreground">
                <MapPin className="h-7 w-7 text-primary" />
                {t('pageTitle')}
              </h1>
              <p className="text-sm text-muted-foreground">{t('pageSubtitle')}</p>
            </div>
          </div>

          <AddressesPageContent />
        </div>
      </AuthGuard>
    </div>
  );
}
