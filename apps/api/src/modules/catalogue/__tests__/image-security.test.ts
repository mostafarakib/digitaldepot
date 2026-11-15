import { describe, it, expect } from 'vitest';
import {
  createImageSchema,
  createBrandSchema,
  updateBrandSchema,
  securePublicIdSchema,
  secureImageUrlSchema,
  secureWebsiteUrlSchema,
} from '../catalogue.schemas.js';

describe('Catalogue Image & URL Security Validation (Clarification 3)', () => {
  describe('Product Image URL Security', () => {
    it('accepts HTTPS URLs from approved image hosts (Cloudinary, Unsplash)', () => {
      const validCases = [
        'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        'https://cloudinary.com/images/product.png',
        'https://sub.cloudinary.com/v1/asset.jpg',
        'https://images.unsplash.com/photo-123456789',
      ];

      for (const url of validCases) {
        expect(() =>
          createImageSchema.parse({
            url,
          }),
        ).not.toThrow();
      }
    });

    it('rejects HTTP (non-SSL) image URLs', () => {
      expect(() =>
        createImageSchema.parse({
          url: 'http://res.cloudinary.com/demo/image/upload/sample.jpg',
        }),
      ).toThrow('Image URL must use HTTPS and belong to an approved host');
    });

    it('rejects image URLs from unapproved third-party or untrusted domains', () => {
      const untrustedCases = [
        'https://evil-site.com/image.png',
        'https://attacker.io/payload.jpg',
        'https://localhost:4000/image.jpg',
        'https://127.0.0.1/exploit.png',
        'https://evil-cloudinary.com/image.png',
        'https://notcloudinary.com/image.png',
        'https://evil.cloudinary.com.attacker.com/image.png',
        'https://.cloudinary.com/image.png',
      ];

      for (const url of untrustedCases) {
        expect(() =>
          createImageSchema.parse({
            url,
          }),
        ).toThrow('Image URL must use HTTPS and belong to an approved host');
      }
    });
  });

  describe('Cloudinary publicId Path Traversal Protection', () => {
    it('accepts legitimate publicId formats', () => {
      const validIds = [
        'sample',
        'watch-titanium-256gb',
        'v1/products/laptop_123',
        'uploads/2026/11/item.png',
      ];

      for (const id of validIds) {
        expect(() => securePublicIdSchema.parse(id)).not.toThrow();
      }
    });

    it('rejects path traversal sequences in publicId', () => {
      const traversalCases = [
        '../etc/passwd',
        '../../secret',
        'folder/../../../root',
        '..\\windows\\system32',
      ];

      for (const id of traversalCases) {
        expect(() => securePublicIdSchema.parse(id)).toThrow(
          'Public ID contains invalid characters or path traversal sequences',
        );
      }
    });

    it('rejects publicId containing forbidden characters or null bytes', () => {
      const invalidChars = ['public;rm -rf /', 'public\0null', 'public<script>', 'public$var'];

      for (const id of invalidChars) {
        expect(() => securePublicIdSchema.parse(id)).toThrow();
      }
    });
  });

  describe('Brand Logo and Website URL Security', () => {
    it('requires HTTPS and approved host for brand logoUrl', () => {
      // Valid
      expect(() =>
        createBrandSchema.parse({
          name: 'Apple',
          logoUrl: 'https://res.cloudinary.com/demo/image/upload/apple-logo.png',
        }),
      ).not.toThrow();

      // Insecure HTTP rejected
      expect(() =>
        createBrandSchema.parse({
          name: 'Apple',
          logoUrl: 'http://res.cloudinary.com/demo/image/upload/apple-logo.png',
        }),
      ).toThrow('Image URL must use HTTPS and belong to an approved host');

      // Untrusted domain rejected
      expect(() =>
        createBrandSchema.parse({
          name: 'Apple',
          logoUrl: 'https://untrusted-logos.com/logo.png',
        }),
      ).toThrow('Image URL must use HTTPS and belong to an approved host');
      // Also verify direct schema parsing
      expect(() => secureImageUrlSchema.parse('https://res.cloudinary.com/test.jpg')).not.toThrow();
      expect(() => secureImageUrlSchema.parse('http://res.cloudinary.com/test.jpg')).toThrow();
    });

    it('requires HTTPS for brand websiteUrl, allowing legitimate external domains', () => {
      const validExternalDomains = [
        'https://www.apple.com',
        'https://samsung.com/global',
        'https://store.google.com',
        'https://electronics.sony.co.jp',
      ];

      for (const websiteUrl of validExternalDomains) {
        expect(() =>
          createBrandSchema.parse({
            name: 'Brand',
            websiteUrl,
          }),
        ).not.toThrow();
        expect(() =>
          updateBrandSchema.parse({
            websiteUrl,
          }),
        ).not.toThrow();
        expect(() => secureWebsiteUrlSchema.parse(websiteUrl)).not.toThrow();
      }

      // Insecure HTTP rejected
      expect(() =>
        createBrandSchema.parse({
          name: 'Brand',
          websiteUrl: 'http://www.apple.com',
        }),
      ).toThrow('Website URL must use HTTPS and a valid public domain');

      // Localhost / internal loopback rejected
      expect(() =>
        createBrandSchema.parse({
          name: 'Brand',
          websiteUrl: 'https://localhost:8080',
        }),
      ).toThrow('Website URL must use HTTPS and a valid public domain');
    });
  });
});
