import { describe, it, expect } from 'vitest';
import {
  safeJsonLdReplacer,
  buildPageAlternates,
  buildNoIndexRobots,
  buildProductJsonLd,
  buildBreadcrumbJsonLd,
  buildWebSiteJsonLd,
  buildOrganizationJsonLd,
} from '../seo';
import type { StorefrontProductDetail } from '../catalogue-types';
import type { PublicStoreSettings } from '../settings-types';

describe('SEO & Structured Data Helpers (Phase 9D)', () => {
  describe('safeJsonLdReplacer', () => {
    it('escapes HTML tags to prevent XSS injection in JSON-LD scripts', () => {
      const maliciousData = {
        name: 'Product <script>alert("xss")</script>',
        summary: 'Look at this & that',
      };
      const serialized = safeJsonLdReplacer(maliciousData);

      expect(serialized).not.toContain('<script>');
      expect(serialized).not.toContain('</script>');
      expect(serialized).toContain('\\u003cscript\\u003e');
      expect(serialized).toContain('\\u003c/script\\u003e');
      expect(serialized).toContain('\\u0026');
    });
  });

  describe('buildPageAlternates', () => {
    it('generates correct canonical and hreflang language alternates for indexable routes', () => {
      const alternates = buildPageAlternates('/products', 'en');

      expect(alternates.canonical).toBe('/en/products');
      expect(alternates.languages?.en).toBe('/en/products');
      expect(alternates.languages?.bn).toBe('/bn/products');
      expect(alternates.languages?.['x-default']).toBe('/en/products');
    });

    it('handles root / path correctly without trailing slashes', () => {
      const alternatesBn = buildPageAlternates('/', 'bn');

      expect(alternatesBn.canonical).toBe('/bn');
      expect(alternatesBn.languages?.en).toBe('/en');
      expect(alternatesBn.languages?.bn).toBe('/bn');
      expect(alternatesBn.languages?.['x-default']).toBe('/en');
    });
  });

  describe('buildNoIndexRobots', () => {
    it('returns strict noindex and nofollow directives for private/transactional views', () => {
      const robots = buildNoIndexRobots();

      expect(robots.index).toBe(false);
      expect(robots.follow).toBe(false);
      expect(robots.nocache).toBe(true);
      if (typeof robots.googleBot === 'object' && robots.googleBot !== null) {
        expect(robots.googleBot.index).toBe(false);
      }
    });
  });

  describe('buildProductJsonLd', () => {
    const mockProduct: StorefrontProductDetail = {
      id: 'prod-123',
      name: 'MacBook Air M2',
      slug: 'macbook-air-m2',
      summary: 'Thin and light laptop with Apple Silicon.',
      description: 'Full product description here.',
      warranty: '1 Year Apple Official Warranty',
      specifications: [
        { group: 'Performance', name: 'Processor', value: 'M2 8-core' },
        { group: 'Memory', name: 'RAM', value: '16GB Unified' },
      ],
      featured: true,
      publishedAt: '2026-01-01T00:00:00.000Z',
      category: {
        id: 'cat-1',
        name: 'Laptops',
        slug: 'laptops',
        breadcrumbs: [{ id: 'cat-root', name: 'Computing', slug: 'computing' }],
      },
      brand: {
        id: 'brand-1',
        name: 'Apple',
        slug: 'apple',
        logoUrl: 'https://cdn.example.com/apple.png',
        websiteUrl: 'https://apple.com',
      },
      images: [
        {
          id: 'img-1',
          url: 'https://cdn.example.com/mba-primary.jpg',
          altText: 'MacBook Air Front',
          displayOrder: 0,
          isPrimary: true,
        },
        {
          id: 'img-2',
          url: 'https://cdn.example.com/mba-side.jpg',
          altText: 'MacBook Air Side',
          displayOrder: 1,
          isPrimary: false,
        },
      ],
      variants: [
        {
          id: 'var-1',
          sku: 'MBA-M2-256-SLV',
          name: 'Silver 256GB',
          price: 13500000, // 135,000 BDT in poisha
          compareAtPrice: 14000000,
          attributes: { color: 'Silver', storage: '256GB' },
          isDefault: true,
          availableStock: 5,
          isOutOfStock: false,
        },
        {
          id: 'var-2',
          sku: 'MBA-M2-512-SLV',
          name: 'Silver 512GB',
          price: 16000000,
          compareAtPrice: null,
          attributes: { color: 'Silver', storage: '512GB' },
          isDefault: false,
          availableStock: 0, // Out of stock
          isOutOfStock: true,
        },
      ],
      isInStock: true,
      defaultVariantId: 'var-1',
    };

    it('correctly maps product details, currency in BDT, and stock availability', () => {
      const jsonLd = buildProductJsonLd(mockProduct, 'en', 'https://digitaldepot.com');

      expect(jsonLd['@context']).toBe('https://schema.org');
      expect(jsonLd['@type']).toBe('Product');
      expect(jsonLd['name']).toBe('MacBook Air M2');
      expect(jsonLd['description']).toBe('Thin and light laptop with Apple Silicon.');
      expect(jsonLd['category']).toBe('Laptops');
      expect((jsonLd['brand'] as { name: string }).name).toBe('Apple');
      expect(jsonLd['warranty']).toBe('1 Year Apple Official Warranty');

      // Verify offers and poisha conversion
      const offers = jsonLd['offers'] as Array<Record<string, unknown>>;
      expect(offers).toHaveLength(2);

      // In-stock variant
      expect(offers[0].sku).toBe('MBA-M2-256-SLV');
      expect(offers[0].price).toBe('135000.00'); // 13,500,000 / 100
      expect(offers[0].priceCurrency).toBe('BDT');
      expect(offers[0].availability).toBe('https://schema.org/InStock');

      // Out-of-stock variant (availableStock = 0)
      expect(offers[1].sku).toBe('MBA-M2-512-SLV');
      expect(offers[1].price).toBe('160000.00');
      expect(offers[1].availability).toBe('https://schema.org/OutOfStock');

      // Verify specifications
      const specs = jsonLd['additionalProperty'] as Array<{ name: string; value: string }>;
      expect(specs).toHaveLength(2);
      expect(specs[0].name).toBe('Processor');
      expect(specs[0].value).toBe('M2 8-core');

      // Clarification 3: Zero invented ratings/reviews
      expect(jsonLd['aggregateRating']).toBeUndefined();
      expect(jsonLd['review']).toBeUndefined();
    });

    it('omits brand when product has no brand association', () => {
      const noBrandProduct = { ...mockProduct, brand: null };
      const jsonLd = buildProductJsonLd(noBrandProduct, 'en', 'https://digitaldepot.com');
      expect(jsonLd['brand']).toBeUndefined();
    });
  });

  describe('buildBreadcrumbJsonLd', () => {
    it('creates Schema.org BreadcrumbList starting with Home and resolving category path', () => {
      const breadcrumbs = [
        { name: 'Computing', slug: 'computing' },
        { name: 'Laptops', slug: 'laptops' },
      ];

      const jsonLd = buildBreadcrumbJsonLd(
        breadcrumbs,
        'MacBook Air M2',
        'https://digitaldepot.com/en/products/macbook-air-m2',
        'en',
        'https://digitaldepot.com',
      );

      expect(jsonLd['@type']).toBe('BreadcrumbList');
      const items = jsonLd['itemListElement'] as Array<{
        position: number;
        name: string;
        item: string;
      }>;
      expect(items).toHaveLength(4);

      expect(items[0]).toEqual({
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://digitaldepot.com/en',
      });
      expect(items[1]).toEqual({
        '@type': 'ListItem',
        position: 2,
        name: 'Computing',
        item: 'https://digitaldepot.com/en/products?category=computing',
      });
      expect(items[2]).toEqual({
        '@type': 'ListItem',
        position: 3,
        name: 'Laptops',
        item: 'https://digitaldepot.com/en/products?category=laptops',
      });
      expect(items[3]).toEqual({
        '@type': 'ListItem',
        position: 4,
        name: 'MacBook Air M2',
        item: 'https://digitaldepot.com/en/products/macbook-air-m2',
      });
    });

    it('uses Bengali Home name when locale is bn', () => {
      const jsonLd = buildBreadcrumbJsonLd(
        [],
        'পণ্য',
        'https://digitaldepot.com/bn/products/item',
        'bn',
        'https://digitaldepot.com',
      );
      const items = jsonLd['itemListElement'] as Array<{ name: string }>;
      expect(items[0].name).toBe('হোম');
    });
  });

  describe('buildWebSiteJsonLd', () => {
    it('generates WebSite schema with search action template', () => {
      const jsonLd = buildWebSiteJsonLd('en', 'https://digitaldepot.com');
      expect(jsonLd['@type']).toBe('WebSite');
      expect(jsonLd['url']).toBe('https://digitaldepot.com/en');

      const potentialAction = jsonLd['potentialAction'] as {
        target: { urlTemplate: string };
      };
      expect(potentialAction.target.urlTemplate).toBe(
        'https://digitaldepot.com/en/products?q={search_term_string}',
      );
    });
  });

  describe('buildOrganizationJsonLd', () => {
    it('includes verified business details and omits missing values', () => {
      const mockSettings: Partial<PublicStoreSettings> = {
        storeName: 'DigitalDepot Bangladesh',
        supportEmail: 'support@digitaldepot.com.bd',
        supportPhone: '+8801700000000',
        storeAddress: 'Gulshan-2, Dhaka 1212',
      };

      const jsonLd = buildOrganizationJsonLd(mockSettings, 'https://digitaldepot.com');
      expect(jsonLd['@type']).toBe('Organization');
      expect(jsonLd['name']).toBe('DigitalDepot Bangladesh');
      expect(jsonLd['email']).toBe('support@digitaldepot.com.bd');
      expect(jsonLd['telephone']).toBe('+8801700000000');
      expect(jsonLd['address']).toEqual({
        '@type': 'PostalAddress',
        streetAddress: 'Gulshan-2, Dhaka 1212',
        addressCountry: 'BD',
      });
    });

    it('handles null settings gracefully without crashing', () => {
      const jsonLd = buildOrganizationJsonLd(null, 'https://digitaldepot.com');
      expect(jsonLd['@type']).toBe('Organization');
      expect(jsonLd['name']).toBe('DigitalDepot');
      expect(jsonLd['email']).toBeUndefined();
      expect(jsonLd['telephone']).toBeUndefined();
      expect(jsonLd['address']).toBeUndefined();
    });
  });
});
