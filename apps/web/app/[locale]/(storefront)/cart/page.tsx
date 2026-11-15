import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CartPageView } from '@/components/storefront/cart/cart-page-view';
import { buildNoIndexRobots } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'cart' });

  return {
    title: t('title'),
    robots: buildNoIndexRobots(),
  };
}

export default function CartPage() {
  return <CartPageView />;
}
