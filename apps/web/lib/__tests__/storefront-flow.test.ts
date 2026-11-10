import { describe, it, expect } from 'vitest';
import { formatPoishaToBDT } from '../utils';
import type { StorefrontProductSummary, StorefrontProductDetail } from '../catalogue-types';

describe('Storefront Logic & Formatter Tests (Phase 4D)', () => {
  describe('formatPoishaToBDT Currency Formatter', () => {
    it('formats integer poisha into proper BDT currency display format', () => {
      expect(formatPoishaToBDT(10800000)).toBe('৳108,000');
      expect(formatPoishaToBDT(50000)).toBe('৳500');
      expect(formatPoishaToBDT(0)).toBe('৳0');
      expect(formatPoishaToBDT(34999900)).toBe('৳349,999');
    });
  });

  describe('Stock Availability & Price Calculation Logic', () => {
    const mockSummary: StorefrontProductSummary = {
      id: 'p1',
      name: 'UltraBook Pro',
      slug: 'ultrabook-pro',
      summary: 'High performance laptop',
      featured: true,
      publishedAt: '2026-11-10T12:00:00Z',
      category: { id: 'c1', name: 'Laptops', slug: 'laptops' },
      brand: { id: 'b1', name: 'Apple', slug: 'apple', logoUrl: null },
      primaryImage: { id: 'img1', url: 'https://example.com/img.jpg', altText: null },
      minPrice: 15000000,
      maxPrice: 22000000,
      compareAtPrice: 25000000,
      isInStock: true,
      totalAvailableStock: 14,
      variantCount: 2,
    };

    it('correctly calculates discount percentage when compareAtPrice exists', () => {
      const discountPercent =
        mockSummary.compareAtPrice && mockSummary.compareAtPrice > mockSummary.minPrice
          ? Math.round(
              ((mockSummary.compareAtPrice - mockSummary.minPrice) / mockSummary.compareAtPrice) *
                100,
            )
          : null;

      expect(discountPercent).toBe(40); // (250,000 - 150,000) / 250,000 = 40%
    });

    it('correctly derives available stock as (quantity - reservedQuantity)', () => {
      const itemWithReservations = {
        quantity: 15,
        reservedQuantity: 5,
      };

      const availableStock = Math.max(
        0,
        itemWithReservations.quantity - itemWithReservations.reservedQuantity,
      );

      expect(availableStock).toBe(10);
      expect(availableStock > 0).toBe(true);
    });

    it('marks a variant as out of stock when physical stock equals or is below reserved stock', () => {
      const itemExhausted = {
        quantity: 8,
        reservedQuantity: 8,
      };

      const availableStock = Math.max(0, itemExhausted.quantity - itemExhausted.reservedQuantity);
      const isOutOfStock = availableStock <= 0;

      expect(availableStock).toBe(0);
      expect(isOutOfStock).toBe(true);
    });
  });

  describe('Product Detail Hierarchy & Specifications Parsing', () => {
    const mockDetail: StorefrontProductDetail = {
      id: 'p1',
      name: 'Sony WH-1000XM5',
      slug: 'sony-wh-1000xm5',
      summary: 'Wireless Noise Cancelling Headphones',
      description: 'Industry-leading noise cancellation with two processors.',
      warranty: '1 Year Sony Official Warranty',
      specifications: [
        { group: 'Audio', name: 'Driver Unit', value: '30mm' },
        { group: 'Audio', name: 'Frequency Response', value: '4Hz - 40,000Hz' },
        { group: 'Battery', name: 'Battery Life', value: '30 Hours' },
      ],
      featured: false,
      publishedAt: '2026-11-10T12:00:00Z',
      category: {
        id: 'c2',
        name: 'Headphones',
        slug: 'headphones',
        breadcrumbs: [
          { id: 'c0', name: 'Audio', slug: 'audio' },
          { id: 'c2', name: 'Headphones', slug: 'headphones' },
        ],
      },
      brand: {
        id: 'b2',
        name: 'Sony',
        slug: 'sony',
        logoUrl: 'https://example.com/sony.png',
        websiteUrl: 'https://sony.com',
      },
      images: [
        {
          id: 'i1',
          url: 'https://example.com/xm5-1.jpg',
          altText: 'XM5',
          displayOrder: 0,
          isPrimary: true,
        },
        {
          id: 'i2',
          url: 'https://example.com/xm5-2.jpg',
          altText: 'XM5 angle',
          displayOrder: 1,
          isPrimary: false,
        },
      ],
      variants: [
        {
          id: 'v1',
          sku: 'XM5-BLK',
          name: 'Black',
          price: 3500000,
          compareAtPrice: 3800000,
          attributes: { Color: 'Black' },
          isDefault: true,
          availableStock: 7,
          isOutOfStock: false,
        },
        {
          id: 'v2',
          sku: 'XM5-SLV',
          name: 'Silver',
          price: 3500000,
          compareAtPrice: 3800000,
          attributes: { Color: 'Silver' },
          isDefault: false,
          availableStock: 0,
          isOutOfStock: true,
        },
      ],
      isInStock: true,
      defaultVariantId: 'v1',
    };

    it('correctly identifies default variant and in-stock status', () => {
      expect(mockDetail.defaultVariantId).toBe('v1');
      expect(mockDetail.isInStock).toBe(true);

      const activeVariant = mockDetail.variants.find((v) => v.id === mockDetail.defaultVariantId);
      expect(activeVariant).toBeDefined();
      expect(activeVariant?.sku).toBe('XM5-BLK');
      expect(activeVariant?.availableStock).toBe(7);
      expect(activeVariant?.isOutOfStock).toBe(false);
    });

    it('correctly tracks out-of-stock secondary variant', () => {
      const secondaryVariant = mockDetail.variants.find((v) => v.id === 'v2');
      expect(secondaryVariant).toBeDefined();
      expect(secondaryVariant?.availableStock).toBe(0);
      expect(secondaryVariant?.isOutOfStock).toBe(true);
    });

    it('groups specifications cleanly by section', () => {
      const grouped = mockDetail.specifications.reduce<
        Record<string, Array<{ name: string; value: string }>>
      >((acc, s) => {
        const group = s.group || 'General';
        if (!acc[group]) acc[group] = [];
        acc[group].push({ name: s.name, value: s.value });
        return acc;
      }, {});

      expect(Object.keys(grouped)).toEqual(['Audio', 'Battery']);
      expect(grouped['Audio']).toHaveLength(2);
      expect(grouped['Battery']).toHaveLength(1);
    });
  });
});
