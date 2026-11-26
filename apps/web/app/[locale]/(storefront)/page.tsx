import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { env } from '@/lib/config';
import {
  getPublicCategoryTree,
  getPublicProducts,
  getPublicStoreSettings,
} from '@/lib/storefront-server';
import { HeroSection } from '@/components/storefront/home/hero-section';
import { ValueProps } from '@/components/storefront/home/value-props';
import { FeaturedCategories } from '@/components/storefront/home/featured-categories';
import { FeaturedProducts } from '@/components/storefront/home/featured-products';
import { PromoBanner } from '@/components/storefront/home/promo-banner';
import { NewArrivals } from '@/components/storefront/home/new-arrivals';
import { JsonLd } from '@/components/seo/json-ld';
import { buildPageAlternates, buildWebSiteJsonLd, buildOrganizationJsonLd } from '@/lib/seo';
import type { StorefrontProductSummary } from '@/lib/catalogue-types';

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

function pickProductByPreferredSlug(
  products: StorefrontProductSummary[],
  preferredSlug: string,
): StorefrontProductSummary | null {
  return (
    products.find((p) => p.slug === preferredSlug && p.primaryImage?.url) ||
    products.find((p) => p.primaryImage?.url) ||
    null
  );
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

export default async function StorefrontHomePage({ params }: HomePageProps) {
  const { locale } = await params;

  const [featuredRes, newestRes, laptopsRes, headphonesRes, categories, settings] =
    await Promise.all([
      getPublicProducts('featured=true&limit=8'),
      getPublicProducts('sort=newest&limit=4'),
      getPublicProducts('category=laptops&limit=4'),
      getPublicProducts('category=headphones&limit=4'),
      getPublicCategoryTree(),
      getPublicStoreSettings(),
    ]);

  const laptopProduct = pickProductByPreferredSlug(
    laptopsRes.products,
    'asus-rog-zephyrus-g14-oled',
  );
  const headphoneProduct = pickProductByPreferredSlug(
    headphonesRes.products,
    'anker-soundcore-space-one',
  );

  const websiteJsonLd = buildWebSiteJsonLd(locale, env.storefrontOrigin);
  const organizationJsonLd = buildOrganizationJsonLd(settings, env.storefrontOrigin);

  return (
    <div className="space-y-2 pb-8">
      <JsonLd data={websiteJsonLd} />
      <JsonLd data={organizationJsonLd} />
      <HeroSection laptopProduct={laptopProduct} headphoneProduct={headphoneProduct} />
      <ValueProps settings={settings} />
      <FeaturedCategories categories={categories} />
      <FeaturedProducts products={featuredRes.products} />
      <PromoBanner />
      <NewArrivals products={newestRes.products} />
    </div>
  );
}
