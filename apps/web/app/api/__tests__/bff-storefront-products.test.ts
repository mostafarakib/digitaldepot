import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getStorefrontProducts } from '../products/route';
import { GET as getStorefrontProductBySlug } from '../products/[slug]/route';

describe('BFF Storefront Products Route Handlers (Phase 4D)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('forwards GET /api/products with all query parameters to Express', async () => {
    let forwardedUrl = '';
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      forwardedUrl = url;
      return new Response(
        JSON.stringify({
          success: true,
          data: [],
          facets: { categories: [], brands: [], priceRange: { min: 0, max: 0 } },
          pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
        }),
        { status: 200 },
      );
    });

    const req = new NextRequest(
      'http://localhost:3000/api/products?category=laptops&brand=apple&minPrice=1000000&maxPrice=5000000&inStock=true&featured=true&sort=price-asc&page=2&limit=24',
      { method: 'GET' },
    );

    const res = await getStorefrontProducts(req);
    expect(res.status).toBe(200);
    expect(forwardedUrl).toContain('/api/v1/products');
    expect(forwardedUrl).toContain('category=laptops');
    expect(forwardedUrl).toContain('brand=apple');
    expect(forwardedUrl).toContain('inStock=true');
    expect(forwardedUrl).toContain('featured=true');
    expect(forwardedUrl).toContain('sort=price-asc');
    expect(forwardedUrl).toContain('page=2');
  });

  it('forwards GET /api/products/[slug] to Express', async () => {
    let forwardedUrl = '';
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      forwardedUrl = url;
      return new Response(
        JSON.stringify({
          success: true,
          data: { id: 'p1', name: 'MacBook Pro', slug: 'macbook-pro' },
        }),
        { status: 200 },
      );
    });

    const req = new NextRequest('http://localhost:3000/api/products/macbook-pro', {
      method: 'GET',
    });

    const res = await getStorefrontProductBySlug(req, {
      params: Promise.resolve({ slug: 'macbook-pro' }),
    });

    expect(res.status).toBe(200);
    expect(forwardedUrl).toContain('/api/v1/products/macbook-pro');
  });
});
