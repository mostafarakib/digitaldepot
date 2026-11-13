import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as submitOnline } from '../online/route';

describe('BFF Checkout Online Route Handler (Phase 6C)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('POST /api/checkout/online', () => {
    it('blocks request with 403 when origin header does not match host', async () => {
      const req = new NextRequest('http://localhost:3000/api/checkout/online', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://malicious-site.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ addressId: 'addr-1', acknowledgedLivePrices: true }),
      });

      const res = await submitOnline(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('INVALID_ORIGIN');
    });

    it('returns 400 for invalid JSON request body', async () => {
      const req = new NextRequest('http://localhost:3000/api/checkout/online', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: '{ malformed json content',
      });

      const res = await submitOnline(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('BAD_REQUEST');
    });

    it('forwards online checkout payload to Express /api/v1/checkout/online with credentials & rotated CSRF', async () => {
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
                order: {
                  id: 'order-123',
                  orderNumber: 'DD-20261113-ABCDEF12',
                  status: 'PENDING',
                  paymentStatus: 'PENDING',
                  paymentMethod: 'SSLCOMMERZ',
                  totalPayable: 106000,
                },
                gatewayUrl: 'https://sandbox.sslcommerz.com/EasyCheckOut/mock-session-123',
                sessionKey: 'mock-session-key',
              },
            }),
            {
              status: 201,
              headers: {
                'content-type': 'application/json',
                'x-csrf-token': 'rotated-csrf-token-xyz',
              },
            },
          ),
        );
      });

      const req = new NextRequest('http://localhost:3000/api/checkout/online', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          cookie: 'dd_access=test-token; dd_csrf=csrf-123',
          'x-csrf-token': 'csrf-123',
        },
        body: JSON.stringify({
          addressId: 'addr-123',
          deliveryNotes: 'Call upon arrival',
          alternativePhone: '+8801812345678',
          acknowledgedLivePrices: true,
        }),
      });

      const res = await submitOnline(req);
      expect(res.status).toBe(201);
      expect(forwardedUrl).toContain('/api/v1/checkout/online');
      expect(JSON.parse(forwardedBody)).toEqual({
        addressId: 'addr-123',
        deliveryNotes: 'Call upon arrival',
        alternativePhone: '+8801812345678',
        acknowledgedLivePrices: true,
      });
      expect(forwardedHeaders?.get('cookie')).toContain('dd_access=test-token');
      expect(res.headers.get('x-csrf-token')).toBe('rotated-csrf-token-xyz');

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.gatewayUrl).toBe(
        'https://sandbox.sslcommerz.com/EasyCheckOut/mock-session-123',
      );
      expect(json.data.order.status).toBe('PENDING');
    });
  });
});
