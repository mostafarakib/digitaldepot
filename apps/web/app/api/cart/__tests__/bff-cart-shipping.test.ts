import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as estimateShipping, DELETE as clearShippingEstimate } from '../shipping/route';

describe('BFF Cart Shipping Route Handlers (Phase 5C)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('POST /api/cart/shipping', () => {
    it('rejects cross-origin request without proper origin header', async () => {
      const req = new NextRequest('http://localhost:3000/api/cart/shipping', {
        method: 'POST',
        headers: {
          origin: 'http://malicious-site.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ district: 'DHAKA' }),
      });

      const res = await estimateShipping(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('INVALID_ORIGIN');
    });

    it('rejects invalid JSON request body', async () => {
      const req = new NextRequest('http://localhost:3000/api/cart/shipping', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: 'invalid-json{',
      });

      const res = await estimateShipping(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('BAD_REQUEST');
    });

    it('forwards valid estimate request with cookies and CSRF to Express backend', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';
      let forwardedBody = '';
      let forwardedCsrf = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init.method ?? 'GET';
        forwardedBody = init.body as string;
        const headers = init.headers as Record<string, string>;
        forwardedCsrf = headers['x-csrf-token'] ?? '';

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: 'cart-1',
              shipping: {
                district: 'DHAKA',
                isInsideDhaka: true,
                shippingFee: 6000,
                isFreeShipping: false,
              },
              total: 106000,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/cart/shipping', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          'x-csrf-token': 'valid-csrf-token',
          cookie: 'dd_cart_token=guest-abc; dd_csrf_token=valid-csrf-token',
        },
        body: JSON.stringify({ district: 'DHAKA' }),
      });

      const res = await estimateShipping(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/cart/shipping-estimate');
      expect(forwardedMethod).toBe('POST');
      expect(JSON.parse(forwardedBody)).toEqual({ district: 'DHAKA' });
      expect(forwardedCsrf).toBe('valid-csrf-token');

      const json = await res.json();
      expect(json.data.shipping.isInsideDhaka).toBe(true);
      expect(json.data.shipping.shippingFee).toBe(6000);
    });
  });

  describe('DELETE /api/cart/shipping', () => {
    it('rejects cross-origin request without proper origin header', async () => {
      const req = new NextRequest('http://localhost:3000/api/cart/shipping', {
        method: 'DELETE',
        headers: {
          origin: 'http://malicious-site.com',
        },
      });

      const res = await clearShippingEstimate(req);
      expect(res.status).toBe(403);
    });

    it('forwards DELETE request to Express backend to clear shipping estimate', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init.method ?? 'GET';

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: 'cart-1',
              shipping: {
                district: null,
                isEstimated: false,
                shippingFee: 0,
              },
              total: 100000,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/cart/shipping', {
        method: 'DELETE',
        headers: {
          origin: 'http://localhost:3000',
          'x-csrf-token': 'valid-csrf-token',
          cookie: 'dd_cart_token=guest-abc',
        },
      });

      const res = await clearShippingEstimate(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/cart/shipping-estimate');
      expect(forwardedMethod).toBe('DELETE');
    });
  });
});
