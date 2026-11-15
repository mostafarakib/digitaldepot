import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthGuard } from '@/components/auth/auth-guard';
import { OrderConfirmationView } from '@/components/storefront/checkout/order-confirmation-view';
import { buildNoIndexRobots } from '@/lib/seo';

interface OrderConfirmationPageProps {
  params: Promise<{
    locale: string;
    orderNumber: string;
  }>;
}

export async function generateMetadata({ params }: OrderConfirmationPageProps): Promise<Metadata> {
  const { locale, orderNumber } = await params;
  const t = await getTranslations({ locale, namespace: 'confirmation' });

  return {
    title: `${t('pageTitle')} #${orderNumber}`,
    robots: buildNoIndexRobots(),
  };
}

export default async function OrderConfirmationPage({ params }: OrderConfirmationPageProps) {
  const { orderNumber } = await params;

  return (
    <AuthGuard returnUrl={`/checkout/confirmation/${encodeURIComponent(orderNumber)}`}>
      <OrderConfirmationView orderNumber={orderNumber} />
    </AuthGuard>
  );
}
