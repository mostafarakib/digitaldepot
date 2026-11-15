import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthGuard } from '@/components/auth/auth-guard';
import { CheckoutView } from '@/components/storefront/checkout/checkout-view';
import { buildNoIndexRobots } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'checkout' });

  return {
    title: t('checkoutPageTitle'),
    description: t('checkoutPageSubtitle'),
    robots: buildNoIndexRobots(),
  };
}

export default function CheckoutPage() {
  return (
    <AuthGuard returnUrl="/checkout">
      <CheckoutView />
    </AuthGuard>
  );
}
