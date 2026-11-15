import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { env } from '@/lib/config';
import { ProductListing } from '@/components/storefront/product-listing';
import { buildPageAlternates } from '@/lib/seo';
import type { StorefrontProductListingResponse, CategoryTreeNode } from '@/lib/catalogue-types';

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

  // Clarification 2: Query-based filters are duplicate-content views with canonical pointing to /products.
  // Search query results must not be indexed to prevent index bloat.
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

  // Ensure default limit if omitted
  if (!query.has('limit')) {
    query.set('limit', '12');
  }

  // Fetch published products and categories in parallel
  const [productsRes, categoriesRes] = await Promise.all([
    fetch(`${env.serverApiUrl}/api/v1/products?${query.toString()}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    }),
    fetch(`${env.serverApiUrl}/api/v1/categories/tree`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    }),
  ]);

  let listingData: StorefrontProductListingResponse = {
    products: [],
    facets: { categories: [], brands: [], priceRange: { min: 0, max: 0 } },
    pagination: {
      page: 1,
      limit: 12,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
    },
  };

  let categories: CategoryTreeNode[] = [];

  if (productsRes.ok) {
    const json = await productsRes.json();
    if (json.success) {
      listingData = {
        products: json.data || [],
        facets: json.facets || { categories: [], brands: [], priceRange: { min: 0, max: 0 } },
        pagination: json.pagination || listingData.pagination,
      };
    }
  }

  if (categoriesRes.ok) {
    const json = await categoriesRes.json();
    if (json.success && Array.isArray(json.data)) {
      categories = json.data;
    }
  }

  return <ProductListing initialData={listingData} categories={categories} />;
}
