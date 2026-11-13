import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthGuard } from '@/components/auth/auth-guard';
import { OrderHistoryView } from '@/components/account/order-history-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'orders' });
  return {
    title: `${t('pageTitle')} | DigitalDepot`,
    description: t('pageSubtitle'),
  };
}

export default function AccountOrdersPage() {
  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-5xl">
      <AuthGuard returnUrl="/account/orders">
        <OrderHistoryView />
      </AuthGuard>
    </div>
  );
}
