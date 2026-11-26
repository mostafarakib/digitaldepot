import { env } from '@/lib/config';
import type { CategoryTreeNode, StorefrontProductListingResponse } from '@/lib/catalogue-types';
import type { PublicStoreSettings } from '@/lib/settings-types';

const JSON_HEADERS = { accept: 'application/json' } as const;

export async function getPublicStoreSettings(): Promise<PublicStoreSettings | null> {
  try {
    const res = await fetch(`${env.serverApiUrl}/api/v1/store/settings`, {
      cache: 'no-store',
      headers: JSON_HEADERS,
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? (json.data as PublicStoreSettings) : null;
  } catch {
    return null;
  }
}

export async function getPublicCategoryTree(): Promise<CategoryTreeNode[]> {
  try {
    const res = await fetch(`${env.serverApiUrl}/api/v1/categories/tree`, {
      cache: 'no-store',
      headers: JSON_HEADERS,
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.success && Array.isArray(json.data) ? (json.data as CategoryTreeNode[]) : [];
  } catch {
    return [];
  }
}

export async function getPublicProducts(
  query: URLSearchParams | string,
): Promise<StorefrontProductListingResponse> {
  const empty: StorefrontProductListingResponse = {
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

  try {
    const qs = typeof query === 'string' ? query : query.toString();
    const res = await fetch(`${env.serverApiUrl}/api/v1/products?${qs}`, {
      cache: 'no-store',
      headers: JSON_HEADERS,
    });
    if (!res.ok) return empty;
    const json = await res.json();
    if (!json.success) return empty;
    return {
      products: Array.isArray(json.data) ? json.data : [],
      facets: json.facets || empty.facets,
      pagination: json.pagination || empty.pagination,
    };
  } catch {
    return empty;
  }
}

/**
 * Filters out unconfigured placeholder contact defaults so customers never see dummy contact details.
 */
export function getConfiguredStoreContact(settings?: PublicStoreSettings | null) {
  if (!settings) {
    return {
      storeAddress: null,
      supportEmail: null,
      supportPhone: null,
      supportHours: null,
    };
  }

  const email = settings.supportEmail?.trim() || null;
  const phone = settings.supportPhone?.trim() || null;
  const address = settings.storeAddress?.trim() || null;
  const hours = settings.supportHours?.trim() || null;

  const isPlaceholderEmail =
    !email || email.endsWith('.local') || email === 'support@example.com';
  const isPlaceholderPhone =
    !phone || phone.replace(/\D/g, '').endsWith('000000');

  return {
    storeAddress: address,
    supportEmail: isPlaceholderEmail ? null : email,
    supportPhone: isPlaceholderPhone ? null : phone,
    supportHours: hours,
  };
}
