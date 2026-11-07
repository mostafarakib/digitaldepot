import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { Loader2, AlertCircle } from 'lucide-react';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.resetPassword' });
  return {
    title: t('title'),
    description: t('subtitle'),
  };
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'auth.resetPassword' });

  if (!token || token.trim().length === 0) {
    return (
      <div className="container mx-auto flex min-h-[calc(100vh-280px)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md shadow-md">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold tracking-tight text-destructive">
              {t('invalidLinkTitle')}
            </CardTitle>
            <CardDescription>{t('invalidLinkNotice')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center p-4">
              <div className="rounded-full bg-destructive/10 p-4">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <Button asChild className="w-full">
              <Link href="/forgot-password">{t('requestNewLinkButton')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto flex min-h-[calc(100vh-280px)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md shadow-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={
              <div className="flex h-56 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <ResetPasswordForm token={token} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
