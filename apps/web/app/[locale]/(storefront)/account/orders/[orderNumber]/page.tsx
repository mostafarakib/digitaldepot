import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthGuard } from '@/components/auth/auth-guard';
import { OrderDetailView } from '@/components/account/order-detail-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; orderNumber: string }>;
}): Promise<Metadata> {
  const { locale, orderNumber } = await params;
  const t = await getTranslations({ locale, namespace: 'orders.details' });
  return {
    title: `${t('pageTitle')} #${orderNumber} | DigitalDepot`,
    description: t('pageSubtitle', { orderNumber }),
  };
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; orderNumber: string }>;
}) {
  const { orderNumber } = await params;

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-5xl">
      <AuthGuard returnUrl={`/account/orders/${orderNumber}`}>
        <OrderDetailView orderNumber={orderNumber} />
      </AuthGuard>
    </div>
  );
}
