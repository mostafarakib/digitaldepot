import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as validateCheckout } from '../validate/route';

describe('BFF Checkout Route Handlers (Phase 5E)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('POST /api/checkout/validate', () => {
    it('blocks request with 403 when origin header does not match host', async () => {
      const req = new NextRequest('http://localhost:3000/api/checkout/validate', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://malicious-site.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const res = await validateCheckout(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('INVALID_ORIGIN');
    });

    it('returns 400 for invalid JSON request body', async () => {
      const req = new NextRequest('http://localhost:3000/api/checkout/validate', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: 'invalid-json-content{',
      });

      const res = await validateCheckout(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('BAD_REQUEST');
    });

    it('forwards validation payload to Express /api/v1/checkout/validate with credentials', async () => {
      let forwardedUrl = '';
      let forwardedBody = '';
      let forwardedHeaders: Headers | undefined;

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        forwardedUrl = url;
        forwardedBody = (init?.body as string) || '';
        forwardedHeaders = new Headers(init?.headers);

        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                isValid: true,
                canProceed: true,
                hasPriceChanges: false,
                requiresPriceAcknowledgement: false,
                hasUnavailableItems: false,
                hasInsufficientStock: false,
                issues: [],
                items: [],
                summary: {
                  itemCount: 0,
                  totalQuantity: 0,
                  merchandiseSubtotal: 0,
                  discount: 0,
                  shippingFee: 6000,
                  finalTotal: 6000,
                  isFreeShipping: false,
                },
                address: { id: 'addr-123' },
              },
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
                'x-csrf-token': 'new-csrf-token',
              },
            },
          ),
        );
      });

      const req = new NextRequest('http://localhost:3000/api/checkout/validate', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          cookie: 'dd_access=test-token; dd_csrf=csrf-123',
          'x-csrf-token': 'csrf-123',
        },
        body: JSON.stringify({ addressId: 'addr-123' }),
      });

      const res = await validateCheckout(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/checkout/validate');
      expect(JSON.parse(forwardedBody)).toEqual({ addressId: 'addr-123' });
      expect(forwardedHeaders?.get('cookie')).toContain('dd_access=test-token');
      expect(res.headers.get('x-csrf-token')).toBe('new-csrf-token');
    });
  });
});
