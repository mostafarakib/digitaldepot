import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getCart, DELETE as clearCart } from '../route';
import { POST as addItem } from '../items/route';
import { PATCH as updateItem, DELETE as removeItem } from '../items/[id]/route';
import { POST as mergeCart } from '../merge/route';
import { POST as applyCoupon, DELETE as removeCoupon } from '../coupon/route';

describe('BFF Shopping Cart Route Handlers (Phase 5A)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /api/cart', () => {
    it('forwards GET request with cookies to Express API', async () => {
      let forwardedUrl = '';
      let forwardedCookie = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        const headers = init.headers as Record<string, string>;
        forwardedCookie = headers['cookie'] ?? '';
        return new Response(
          JSON.stringify({
            success: true,
            data: { id: 'cart-1', items: [], itemCount: 0, totalQuantity: 0, subtotal: 0 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/cart', {
        headers: { cookie: 'dd_cart_token=guest-abc-123' },
      });

      const res = await getCart(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/cart');
      expect(forwardedCookie).toBe('dd_cart_token=guest-abc-123');

      const data = await res.json();
      expect(data.data.itemCount).toBe(0);
    });
  });

  describe('POST /api/cart/items', () => {
    it('rejects cross-origin requests with 403', async () => {
      const req = new NextRequest('http://localhost:3000/api/cart/items', {
        method: 'POST',
        headers: {
          origin: 'http://malicious-site.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ variantId: 'var-1', quantity: 1 }),
      });

      const res = await addItem(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe('INVALID_ORIGIN');
    });

    it('rejects malformed JSON body with 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/cart/items', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: 'invalid-json{',
      });

      const res = await addItem(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('BAD_REQUEST');
    });

    it('forwards valid payload to Express and passes through Set-Cookie headers', async () => {
      let forwardedUrl = '';
      let forwardedBody = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedBody = (init.body as string) ?? '';
        const headers = new Headers();
        headers.append(
          'set-cookie',
          'dd_cart_token=raw-guest-token; Path=/; HttpOnly; SameSite=Lax',
        );
        headers.append('content-type', 'application/json');

        return new Response(
          JSON.stringify({
            success: true,
            data: { id: 'cart-1', items: [{ id: 'item-1', variantId: 'var-1', quantity: 2 }] },
          }),
          { status: 200, headers },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/cart/items', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ variantId: 'var-1', quantity: 2 }),
      });

      const res = await addItem(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/cart/items');
      expect(JSON.parse(forwardedBody)).toEqual({ variantId: 'var-1', quantity: 2 });

      // Verifies Set-Cookie header propagation from Express through BFF
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('dd_cart_token=raw-guest-token');
    });
  });

  describe('PATCH & DELETE /api/cart/items/[id]', () => {
    it('forwards PATCH to Express with item ID and quantity', async () => {
      let forwardedUrl = '';
      let forwardedBody = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedBody = (init.body as string) ?? '';
        return new Response(
          JSON.stringify({
            success: true,
            data: { id: 'cart-1', items: [{ id: 'item-42', quantity: 5 }] },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/cart/items/item-42', {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ quantity: 5 }),
      });

      const res = await updateItem(req, { params: Promise.resolve({ id: 'item-42' }) });
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/cart/items/item-42');
      expect(JSON.parse(forwardedBody)).toEqual({ quantity: 5 });
    });

    it('forwards DELETE to Express with item ID', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init.method ?? 'GET';
        return new Response(
          JSON.stringify({
            success: true,
            data: { id: 'cart-1', items: [] },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/cart/items/item-42', {
        method: 'DELETE',
        headers: { origin: 'http://localhost:3000' },
      });

      const res = await removeItem(req, { params: Promise.resolve({ id: 'item-42' }) });
      expect(res.status).toBe(200);
      expect(forwardedMethod).toBe('DELETE');
      expect(forwardedUrl).toContain('/api/v1/cart/items/item-42');
    });
  });

  describe('DELETE /api/cart (clear cart)', () => {
    it('forwards clear cart request to Express API', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init.method ?? 'GET';
        return new Response(
          JSON.stringify({
            success: true,
            data: { id: 'cart-1', items: [], itemCount: 0, subtotal: 0 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/cart', {
        method: 'DELETE',
        headers: { origin: 'http://localhost:3000' },
      });

      const res = await clearCart(req);
      expect(res.status).toBe(200);
      expect(forwardedMethod).toBe('DELETE');
      expect(forwardedUrl).toContain('/api/v1/cart');
    });
  });

  describe('POST /api/cart/merge', () => {
    it('forwards manual merge request to Express API', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init.method ?? 'GET';
        return new Response(
          JSON.stringify({
            success: true,
            data: { id: 'cart-merged', items: [], itemCount: 0 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/cart/merge', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
      });

      const res = await mergeCart(req);
      expect(res.status).toBe(200);
      expect(forwardedMethod).toBe('POST');
      expect(forwardedUrl).toContain('/api/v1/cart/merge');
    });
  });

  describe('POST & DELETE /api/cart/coupon', () => {
    it('rejects cross-origin POST with 403', async () => {
      const req = new NextRequest('http://localhost:3000/api/cart/coupon', {
        method: 'POST',
        headers: {
          origin: 'http://malicious-site.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ code: 'PROMO10' }),
      });

      const res = await applyCoupon(req);
      expect(res.status).toBe(403);
    });

    it('forwards valid coupon application to Express', async () => {
      let forwardedUrl = '';
      let forwardedBody = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedBody = (init.body as string) ?? '';
        return new Response(
          JSON.stringify({
            success: true,
            data: { id: 'cart-1', discount: 5000 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/cart/coupon', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ code: 'SAVE10' }),
      });

      const res = await applyCoupon(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/cart/coupon');
      expect(JSON.parse(forwardedBody)).toEqual({ code: 'SAVE10' });
    });

    it('forwards coupon removal DELETE to Express', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init.method ?? 'GET';
        return new Response(
          JSON.stringify({
            success: true,
            data: { id: 'cart-1', discount: 0, coupon: null },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/cart/coupon', {
        method: 'DELETE',
        headers: { origin: 'http://localhost:3000' },
      });

      const res = await removeCoupon(req);
      expect(res.status).toBe(200);
      expect(forwardedMethod).toBe('DELETE');
      expect(forwardedUrl).toContain('/api/v1/cart/coupon');
    });
  });
});
