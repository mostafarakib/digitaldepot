import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getCustomers } from '../customers/route';
import { GET as getCustomerById } from '../customers/[id]/route';
import { PATCH as updateCustomerStatus } from '../customers/[id]/status/route';

describe('BFF Admin Customers Route Handlers (Phase 8B)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /api/admin/customers', () => {
    it('forwards GET request with query params to Express backend', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: { customers: [], stats: {}, pagination: { total: 0 } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/customers?page=1&limit=20&status=ACTIVE&search=Rahim',
      );
      const res = await getCustomers(req);

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/customers');
      expect(forwardedUrl).toContain('status=ACTIVE');
      expect(forwardedUrl).toContain('search=Rahim');
    });
  });

  describe('GET /api/admin/customers/[id]', () => {
    it('forwards GET request for specific customer', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: { customer: { id: 'cust-123', email: 'cust@example.com' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/admin/customers/cust-123');
      const res = await getCustomerById(req, {
        params: Promise.resolve({ id: 'cust-123' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/customers/cust-123');
    });
  });

  describe('PATCH /api/admin/customers/[id]/status', () => {
    it('rejects cross-origin request with 403 Forbidden', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/customers/cust-123/status', {
        method: 'PATCH',
        headers: {
          origin: 'http://malicious-site.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'SUSPENDED', reason: 'Fraud' }),
      });

      const res = await updateCustomerStatus(req, {
        params: Promise.resolve({ id: 'cust-123' }),
      });

      expect(res.status).toBe(403);
    });

    it('rejects invalid JSON with 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/customers/cust-123/status', {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: 'invalid-json',
      });

      const res = await updateCustomerStatus(req, {
        params: Promise.resolve({ id: 'cust-123' }),
      });

      expect(res.status).toBe(400);
    });

    it('forwards status update with valid origin to Express backend', async () => {
      let forwardedUrl = '';
      let forwardedBody = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedBody = (init.body as string) ?? '';
        return new Response(
          JSON.stringify({
            success: true,
            data: { customer: { id: 'cust-123', status: 'SUSPENDED' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/admin/customers/cust-123/status', {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          'x-csrf-token': 'valid-csrf-token',
        },
        body: JSON.stringify({ status: 'SUSPENDED', reason: 'Investigation' }),
      });

      const res = await updateCustomerStatus(req, {
        params: Promise.resolve({ id: 'cust-123' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/customers/cust-123/status');
      expect(JSON.parse(forwardedBody)).toEqual({
        status: 'SUSPENDED',
        reason: 'Investigation',
      });
    });
  });
});
