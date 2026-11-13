import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthGuard } from '@/components/auth/auth-guard';
import { ReturnHistoryView } from '@/components/account/return-history-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'returns' });
  return {
    title: `${t('pageTitle')} | DigitalDepot`,
    description: t('pageSubtitle'),
  };
}

export default function AccountReturnsPage() {
  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-5xl">
      <AuthGuard returnUrl="/account/returns">
        <ReturnHistoryView />
      </AuthGuard>
    </div>
  );
}
