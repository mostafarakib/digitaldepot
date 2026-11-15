import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthGuard } from '@/components/auth/auth-guard';
import { NotificationsView } from '@/components/notifications/notifications-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'notifications' });
  return {
    title: t('pageTitle'),
    description: t('pageDescription'),
  };
}

export default function AccountNotificationsPage() {
  return (
    <AuthGuard returnUrl="/account/notifications">
      <NotificationsView />
    </AuthGuard>
  );
}
