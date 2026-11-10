import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { env } from '@/lib/config';
import { ProductDetailView } from '@/components/storefront/product-detail-view';
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
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) {
    return {
      title: 'Product Not Found | DigitalDepot',
    };
  }

  const primaryImage = product.images.find((img) => img.isPrimary) || product.images[0];

  return {
    title: `${product.name} | DigitalDepot`,
    description: product.summary || product.description || undefined,
    openGraph: {
      title: product.name,
      description: product.summary || undefined,
      images: primaryImage ? [{ url: primaryImage.url }] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) {
    notFound();
  }

  return <ProductDetailView product={product} />;
}
