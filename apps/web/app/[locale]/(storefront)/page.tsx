import React from 'react';
import { env } from '@/lib/config';
import { HeroSection } from '@/components/storefront/home/hero-section';
import { ValueProps } from '@/components/storefront/home/value-props';
import { FeaturedCategories } from '@/components/storefront/home/featured-categories';
import { FeaturedProducts } from '@/components/storefront/home/featured-products';
import { PromoBanner } from '@/components/storefront/home/promo-banner';
import { NewArrivals } from '@/components/storefront/home/new-arrivals';
import type { StorefrontProductSummary } from '@/lib/catalogue-types';

async function getHomeProducts(): Promise<{
  featured: StorefrontProductSummary[];
  newest: StorefrontProductSummary[];
}> {
  try {
    const [featRes, newRes] = await Promise.all([
      fetch(`${env.serverApiUrl}/api/v1/products?featured=true&limit=4`, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      }),
      fetch(`${env.serverApiUrl}/api/v1/products?sort=newest&limit=4`, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      }),
    ]);

    const featured = featRes.ok ? ((await featRes.json()).data as StorefrontProductSummary[]) : [];
    const newest = newRes.ok ? ((await newRes.json()).data as StorefrontProductSummary[]) : [];

    return { featured, newest };
  } catch {
    return { featured: [], newest: [] };
  }
}

export default async function StorefrontHomePage() {
  const { featured, newest } = await getHomeProducts();

  return (
    <div className="space-y-4">
      <HeroSection />
      <ValueProps />
      <FeaturedCategories />
      <FeaturedProducts products={featured} />
      <PromoBanner />
      <NewArrivals products={newest} />
    </div>
  );
}
