import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getReturns } from '../returns/route';
import { GET as getReturnByNumber } from '../returns/[returnNumber]/route';
import { POST as approveReturn } from '../returns/[returnNumber]/approve/route';
import { POST as rejectReturn } from '../returns/[returnNumber]/reject/route';
import { POST as inspectReturn } from '../returns/[returnNumber]/inspect/route';

describe('BFF Admin Returns Route Handlers (Phase 7C)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /api/admin/returns', () => {
    it('forwards GET request with query params to Express backend', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: { returns: [], pagination: { total: 0 } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/returns?page=1&limit=20&status=REQUESTED&returnNumber=RET-123',
      );
      const res = await getReturns(req);

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/returns');
      expect(forwardedUrl).toContain('status=REQUESTED');
      expect(forwardedUrl).toContain('returnNumber=RET-123');
    });
  });

  describe('GET /api/admin/returns/[returnNumber]', () => {
    it('forwards GET request for specific return', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: { return: { id: 'ret-123', returnNumber: 'RET-20261114-12345678' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/admin/returns/RET-20261114-12345678');
      const res = await getReturnByNumber(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261114-12345678' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/returns/RET-20261114-12345678');
    });
  });

  describe('POST /api/admin/returns/[returnNumber]/approve', () => {
    it('rejects cross-origin request with 403', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/admin/returns/RET-20261114-12345678/approve',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://malicious-site.com',
          },
          body: JSON.stringify({ notes: 'Staff approval' }),
        },
      );

      const res = await approveReturn(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261114-12345678' }),
      });
      expect(res.status).toBe(403);
    });

    it('forwards valid approval to Express backend', async () => {
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
            data: { return: { id: 'ret-123', status: 'APPROVED' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/returns/RET-20261114-12345678/approve',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ notes: 'Item looks eligible' }),
        },
      );

      const res = await approveReturn(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261114-12345678' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedMethod).toBe('POST');
      expect(forwardedUrl).toContain('/api/v1/admin/returns/RET-20261114-12345678/approve');
      expect(JSON.parse(forwardedBody)).toEqual({ notes: 'Item looks eligible' });
    });
  });

  describe('POST /api/admin/returns/[returnNumber]/reject', () => {
    it('rejects cross-origin request with 403', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/admin/returns/RET-20261114-12345678/reject',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://malicious-site.com',
          },
          body: JSON.stringify({ reason: 'Out of policy' }),
        },
      );

      const res = await rejectReturn(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261114-12345678' }),
      });
      expect(res.status).toBe(403);
    });

    it('forwards valid rejection to Express backend', async () => {
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
            data: { return: { id: 'ret-123', status: 'REJECTED' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/returns/RET-20261114-12345678/reject',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ reason: 'Used software cannot be returned' }),
        },
      );

      const res = await rejectReturn(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261114-12345678' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedMethod).toBe('POST');
      expect(forwardedUrl).toContain('/api/v1/admin/returns/RET-20261114-12345678/reject');
      expect(JSON.parse(forwardedBody)).toEqual({ reason: 'Used software cannot be returned' });
    });
  });

  describe('POST /api/admin/returns/[returnNumber]/inspect', () => {
    it('rejects cross-origin request with 403', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/admin/returns/RET-20261114-12345678/inspect',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://malicious-site.com',
          },
          body: JSON.stringify({
            items: [{ returnItemId: 'item-1', condition: 'GOOD', inspectedQuantity: 1 }],
          }),
        },
      );

      const res = await inspectReturn(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261114-12345678' }),
      });
      expect(res.status).toBe(403);
    });

    it('forwards valid inspection and restocking to Express backend', async () => {
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
            data: { return: { id: 'ret-123', status: 'RECEIVED' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const inspectPayload = {
        items: [
          { returnItemId: 'item-1', condition: 'GOOD', inspectedQuantity: 2 },
          { returnItemId: 'item-2', condition: 'DAMAGED', inspectedQuantity: 1 },
        ],
        notes: 'Inspection verified by QA lead',
      };

      const req = new NextRequest(
        'http://localhost:3000/api/admin/returns/RET-20261114-12345678/inspect',
        {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
            'content-type': 'application/json',
          },
          body: JSON.stringify(inspectPayload),
        },
      );

      const res = await inspectReturn(req, {
        params: Promise.resolve({ returnNumber: 'RET-20261114-12345678' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedMethod).toBe('POST');
      expect(forwardedUrl).toContain('/api/v1/admin/returns/RET-20261114-12345678/inspect');
      expect(JSON.parse(forwardedBody)).toEqual(inspectPayload);
    });
  });
});
