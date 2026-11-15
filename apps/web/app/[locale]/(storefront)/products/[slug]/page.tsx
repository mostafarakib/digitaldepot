import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { env } from '@/lib/config';
import { ProductDetailView } from '@/components/storefront/product-detail-view';
import { JsonLd } from '@/components/seo/json-ld';
import {
  buildPageAlternates,
  buildNoIndexRobots,
  buildProductJsonLd,
  buildBreadcrumbJsonLd,
} from '@/lib/seo';
import type { StorefrontProductDetail } from '@/lib/catalogue-types';

interface ProductDetailPageProps {
  params: Promise<{ slug: string; locale: string }>;
}

async function getProduct(slug: string): Promise<StorefrontProductDetail | null> {
  try {
    const res = await fetch(`${env.serverApiUrl}/api/v1/products/${encodeURIComponent(slug)}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });

    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    if (!json.success || !json.data) {
      return null;
    }

    return json.data as StorefrontProductDetail;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: ProductDetailPageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const product = await getProduct(slug);

  if (!product) {
    const t = await getTranslations({ locale, namespace: 'seo' });
    return {
      title: t('productNotFound'),
      description: t('productNotFoundDesc'),
      robots: buildNoIndexRobots(),
    };
  }

  const primaryImage = product.images.find((img) => img.isPrimary) || product.images[0];
  const description = product.summary || product.description?.slice(0, 160) || undefined;

  return {
    title: product.name,
    description,
    alternates: buildPageAlternates(`/products/${product.slug}`, locale),
    openGraph: {
      title: product.name,
      description,
      url: `/${locale}/products/${product.slug}`,
      images: product.images.map((img) => ({
        url: img.url,
        alt: img.altText || product.name,
      })),
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      description,
      images: primaryImage ? [primaryImage.url] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { slug, locale } = await params;
  const product = await getProduct(slug);

  if (!product) {
    notFound();
  }

  const productJsonLd = buildProductJsonLd(product, locale, env.storefrontOrigin);
  const breadcrumbs = product.category?.breadcrumbs || [];
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(
    breadcrumbs,
    product.name,
    `${env.storefrontOrigin}/${locale}/products/${product.slug}`,
    locale,
    env.storefrontOrigin,
  );

  return (
    <>
      <JsonLd data={productJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <ProductDetailView product={product} />
    </>
  );
}
