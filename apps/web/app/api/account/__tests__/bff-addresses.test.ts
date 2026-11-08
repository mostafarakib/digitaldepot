import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getDivisions } from '../addresses/divisions/route';
import { GET as getAddresses, POST as createAddress } from '../addresses/route';
import {
  GET as getAddressById,
  PATCH as updateAddress,
  DELETE as deleteAddress,
} from '../addresses/[id]/route';
import { PATCH as setDefaultAddress } from '../addresses/[id]/default/route';

describe('BFF Account Addresses Route Handlers', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /api/account/addresses/divisions', () => {
    it('forwards GET request for static divisions hierarchy to Express API', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init.method ?? 'GET';
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              divisions: [{ id: 'DHAKA', nameEn: 'Dhaka', nameBn: 'ঢাকা', districts: [] }],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/account/addresses/divisions');
      const res = await getDivisions(req);

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/account/addresses/divisions');
      expect(forwardedMethod).toBe('GET');

      const data = await res.json();
      expect(data.data.divisions[0].id).toBe('DHAKA');
    });
  });

  describe('GET & POST /api/account/addresses', () => {
    it('forwards GET request with session cookies to Express API', async () => {
      let forwardedCookie = '';

      global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        const headers = init.headers as Record<string, string>;
        forwardedCookie = headers['cookie'] ?? '';
        return new Response(
          JSON.stringify({
            success: true,
            data: { addresses: [], total: 0, maxQuota: 10 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/account/addresses', {
        headers: { cookie: 'dd_access=test_token; dd_csrf=test_csrf' },
      });
      const res = await getAddresses(req);

      expect(res.status).toBe(200);
      expect(forwardedCookie).toBe('dd_access=test_token; dd_csrf=test_csrf');
    });

    it('rejects POST with missing Origin with 403 ORIGIN_REQUIRED', async () => {
      const req = new NextRequest('http://localhost:3000/api/account/addresses', {
        method: 'POST',
        body: JSON.stringify({ recipientName: 'Test' }),
      });

      const res = await createAddress(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe('ORIGIN_REQUIRED');
    });

    it('rejects POST with invalid Origin with 403 INVALID_ORIGIN', async () => {
      const req = new NextRequest('http://localhost:3000/api/account/addresses', {
        method: 'POST',
        headers: { origin: 'http://malicious.com' },
        body: JSON.stringify({ recipientName: 'Test' }),
      });

      const res = await createAddress(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe('INVALID_ORIGIN');
    });

    it('rejects POST with malformed JSON body with 400 BAD_REQUEST', async () => {
      const req = new Request('http://localhost:3000/api/account/addresses', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: 'invalid-json{',
      });

      const res = await createAddress(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('BAD_REQUEST');
    });

    it('forwards valid POST with CSRF header, cookies, and preserves rotated x-csrf-token in response', async () => {
      let forwardedCsrf = '';
      let forwardedCookie = '';

      global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        const headers = init.headers as Record<string, string>;
        forwardedCsrf = headers['x-csrf-token'] ?? '';
        forwardedCookie = headers['cookie'] ?? '';
        return new Response(
          JSON.stringify({
            success: true,
            data: { address: { id: 'addr_123', recipientName: 'Rahim' } },
          }),
          {
            status: 201,
            headers: {
              'content-type': 'application/json',
              'x-csrf-token': 'new_rotated_csrf_token',
            },
          },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/account/addresses', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          cookie: 'dd_access=test_token; dd_csrf=old_csrf',
          'x-csrf-token': 'old_csrf',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          recipientName: 'Rahim',
          phone: '+8801712345678',
          divisionId: 'DHAKA',
          districtId: 'DHAKA',
          upazila: 'Dhanmondi',
          streetAddress: 'House 1',
        }),
      });

      const res = await createAddress(req);
      expect(res.status).toBe(201);
      expect(forwardedCsrf).toBe('old_csrf');
      expect(forwardedCookie).toBe('dd_access=test_token; dd_csrf=old_csrf');
      expect(res.headers.get('x-csrf-token')).toBe('new_rotated_csrf_token');
    });
  });

  describe('Dynamic /api/account/addresses/[id]', () => {
    const params = Promise.resolve({ id: 'addr_abc123' });

    it('forwards GET by id resolving Next.js 16 async params', async () => {
      let forwardedUrl = '';

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({ success: true, data: { address: { id: 'addr_abc123' } } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/account/addresses/addr_abc123');
      const res = await getAddressById(req, { params });

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/account/addresses/addr_abc123');
    });

    it('rejects PATCH with missing Origin with 403', async () => {
      const req = new NextRequest('http://localhost:3000/api/account/addresses/addr_abc123', {
        method: 'PATCH',
        body: JSON.stringify({ recipientName: 'New' }),
      });

      const res = await updateAddress(req, { params });
      expect(res.status).toBe(403);
    });

    it('forwards PATCH with valid Origin and body to Express', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init.method ?? '';
        return new Response(
          JSON.stringify({ success: true, data: { address: { id: 'addr_abc123' } } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/account/addresses/addr_abc123', {
        method: 'PATCH',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({ recipientName: 'Updated Name' }),
      });

      const res = await updateAddress(req, { params });
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/account/addresses/addr_abc123');
      expect(forwardedMethod).toBe('PATCH');
    });

    it('forwards DELETE with valid Origin to Express', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init.method ?? '';
        return new Response(
          JSON.stringify({ success: true, data: { message: 'Address deleted successfully' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/account/addresses/addr_abc123', {
        method: 'DELETE',
        headers: { origin: 'http://localhost:3000' },
      });

      const res = await deleteAddress(req, { params });
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/account/addresses/addr_abc123');
      expect(forwardedMethod).toBe('DELETE');
    });
  });

  describe('PATCH /api/account/addresses/[id]/default', () => {
    const params = Promise.resolve({ id: 'addr_def456' });

    it('rejects default promotion with missing Origin with 403', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/account/addresses/addr_def456/default',
        {
          method: 'PATCH',
        },
      );

      const res = await setDefaultAddress(req, { params });
      expect(res.status).toBe(403);
    });

    it('forwards default promotion with valid Origin to Express', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init.method ?? '';
        return new Response(
          JSON.stringify({
            success: true,
            data: { address: { id: 'addr_def456', isDefault: true } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/account/addresses/addr_def456/default',
        {
          method: 'PATCH',
          headers: { origin: 'http://localhost:3000' },
        },
      );

      const res = await setDefaultAddress(req, { params });
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/account/addresses/addr_def456/default');
      expect(forwardedMethod).toBe('PATCH');
    });
  });
});
