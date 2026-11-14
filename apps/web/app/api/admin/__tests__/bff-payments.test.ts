import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getPayments } from '../payments/route';
import { GET as getPaymentById } from '../payments/[id]/route';

describe('BFF Admin Payments Route Handlers (Phase 8C)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /api/admin/payments', () => {
    it('forwards GET request with query params to Express backend', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: { payments: [], stats: {}, pagination: { total: 0 } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/payments?page=1&limit=20&status=PAID&method=SSLCOMMERZ&search=TXN-123',
      );
      const res = await getPayments(req);

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/payments');
      expect(forwardedUrl).toContain('status=PAID');
      expect(forwardedUrl).toContain('method=SSLCOMMERZ');
      expect(forwardedUrl).toContain('search=TXN-123');
    });

    it('returns error response when Express backend fails', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
      );

      const req = new NextRequest('http://localhost:3000/api/admin/payments');
      const res = await getPayments(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/admin/payments/[id]', () => {
    it('forwards GET request for specific payment ID', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              payment: {
                id: 'pay-123',
                transactionId: 'TXN-123',
                amount: 500000,
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/admin/payments/pay-123');
      const res = await getPaymentById(req, { params: Promise.resolve({ id: 'pay-123' }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/payments/pay-123');
      expect(body.data.payment.id).toBe('pay-123');
    });
  });
});
