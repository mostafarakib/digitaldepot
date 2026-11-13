import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as submitCod } from '../cod/route';
import { GET as getOrderConfirmation } from '../orders/[orderNumber]/confirmation/route';

describe('BFF Checkout COD & Confirmation Route Handlers (Phase 6B)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('POST /api/checkout/cod', () => {
    it('blocks request with 403 when origin header does not match host', async () => {
      const req = new NextRequest('http://localhost:3000/api/checkout/cod', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://evil-site.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ addressId: 'addr-1', acknowledgedLivePrices: true }),
      });

      const res = await submitCod(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('INVALID_ORIGIN');
    });

    it('returns 400 for invalid JSON request body', async () => {
      const req = new NextRequest('http://localhost:3000/api/checkout/cod', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: '{ malformed json',
      });

      const res = await submitCod(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('BAD_REQUEST');
    });

    it('forwards COD payload to Express /api/v1/checkout/cod with credentials & rotated CSRF', async () => {
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
                orderId: 'order-123',
                orderNumber: 'DD-20261113-ABCDEF12',
                status: 'CONFIRMED',
                paymentStatus: 'PENDING',
                paymentMethod: 'CASH_ON_DELIVERY',
                total: 106000,
                itemCount: 1,
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

      const req = new NextRequest('http://localhost:3000/api/checkout/cod', {
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

      const res = await submitCod(req);
      expect(res.status).toBe(201);
      expect(forwardedUrl).toContain('/api/v1/checkout/cod');
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
      expect(json.data.orderNumber).toBe('DD-20261113-ABCDEF12');
    });
  });

  describe('GET /api/checkout/orders/[orderNumber]/confirmation', () => {
    it('forwards GET to Express /api/v1/checkout/orders/:orderNumber/confirmation with cookie', async () => {
      let forwardedUrl = '';
      let forwardedHeaders: Headers | undefined;

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        forwardedUrl = url;
        forwardedHeaders = new Headers(init?.headers);

        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                order: {
                  id: 'order-123',
                  orderNumber: 'DD-20261113-ABCDEF12',
                  status: 'CONFIRMED',
                  paymentStatus: 'PENDING',
                  paymentMethod: 'CASH_ON_DELIVERY',
                  subtotal: 100000,
                  shippingFee: 6000,
                  discount: 0,
                  total: 106000,
                  items: [],
                  addressSnapshot: {},
                },
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/checkout/orders/DD-20261113-ABCDEF12/confirmation',
        {
          method: 'GET',
          headers: {
            host: 'localhost:3000',
            cookie: 'dd_access=test-token',
          },
        },
      );

      const res = await getOrderConfirmation(req, {
        params: Promise.resolve({ orderNumber: 'DD-20261113-ABCDEF12' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/checkout/orders/DD-20261113-ABCDEF12/confirmation');
      expect(forwardedHeaders?.get('cookie')).toContain('dd_access=test-token');
      const json = await res.json();
      expect(json.data.order.orderNumber).toBe('DD-20261113-ABCDEF12');
    });

    it('passes through 404 when order is not found or not owned', async () => {
      global.fetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'NOT_FOUND',
                message: 'Order not found',
              },
            }),
            {
              status: 404,
              headers: { 'content-type': 'application/json' },
            },
          ),
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/checkout/orders/DD-UNKNOWN-999/confirmation',
        {
          method: 'GET',
          headers: {
            host: 'localhost:3000',
            cookie: 'dd_access=test-token',
          },
        },
      );

      const res = await getOrderConfirmation(req, {
        params: Promise.resolve({ orderNumber: 'DD-UNKNOWN-999' }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error.code).toBe('NOT_FOUND');
    });
  });
});
