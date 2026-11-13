import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getOrders } from '../orders/route';
import { GET as getOrderById } from '../orders/[id]/route';
import { PATCH as updateOrderStatus } from '../orders/[id]/status/route';
import { POST as cancelOrder } from '../orders/[id]/cancel/route';
import { POST as markCodPaid } from '../orders/[id]/mark-cod-paid/route';

describe('BFF Admin Orders Route Handlers (Phase 6E)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /api/admin/orders', () => {
    it('forwards GET request with query params to Express backend', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: { orders: [], pagination: { total: 0 } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/orders?page=1&limit=20&status=CONFIRMED&search=DD-123',
      );
      const res = await getOrders(req);

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/orders');
      expect(forwardedUrl).toContain('status=CONFIRMED');
      expect(forwardedUrl).toContain('search=DD-123');
    });
  });

  describe('GET /api/admin/orders/[id]', () => {
    it('forwards GET request for specific order', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: { order: { id: 'ord-123', orderNumber: 'DD-20261113-12345678' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/admin/orders/ord-123');
      const res = await getOrderById(req, { params: Promise.resolve({ id: 'ord-123' }) });

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/orders/ord-123');
    });
  });

  describe('PATCH /api/admin/orders/[id]/status', () => {
    it('rejects cross-origin request with 403', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/orders/ord-123/status', {
        method: 'PATCH',
        headers: {
          host: 'localhost:3000',
          origin: 'http://malicious-site.com',
        },
        body: JSON.stringify({ status: 'PROCESSING', reason: 'Packed' }),
      });

      const res = await updateOrderStatus(req, { params: Promise.resolve({ id: 'ord-123' }) });
      expect(res.status).toBe(403);
    });

    it('forwards valid status transition to Express backend', async () => {
      let forwardedMethod = '';
      let forwardedUrl = '';
      let forwardedBody = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init?.method || '';
        forwardedBody = typeof init?.body === 'string' ? init.body : '';
        return new Response(
          JSON.stringify({
            success: true,
            data: { order: { id: 'ord-123', status: 'PROCESSING' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/admin/orders/ord-123/status', {
        method: 'PATCH',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'PROCESSING', reason: 'Order verified and packed' }),
      });

      const res = await updateOrderStatus(req, { params: Promise.resolve({ id: 'ord-123' }) });
      expect(res.status).toBe(200);
      expect(forwardedMethod).toBe('PATCH');
      expect(forwardedUrl).toContain('/api/v1/admin/orders/ord-123/status');
      expect(forwardedBody).toContain('PROCESSING');
    });
  });

  describe('POST /api/admin/orders/[id]/cancel', () => {
    it('forwards cancellation request to Express backend', async () => {
      let forwardedMethod = '';
      let forwardedUrl = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init?.method || '';
        return new Response(
          JSON.stringify({
            success: true,
            data: { order: { id: 'ord-123', status: 'CANCELLED' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/admin/orders/ord-123/cancel', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Admin cancelled order' }),
      });

      const res = await cancelOrder(req, { params: Promise.resolve({ id: 'ord-123' }) });
      expect(res.status).toBe(200);
      expect(forwardedMethod).toBe('POST');
      expect(forwardedUrl).toContain('/api/v1/admin/orders/ord-123/cancel');
    });
  });

  describe('POST /api/admin/orders/[id]/mark-cod-paid', () => {
    it('forwards mark-cod-paid request to Express backend', async () => {
      let forwardedMethod = '';
      let forwardedUrl = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init?.method || '';
        return new Response(
          JSON.stringify({
            success: true,
            data: { order: { id: 'ord-123', paymentStatus: 'PAID' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/admin/orders/ord-123/mark-cod-paid', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ note: 'Cash collected upon delivery' }),
      });

      const res = await markCodPaid(req, { params: Promise.resolve({ id: 'ord-123' }) });
      expect(res.status).toBe(200);
      expect(forwardedMethod).toBe('POST');
      expect(forwardedUrl).toContain('/api/v1/admin/orders/ord-123/mark-cod-paid');
    });
  });
});
