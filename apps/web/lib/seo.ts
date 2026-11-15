import type { Metadata } from 'next';
import type { StorefrontProductDetail } from './catalogue-types';
import type { PublicStoreSettings } from './settings-types';

/**
 * Escapes HTML opening and closing tag characters within serialized JSON-LD
 * to prevent script injection vulnerabilities when inlined into a <script> element.
 */
export function safeJsonLdReplacer(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * Builds canonical and hreflang language alternates for indexable pages.
 * Ensures en, bn, and x-default paths are strictly defined.
 */
export function buildPageAlternates(
  path: string,
  locale: string,
): NonNullable<Metadata['alternates']> {
  // Normalize path ensuring leading slash and avoiding trailing slash on root
  const cleanPath = path === '/' || path === '' ? '' : path.startsWith('/') ? path : `/${path}`;

  return {
    canonical: `/${locale}${cleanPath}`,
    languages: {
      en: `/en${cleanPath}`,
      bn: `/bn${cleanPath}`,
      'x-default': `/en${cleanPath}`,
    },
  };
}

/**
 * Standard robots directive for non-indexable routes (admin, account, cart, checkout, auth).
 */
export type RobotsObject = Exclude<NonNullable<Metadata['robots']>, string>;

export function buildNoIndexRobots(): RobotsObject {
  return {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  };
}

/**
 * Builds Schema.org Product structured data from verified storefront product data.
 * - Converts poisha prices to decimal BDT.
 * - Accounts for availableStock (quantity - reservedQuantity).
 * - Excludes unsupported/fake review and rating fields.
 */
export function buildProductJsonLd(
  product: StorefrontProductDetail,
  locale: string,
  origin: string,
): Record<string, unknown> {
  const primaryImage = product.images.find((img) => img.isPrimary) || product.images[0];
  const images = product.images.map((img) => img.url);
  if (images.length === 0 && primaryImage) {
    images.push(primaryImage.url);
  }

  // Active variants with valid prices
  const offers = product.variants.map((variant) => {
    // Inventory calculation: availableStock is (quantity - reservedQuantity)
    const inStock = variant.availableStock > 0 && !variant.isOutOfStock;

    return {
      '@type': 'Offer',
      sku: variant.sku,
      name: variant.name,
      price: (variant.price / 100).toFixed(2),
      priceCurrency: 'BDT',
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      url: `${origin}/${locale}/products/${product.slug}`,
    };
  });

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.summary || product.description || undefined,
    image: images.length > 0 ? images : undefined,
    sku: product.variants[0]?.sku || undefined,
    offers: offers.length === 1 ? offers[0] : offers,
    category: product.category?.name || undefined,
  };

  if (product.brand?.name) {
    schema['brand'] = {
      '@type': 'Brand',
      name: product.brand.name,
    };
  }

  if (product.warranty) {
    schema['warranty'] = product.warranty;
  }

  if (product.specifications && product.specifications.length > 0) {
    schema['additionalProperty'] = product.specifications.map((spec) => ({
      '@type': 'PropertyValue',
      name: spec.name,
      value: spec.value,
    }));
  }

  return schema;
}

/**
 * Builds Schema.org BreadcrumbList structured data from category breadcrumbs.
 */
export function buildBreadcrumbJsonLd(
  breadcrumbs: Array<{ name: string; slug: string }>,
  currentName: string,
  currentUrl: string,
  locale: string,
  origin: string,
): Record<string, unknown> {
  const homeName = locale === 'bn' ? 'হোম' : 'Home';

  const items = [
    {
      '@type': 'ListItem',
      position: 1,
      name: homeName,
      item: `${origin}/${locale}`,
    },
    ...breadcrumbs.map((b, idx) => ({
      '@type': 'ListItem',
      position: idx + 2,
      name: b.name,
      item: `${origin}/${locale}/products?category=${encodeURIComponent(b.slug)}`,
    })),
    {
      '@type': 'ListItem',
      position: breadcrumbs.length + 2,
      name: currentName,
      item: currentUrl,
    },
  ];

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  };
}

/**
 * Builds Schema.org WebSite structured data with SearchAction.
 */
export function buildWebSiteJsonLd(locale: string, origin: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'DigitalDepot',
    url: `${origin}/${locale}`,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${origin}/${locale}/products?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Builds Schema.org Organization structured data using real store settings.
 * Omit fields that are unavailable.
 */
export function buildOrganizationJsonLd(
  settings: Partial<PublicStoreSettings> | null,
  origin: string,
): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings?.storeName || 'DigitalDepot',
    url: origin,
  };

  if (settings?.supportEmail) {
    schema['email'] = settings.supportEmail;
  }

  if (settings?.supportPhone) {
    schema['telephone'] = settings.supportPhone;
  }

  if (settings?.storeAddress) {
    schema['address'] = {
      '@type': 'PostalAddress',
      streetAddress: settings.storeAddress,
      addressCountry: 'BD',
    };
  }

  return schema;
}
