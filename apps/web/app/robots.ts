import type { MetadataRoute } from 'next';
import { env } from '@/lib/config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/en',
          '/bn',
          '/en/products',
          '/bn/products',
          '/en/products/*',
          '/bn/products/*',
        ],
        disallow: [
          '/api/',
          '/*/admin',
          '/*/admin/*',
          '/*/account',
          '/*/account/*',
          '/*/cart',
          '/*/checkout',
          '/*/checkout/*',
          '/*/wishlist',
          '/*/login',
          '/*/register',
          '/*/forgot-password',
          '/*/reset-password',
          '/*/verify-email',
          '/*/confirm-link',
          '/*/status',
        ],
      },
    ],
    sitemap: `${env.storefrontOrigin}/sitemap.xml`,
  };
}
