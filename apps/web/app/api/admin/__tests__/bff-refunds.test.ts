import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getRefundPreview } from '../returns/[returnNumber]/refund-preview/route';
import { POST as processRefund } from '../returns/[returnNumber]/refund/route';
import { POST as reconcileRefund } from '../returns/[returnNumber]/refund/reconcile/route';

describe('BFF Admin Refund Route Handlers (Phase 7D)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /api/admin/returns/[returnNumber]/refund-preview', () => {
    it('forwards GET request for refund preview to Express backend', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              preview: {
                returnNumber: 'RET-20261114-12345678',
                orderNumber: 'ORD-20261114-001',
                currency: 'BDT',
                merchandiseAmount: 100000,
                maxOrderRefundCapacity: 106000,
                maxMerchandiseRefundCapacity: 100000,
                targetPayment: {
                  id: 'pay-1',
                  method: 'SSLCOMMERZ',
                  gateway: 'SSLCOMMERZ',
                  gatewayTransactionId: 'BANK-TRAN-1',
                  capturedAmount: 106000,
                  totalRefunded: 0,
                  remainingCapacity: 106000,
                },
                eligiblePayments: [],
                hasPendingRefund: false,
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/returns/RET-20261114-12345678/refund-preview',
      );
      const res = await getRefundPreview(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261114-12345678' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/returns/RET-20261114-12345678/refund-preview');
    });
  });

  describe('POST /api/admin/returns/[returnNumber]/refund', () => {
    it('rejects cross-origin request with 403', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/admin/returns/RET-20261114-12345678/refund',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://malicious-site.com',
          },
          body: JSON.stringify({ payoutChannel: 'CASH' }),
        },
      );

      const res = await processRefund(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261114-12345678' }),
      });
      expect(res.status).toBe(403);
    });

    it('rejects missing origin header with 403', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/admin/returns/RET-20261114-12345678/refund',
        {
          method: 'POST',
          body: JSON.stringify({ payoutChannel: 'CASH' }),
        },
      );

      const res = await processRefund(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261114-12345678' }),
      });
      expect(res.status).toBe(403);
    });

    it('rejects invalid JSON body with 400', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/admin/returns/RET-20261114-12345678/refund',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
            'content-type': 'application/json',
          },
          body: '{ invalid-json',
        },
      );

      const res = await processRefund(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261114-12345678' }),
      });
      expect(res.status).toBe(400);
    });

    it('forwards valid refund request to Express backend', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';
      let forwardedBody = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init?.method || '';
        forwardedBody = typeof init?.body === 'string' ? init.body : '';
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              refund: {
                id: 'ref-1',
                refundNumber: 'REF-20261114-12345678',
                status: 'COMPLETED',
                amount: 100000,
              },
              return: {
                id: 'ret-1',
                status: 'COMPLETED',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/returns/RET-20261114-12345678/refund',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            payoutChannel: 'BKASH',
            payoutReference: 'BKASH-REF-001',
            notes: 'Approved payout',
          }),
        },
      );

      const res = await processRefund(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261114-12345678' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedMethod).toBe('POST');
      expect(forwardedUrl).toContain('/api/v1/admin/returns/RET-20261114-12345678/refund');
      expect(JSON.parse(forwardedBody)).toEqual({
        payoutChannel: 'BKASH',
        payoutReference: 'BKASH-REF-001',
        notes: 'Approved payout',
      });
    });
  });

  describe('POST /api/admin/returns/[returnNumber]/refund/reconcile', () => {
    it('rejects cross-origin reconcile request with 403', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/admin/returns/RET-20261114-12345678/refund/reconcile',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://malicious-site.com',
          },
          body: JSON.stringify({}),
        },
      );

      const res = await reconcileRefund(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261114-12345678' }),
      });
      expect(res.status).toBe(403);
    });

    it('forwards valid reconcile request to Express backend', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init?.method || '';
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              refund: {
                id: 'ref-1',
                refundNumber: 'REF-20261114-12345678',
                status: 'COMPLETED',
                gatewayReference: 'SSL-RECON-OK',
              },
              return: {
                id: 'ret-1',
                status: 'COMPLETED',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/returns/RET-20261114-12345678/refund/reconcile',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
            'content-type': 'application/json',
          },
          body: JSON.stringify({}),
        },
      );

      const res = await reconcileRefund(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261114-12345678' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedMethod).toBe('POST');
      expect(forwardedUrl).toContain(
        '/api/v1/admin/returns/RET-20261114-12345678/refund/reconcile',
      );
    });
  });
});
