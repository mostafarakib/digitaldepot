import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthGuard } from '@/components/auth/auth-guard';
import { AccountView } from '@/components/auth/account-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.account' });
  return {
    title: t('title'),
    description: t('subtitle'),
  };
}

export default function AccountPage() {
  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <AuthGuard returnUrl="/account">
        <AccountView />
      </AuthGuard>
    </div>
  );
}

