import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as listOrders } from '../orders/route';
import { GET as getOrderDetails } from '../orders/[orderNumber]/route';
import { POST as cancelOrder } from '../orders/[orderNumber]/cancel/route';

describe('BFF Account Orders Route Handlers (Phase 6D)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /api/account/orders', () => {
    it('forwards query parameters (page, limit, status) to Express /api/v1/orders', async () => {
      let forwardedUrl = '';
      let forwardedHeaders: Headers | undefined;

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        forwardedUrl = url;
        forwardedHeaders = new Headers(init?.headers);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: { orders: [], pagination: { page: 2, limit: 5, total: 0, totalPages: 0 } },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/account/orders?page=2&limit=5&status=DELIVERED',
        {
          headers: {
            cookie: 'access_token=token-123',
          },
        },
      );

      const res = await listOrders(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/orders?page=2&limit=5&status=DELIVERED');
      expect(forwardedHeaders?.get('cookie')).toContain('access_token=token-123');
    });
  });

  describe('GET /api/account/orders/[orderNumber]', () => {
    it('forwards orderNumber to Express /api/v1/orders/:orderNumber', async () => {
      let forwardedUrl = '';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        forwardedUrl = url;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: { order: { orderNumber: 'DD-20261113-ABC12345' } },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      });

      const req = new NextRequest('http://localhost:3000/api/account/orders/DD-20261113-ABC12345');
      const res = await getOrderDetails(req, {
        params: Promise.resolve({ orderNumber: 'DD-20261113-ABC12345' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/orders/DD-20261113-ABC12345');
    });
  });

  describe('POST /api/account/orders/[orderNumber]/cancel', () => {
    it('blocks request with 403 when origin header does not match host', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/account/orders/DD-20261113-ABC12345/cancel',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://malicious-site.com',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ reason: 'Changed mind' }),
        },
      );

      const res = await cancelOrder(req, {
        params: Promise.resolve({ orderNumber: 'DD-20261113-ABC12345' }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('INVALID_ORIGIN');
    });

    it('forwards cancel payload to Express /api/v1/orders/:orderNumber/cancel when origin is valid', async () => {
      let forwardedUrl = '';
      let forwardedBody = '';

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        forwardedUrl = url;
        forwardedBody = (init?.body as string) || '';
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: { order: { status: 'CANCELLED' } },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/account/orders/DD-20261113-ABC12345/cancel',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ reason: 'Changed mind' }),
        },
      );

      const res = await cancelOrder(req, {
        params: Promise.resolve({ orderNumber: 'DD-20261113-ABC12345' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/orders/DD-20261113-ABC12345/cancel');
      expect(JSON.parse(forwardedBody)).toEqual({ reason: 'Changed mind' });
    });
  });
});
