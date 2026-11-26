import React from 'react';
import { StorefrontShell } from '@/components/storefront/storefront-shell';
import { getPublicCategoryTree, getPublicStoreSettings } from '@/lib/storefront-server';

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const [categories, settings] = await Promise.all([
    getPublicCategoryTree(),
    getPublicStoreSettings(),
  ]);

  return (
    <StorefrontShell categories={categories} settings={settings}>
      {children}
    </StorefrontShell>
  );
}
