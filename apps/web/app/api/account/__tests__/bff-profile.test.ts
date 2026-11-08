import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH } from '../profile/route';

describe('BFF Account Profile Route Handler', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /api/account/profile', () => {
    it('forwards GET request to Express API', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init.method ?? 'GET';
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              email: 'customer@example.com',
              role: 'CUSTOMER',
              emailVerified: true,
              profile: {
                firstName: 'Rahim',
                lastName: 'Chowdhury',
                phone: '+8801712345678',
              },
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/account/profile', {
        method: 'GET',
        headers: {
          cookie: 'dd_access=test; dd_csrf=test_csrf',
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/account/profile');
      expect(forwardedMethod).toBe('GET');

      const data = await res.json();
      expect(data.data.profile.firstName).toBe('Rahim');
    });
  });

  describe('PATCH /api/account/profile', () => {
    it('rejects mutation request with missing Origin header with 403', async () => {
      const req = new NextRequest('http://localhost:3000/api/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({ firstName: 'NewName' }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe('ORIGIN_REQUIRED');
    });

    it('rejects mutation request with invalid Origin header with 403', async () => {
      const req = new NextRequest('http://localhost:3000/api/account/profile', {
        method: 'PATCH',
        headers: {
          origin: 'http://evil.com',
        },
        body: JSON.stringify({ firstName: 'NewName' }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe('INVALID_ORIGIN');
    });

    it('rejects malformed JSON body with 400 BAD_REQUEST', async () => {
      const req = new Request('http://localhost:3000/api/account/profile', {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: 'invalid-json{',
      });

      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('BAD_REQUEST');
    });

    it('forwards valid PATCH request with origin and headers to Express API', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';
      let forwardedBody = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init.method ?? 'GET';
        forwardedBody = (init.body as string) || '';
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              profile: {
                firstName: 'Updated',
                lastName: 'User',
                phone: '+8801712345678',
              },
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'x-csrf-token': 'new_rotated_csrf',
            },
          },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/account/profile', {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          'x-csrf-token': 'csrf_token_123',
          cookie: 'dd_access=test_token',
        },
        body: JSON.stringify({
          firstName: 'Updated',
          lastName: 'User',
          phone: '01712345678',
        }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/account/profile');
      expect(forwardedMethod).toBe('PATCH');
      expect(forwardedBody).toContain('Updated');
      expect(res.headers.get('x-csrf-token')).toBe('new_rotated_csrf');

      const data = await res.json();
      expect(data.data.profile.firstName).toBe('Updated');
    });
  });
});
