import React from 'react';
import { env } from '@/lib/config';
import { ProductListing } from '@/components/storefront/product-listing';
import type { StorefrontProductListingResponse, CategoryTreeNode } from '@/lib/catalogue-types';

interface ProductsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
