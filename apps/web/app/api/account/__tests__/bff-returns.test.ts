import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getReturnEligibility } from '../orders/[orderNumber]/return-eligibility/route';
import { POST as createReturn } from '../orders/[orderNumber]/returns/route';
import { GET as listReturns } from '../returns/route';
import { GET as getReturnDetail } from '../returns/[returnNumber]/route';
import { POST as cancelReturn } from '../returns/[returnNumber]/cancel/route';

describe('BFF Account Returns Route Handlers (Phase 7B)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /api/account/orders/[orderNumber]/return-eligibility', () => {
    it('forwards orderNumber to Express /api/v1/orders/:orderNumber/return-eligibility', async () => {
      let forwardedUrl = '';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        forwardedUrl = url;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                orderNumber: 'DD-20261113-ABC12345',
                isEligible: true,
                items: [],
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/account/orders/DD-20261113-ABC12345/return-eligibility',
      );
      const res = await getReturnEligibility(req, {
        params: Promise.resolve({ orderNumber: 'DD-20261113-ABC12345' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/orders/DD-20261113-ABC12345/return-eligibility');
    });
  });

  describe('POST /api/account/orders/[orderNumber]/returns', () => {
    it('blocks request with 403 when origin header does not match host', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/account/orders/DD-20261113-ABC12345/returns',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://malicious-site.com',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            reason: 'DEFECTIVE',
            items: [{ orderItemId: 'item-1', quantity: 1 }],
          }),
        },
      );

      const res = await createReturn(req, {
        params: Promise.resolve({ orderNumber: 'DD-20261113-ABC12345' }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('INVALID_ORIGIN');
    });

    it('rejects invalid JSON request body with 400', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/account/orders/DD-20261113-ABC12345/returns',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
            'content-type': 'application/json',
          },
          body: 'invalid-json{',
        },
      );

      const res = await createReturn(req, {
        params: Promise.resolve({ orderNumber: 'DD-20261113-ABC12345' }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('BAD_REQUEST');
    });

    it('forwards valid create return payload to Express', async () => {
      let forwardedUrl = '';
      let forwardedBody: string | undefined;

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        forwardedUrl = url;
        forwardedBody = init?.body as string;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                returnRequest: {
                  returnNumber: 'RET-20261113-ABCD1234',
                  status: 'REQUESTED',
                },
              },
            }),
            { status: 201, headers: { 'content-type': 'application/json' } },
          ),
        );
      });

      const payload = {
        reason: 'DEFECTIVE',
        customerNote: 'Device does not turn on',
        items: [{ orderItemId: 'item-1', quantity: 1, reason: 'Does not turn on' }],
      };

      const req = new NextRequest(
        'http://localhost:3000/api/account/orders/DD-20261113-ABC12345/returns',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const res = await createReturn(req, {
        params: Promise.resolve({ orderNumber: 'DD-20261113-ABC12345' }),
      });

      expect(res.status).toBe(201);
      expect(forwardedUrl).toContain('/api/v1/orders/DD-20261113-ABC12345/returns');
      expect(JSON.parse(forwardedBody || '{}')).toEqual(payload);
    });
  });

  describe('GET /api/account/returns', () => {
    it('forwards query parameters (page, limit, status) to Express /api/v1/customer/returns', async () => {
      let forwardedUrl = '';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        forwardedUrl = url;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                returns: [],
                pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/account/returns?page=1&limit=10&status=REQUESTED',
      );
      const res = await listReturns(req);

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/customer/returns?page=1&limit=10&status=REQUESTED');
    });
  });

  describe('GET /api/account/returns/[returnNumber]', () => {
    it('forwards returnNumber to Express /api/v1/customer/returns/:returnNumber', async () => {
      let forwardedUrl = '';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        forwardedUrl = url;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                returnRequest: {
                  returnNumber: 'RET-20261113-ABCD1234',
                  status: 'REQUESTED',
                },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/account/returns/RET-20261113-ABCD1234',
      );
      const res = await getReturnDetail(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261113-ABCD1234' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/customer/returns/RET-20261113-ABCD1234');
    });
  });

  describe('POST /api/account/returns/[returnNumber]/cancel', () => {
    it('blocks request with 403 when origin header does not match host', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/account/returns/RET-20261113-ABCD1234/cancel',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://attacker.com',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ reason: 'Changed mind' }),
        },
      );

      const res = await cancelReturn(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261113-ABCD1234' }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('INVALID_ORIGIN');
    });

    it('rejects invalid JSON request body with 400', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/account/returns/RET-20261113-ABCD1234/cancel',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
            'content-type': 'application/json',
          },
          body: 'malformed-json{',
        },
      );

      const res = await cancelReturn(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261113-ABCD1234' }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('BAD_REQUEST');
    });

    it('forwards valid cancel return payload to Express', async () => {
      let forwardedUrl = '';
      let forwardedBody: string | undefined;

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        forwardedUrl = url;
        forwardedBody = init?.body as string;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                returnRequest: {
                  returnNumber: 'RET-20261113-ABCD1234',
                  status: 'CANCELLED',
                },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      });

      const payload = { reason: 'No longer needed' };

      const req = new NextRequest(
        'http://localhost:3000/api/account/returns/RET-20261113-ABCD1234/cancel',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const res = await cancelReturn(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261113-ABCD1234' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/customer/returns/RET-20261113-ABCD1234/cancel');
      expect(JSON.parse(forwardedBody || '{}')).toEqual(payload);
    });
  });
});
