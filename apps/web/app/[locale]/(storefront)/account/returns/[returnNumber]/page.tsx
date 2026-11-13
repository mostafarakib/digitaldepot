import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthGuard } from '@/components/auth/auth-guard';
import { ReturnDetailView } from '@/components/account/return-detail-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; returnNumber: string }>;
}): Promise<Metadata> {
  const { locale, returnNumber } = await params;
  const t = await getTranslations({ locale, namespace: 'returns.details' });
  return {
    title: `${t('pageTitle')} #${returnNumber} | DigitalDepot`,
    description: t('pageSubtitle', { returnNumber }),
  };
}

export default async function ReturnDetailPage({
  params,
}: {
  params: Promise<{ locale: string; returnNumber: string }>;
}) {
  const { returnNumber } = await params;

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-5xl">
      <AuthGuard returnUrl={`/account/returns/${returnNumber}`}>
        <ReturnDetailView returnNumber={returnNumber} />
      </AuthGuard>
    </div>
  );
}
