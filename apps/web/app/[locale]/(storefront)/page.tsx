import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { env } from '@/lib/config';
import { HeroSection } from '@/components/storefront/home/hero-section';
import { ValueProps } from '@/components/storefront/home/value-props';
import { FeaturedCategories } from '@/components/storefront/home/featured-categories';
import { FeaturedProducts } from '@/components/storefront/home/featured-products';
import { PromoBanner } from '@/components/storefront/home/promo-banner';
import { NewArrivals } from '@/components/storefront/home/new-arrivals';
import { JsonLd } from '@/components/seo/json-ld';
import { buildPageAlternates, buildWebSiteJsonLd, buildOrganizationJsonLd } from '@/lib/seo';
import type { StorefrontProductSummary } from '@/lib/catalogue-types';
import type { PublicStoreSettings } from '@/lib/settings-types';

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });

  return {
    title: {
      absolute: t('defaultTitle'),
    },
    description: t('homeDescription'),
    alternates: buildPageAlternates('/', locale),
    openGraph: {
      title: t('defaultTitle'),
      description: t('homeDescription'),
      url: `/${locale}`,
    },
    twitter: {
      title: t('defaultTitle'),
      description: t('homeDescription'),
    },
  };
}

async function getStoreSettings(): Promise<PublicStoreSettings | null> {
  try {
    const res = await fetch(`${env.serverApiUrl}/api/v1/store/settings`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? (json.data as PublicStoreSettings) : null;
  } catch {
    return null;
  }
}

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

export default async function StorefrontHomePage({ params }: HomePageProps) {
  const { locale } = await params;
  const [{ featured, newest }, settings] = await Promise.all([
    getHomeProducts(),
    getStoreSettings(),
  ]);

  const websiteJsonLd = buildWebSiteJsonLd(locale, env.storefrontOrigin);
  const organizationJsonLd = buildOrganizationJsonLd(settings, env.storefrontOrigin);

  return (
    <div className="space-y-4">
      <JsonLd data={websiteJsonLd} />
      <JsonLd data={organizationJsonLd} />
      <HeroSection />
      <ValueProps />
      <FeaturedCategories />
      <FeaturedProducts products={featured} />
      <PromoBanner />
      <NewArrivals products={newest} />
    </div>
  );
}
