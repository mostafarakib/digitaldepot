import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthGuard } from '@/components/auth/auth-guard';
import { PaymentResultView } from '@/components/storefront/checkout/payment-result-view';
import { buildNoIndexRobots } from '@/lib/seo';

interface PaymentResultPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    orderNumber?: string;
    status?: string;
    reason?: string;
  }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'paymentResult' });

  return {
    title: t('paymentSuccessTitle'),
    robots: buildNoIndexRobots(),
  };
}

export default async function PaymentResultPage({ searchParams }: PaymentResultPageProps) {
  const resolvedParams = await searchParams;

  return (
    <AuthGuard returnUrl="/checkout">
      <PaymentResultView
        orderNumber={resolvedParams.orderNumber}
        status={resolvedParams.status}
        reason={resolvedParams.reason}
      />
    </AuthGuard>
  );
}
