import { describe, it, expect, vi, beforeEach } from 'vitest';
import robots from '../app/robots';
import sitemap from '../app/sitemap';

describe('Robots & Sitemap Metadata Routes (Phase 9D)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('robots.ts', () => {
    it('returns valid Robots configuration adhering to indexing rules', () => {
      const robotsConfig = robots();

      expect(robotsConfig.rules).toBeDefined();
      const rule = Array.isArray(robotsConfig.rules) ? robotsConfig.rules[0] : robotsConfig.rules;

      expect(rule.userAgent).toBe('*');

      // Allowed public paths
      expect(rule.allow).toContain('/');
      expect(rule.allow).toContain('/en/products');
      expect(rule.allow).toContain('/bn/products');

      // Disallowed administrative, account, cart, checkout, and auth paths
      const disallows = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
      expect(disallows).toContain('/api/');
      expect(disallows).toContain('/*/admin');
      expect(disallows).toContain('/*/account');
      expect(disallows).toContain('/*/cart');
      expect(disallows).toContain('/*/checkout');
      expect(disallows).toContain('/*/wishlist');
      expect(disallows).toContain('/*/login');
      expect(disallows).toContain('/*/register');
      expect(disallows).toContain('/*/status');

      // Points to sitemap
      expect(robotsConfig.sitemap).toContain('/sitemap.xml');
    });
  });

  describe('sitemap.ts', () => {
    it('generates core indexable routes with EN/BN/x-default language alternates', async () => {
      // Mock fetch returning empty products
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      } as Response);

      const items = await sitemap();

      // Home and Products catalog routes
      expect(items.length).toBeGreaterThanOrEqual(2);

      const homeEntry = items.find((item) => item.url.endsWith('/en'));
      expect(homeEntry).toBeDefined();
      expect(homeEntry?.alternates?.languages?.en).toContain('/en');
      expect(homeEntry?.alternates?.languages?.bn).toContain('/bn');
      expect(homeEntry?.alternates?.languages?.['x-default']).toContain('/en');
      expect(homeEntry?.priority).toBe(1.0);

      const catalogEntry = items.find((item) => item.url.endsWith('/en/products'));
      expect(catalogEntry).toBeDefined();
      expect(catalogEntry?.alternates?.languages?.en).toContain('/en/products');
      expect(catalogEntry?.alternates?.languages?.bn).toContain('/bn/products');
      expect(catalogEntry?.priority).toBe(0.9);
    });

    it('populates published products dynamically into sitemap with proper alternates', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            {
              slug: 'thinkpad-x1-carbon',
              updatedAt: '2026-03-01T12:00:00.000Z',
            },
            {
              slug: 'sony-wh-1000xm5',
              updatedAt: '2026-03-02T12:00:00.000Z',
            },
          ],
        }),
      } as Response);

      const items = await sitemap();

      const thinkpadEntry = items.find((item) => item.url.includes('/products/thinkpad-x1-carbon'));
      expect(thinkpadEntry).toBeDefined();
      expect(thinkpadEntry?.alternates?.languages?.en).toContain('/en/products/thinkpad-x1-carbon');
      expect(thinkpadEntry?.alternates?.languages?.bn).toContain('/bn/products/thinkpad-x1-carbon');
      expect(thinkpadEntry?.priority).toBe(0.8);

      // Clarification 2: Category and brand filter queries are excluded from sitemap
      const filterEntries = items.filter(
        (item) => item.url.includes('?category=') || item.url.includes('?brand='),
      );
      expect(filterEntries).toHaveLength(0);
    });

    it('gracefully falls back to core entries if product API is unreachable', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const items = await sitemap();
      expect(items.length).toBe(2);
      expect(items[0].url.endsWith('/en')).toBe(true);
      expect(items[1].url.endsWith('/en/products')).toBe(true);
    });
  });
});
