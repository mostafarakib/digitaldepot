import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthGuard } from '@/components/auth/auth-guard';
import { WishlistView } from '@/components/storefront/wishlist/wishlist-view';
import { buildNoIndexRobots } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'wishlist' });

  return {
    title: t('title'),
    robots: buildNoIndexRobots(),
  };
}

export default function WishlistPage() {
  return (
    <AuthGuard returnUrl="/wishlist">
      <WishlistView />
    </AuthGuard>
  );
}
