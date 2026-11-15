import type { MetadataRoute } from 'next';
import { env } from '@/lib/config';

interface ProductSitemapItem {
  slug: string;
  updatedAt?: string;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = env.storefrontOrigin;
  const now = new Date();

  // Core indexable canonical routes
  const entries: MetadataRoute.Sitemap = [
    {
      url: `${origin}/en`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
      alternates: {
        languages: {
          en: `${origin}/en`,
          bn: `${origin}/bn`,
          'x-default': `${origin}/en`,
        },
      },
    },
    {
      url: `${origin}/en/products`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
      alternates: {
        languages: {
          en: `${origin}/en/products`,
          bn: `${origin}/bn/products`,
          'x-default': `${origin}/en/products`,
        },
      },
    },
  ];

  try {
    // Fetch published products for inclusion in sitemap
    const res = await fetch(`${env.serverApiUrl}/api/v1/products?limit=1000`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });

    if (res.ok) {
      const json = await res.json();
      const products: ProductSitemapItem[] = Array.isArray(json.data) ? json.data : [];

      for (const product of products) {
        if (!product.slug) continue;

        entries.push({
          url: `${origin}/en/products/${product.slug}`,
          lastModified: product.updatedAt ? new Date(product.updatedAt) : now,
          changeFrequency: 'daily',
          priority: 0.8,
          alternates: {
            languages: {
              en: `${origin}/en/products/${product.slug}`,
              bn: `${origin}/bn/products/${product.slug}`,
              'x-default': `${origin}/en/products/${product.slug}`,
            },
          },
        });
      }
    }
  } catch {
    // Fail-safe: if backend is unreachable, gracefully return core entries
  }

  return entries;
}
