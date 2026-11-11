import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getWishlist, POST as addToWishlist } from '../route';
import { DELETE as removeFromWishlist } from '../[productId]/route';

describe('BFF Wishlist Route Handlers (Phase 5D)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /api/wishlist', () => {
    it('forwards get request to Express backend with access token cookie', async () => {
      let forwardedUrl = '';
      let forwardedHeaders: Headers | undefined;

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        forwardedUrl = url;
        forwardedHeaders = new Headers(init?.headers);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: { items: [], productIds: [], itemCount: 0 },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        );
      });

      const req = new NextRequest('http://localhost:3000/api/wishlist', {
        method: 'GET',
        headers: {
          cookie: 'dd_access=token123',
        },
      });

      const res = await getWishlist(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/wishlist');
      expect(forwardedHeaders?.get('cookie')).toContain('dd_access=token123');
    });
  });

  describe('POST /api/wishlist', () => {
    it('rejects cross-origin requests with 403 INVALID_ORIGIN', async () => {
      const req = new NextRequest('http://localhost:3000/api/wishlist', {
        method: 'POST',
        headers: {
          origin: 'http://malicious-site.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ productId: 'prod_123' }),
      });

      const res = await addToWishlist(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('INVALID_ORIGIN');
    });

    it('rejects malformed JSON body with 400 BAD_REQUEST', async () => {
      const req = new NextRequest('http://localhost:3000/api/wishlist', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: 'bad-json{',
      });

      const res = await addToWishlist(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('BAD_REQUEST');
    });

    it('forwards valid add request with CSRF token to Express backend', async () => {
      let forwardedUrl = '';
      let forwardedBody = '';
      let forwardedHeaders: Headers | undefined;

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        forwardedUrl = url;
        forwardedBody = init?.body as string;
        forwardedHeaders = new Headers(init?.headers);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: { id: 'w1', productId: 'prod_123' },
            }),
            {
              status: 201,
              headers: {
                'content-type': 'application/json',
                'x-csrf-token': 'new-csrf-token',
              },
            },
          ),
        );
      });

      const req = new NextRequest('http://localhost:3000/api/wishlist', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          'x-csrf-token': 'csrf-123',
          cookie: 'dd_access=token123; dd_csrf=csrf-123',
        },
        body: JSON.stringify({ productId: 'prod_123' }),
      });

      const res = await addToWishlist(req);
      expect(res.status).toBe(201);
      expect(forwardedUrl).toContain('/api/v1/wishlist');
      expect(JSON.parse(forwardedBody)).toEqual({ productId: 'prod_123' });
      expect(forwardedHeaders?.get('x-csrf-token')).toBe('csrf-123');
    });
  });

  describe('DELETE /api/wishlist/[productId]', () => {
    it('forwards delete request with CSRF token to Express backend', async () => {
      let forwardedUrl = '';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        forwardedUrl = url;
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, message: 'Removed' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const req = new NextRequest('http://localhost:3000/api/wishlist/prod_123', {
        method: 'DELETE',
        headers: {
          origin: 'http://localhost:3000',
          'x-csrf-token': 'csrf-123',
          cookie: 'dd_access=token123',
        },
      });

      const res = await removeFromWishlist(req, {
        params: Promise.resolve({ productId: 'prod_123' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/wishlist/prod_123');
    });
  });
});
