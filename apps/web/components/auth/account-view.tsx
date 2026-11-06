'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from './auth-provider';
import { useRouter, Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Mail, Phone, ShieldCheck, LogOut, ArrowRight, Loader2 } from 'lucide-react';

export function AccountView() {
  const t = useTranslations('auth.account');
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  const fullName = user.profile
    ? `${user.profile.firstName} ${user.profile.lastName}`.trim()
    : user.email.split('@')[0];

  return (
    <div className="space-y-6">
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

            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t('emailLabel')}</p>
                <p className="text-sm font-medium">{user.email}</p>
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
      </div>
    </div>
  );
}
