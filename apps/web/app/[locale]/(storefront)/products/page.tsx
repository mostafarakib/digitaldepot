import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getPublicCategoryTree, getPublicProducts } from '@/lib/storefront-server';
import { ProductListing } from '@/components/storefront/product-listing';
import { buildPageAlternates } from '@/lib/seo';

interface ProductsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
  searchParams,
}: ProductsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const resolvedParams = await searchParams;
  const t = await getTranslations({ locale, namespace: 'seo' });

  let title = t('catalogTitle');
  let description = t('catalogDescription');
  let isSearch = false;

  const q = resolvedParams.q;
  const category = resolvedParams.category;
  const brand = resolvedParams.brand;

  if (typeof q === 'string' && q.trim()) {
    title = t('searchTitle', { query: q.trim() });
    description = t('searchDescription', { query: q.trim() });
    isSearch = true;
  } else if (typeof category === 'string' && category.trim()) {
    title = t('categoryTitle', { category: category.trim() });
    description = t('categoryDescription', { category: category.trim() });
  } else if (typeof brand === 'string' && brand.trim()) {
    title = t('brandTitle', { brand: brand.trim() });
    description = t('brandDescription', { brand: brand.trim() });
  }

  return {
    title,
    description,
    alternates: buildPageAlternates('/products', locale),
    robots: isSearch ? { index: false, follow: true } : undefined,
    openGraph: {
      title,
      description,
      url: `/${locale}/products`,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const resolvedParams = await searchParams;
  const query = new URLSearchParams();

  for (const [key, val] of Object.entries(resolvedParams)) {
    if (typeof val === 'string') {
      query.set(key, val);
    } else if (Array.isArray(val) && val.length > 0) {
      query.set(key, val.join(','));
    }
  }

  if (!query.has('limit')) {
    query.set('limit', '12');
  }

  const [listingData, categories] = await Promise.all([
    getPublicProducts(query),
    getPublicCategoryTree(),
  ]);

  return <ProductListing initialData={listingData} categories={categories} />;
}
