import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { validateBffOrigin, forwardToExpress } from '../bff-utils';
import { POST as loginHandler } from '../login/route';
import { POST as registerHandler } from '../register/route';
import { POST as refreshHandler } from '../refresh/route';
import { POST as logoutHandler } from '../logout/route';
import { GET as csrfHandler } from '../csrf/route';
import { GET as meHandler } from '../me/route';

describe('BFF Utilities & Route Handlers', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('validateBffOrigin', () => {
    it('rejects request with missing Origin header with 403 ORIGIN_REQUIRED', () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
      });
      const errorRes = validateBffOrigin(req);
      expect(errorRes).not.toBeNull();
      expect(errorRes?.status).toBe(403);
    });

    it('rejects request with mismatched Origin header with 403 INVALID_ORIGIN', () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          origin: 'http://malicious-site.com',
        },
      });
      const errorRes = validateBffOrigin(req);
      expect(errorRes).not.toBeNull();
      expect(errorRes?.status).toBe(403);
    });

    it('accepts request with matching storefront origin', () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
        },
      });
      const errorRes = validateBffOrigin(req);
      expect(errorRes).toBeNull();
    });
  });

  describe('forwardToExpress', () => {
    it('preserves multiple Set-Cookie headers independently and forwards rotated x-csrf-token', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        const headers = new Headers();
        headers.append('set-cookie', 'dd_access_token=acc_123; Path=/; HttpOnly; SameSite=Lax');
        headers.append('set-cookie', 'dd_refresh_token=ref_456; Path=/; HttpOnly; SameSite=Lax');
        headers.append('set-cookie', 'dd_csrf=csrf_789; Path=/; SameSite=Lax');
        headers.set('x-csrf-token', 'rotated-csrf-token-abc');
        headers.set('content-type', 'application/json');

        return {
          ok: true,
          status: 200,
          headers,
          json: async () => ({
            success: true,
            data: { user: { id: 'u1', email: 'user@example.com' } },
          }),
        } as unknown as Response;
      });
      global.fetch = mockFetch;

      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          cookie: 'dd_csrf=old_csrf',
          'x-csrf-token': 'old_csrf',
        },
      });

      const res = await forwardToExpress('/api/v1/auth/login', {
        method: 'POST',
        request: req,
        body: { email: 'user@example.com', password: 'password123' },
      });

      expect(res.status).toBe(200);

      // Verify multiple Set-Cookie headers preserved independently
      const setCookies = res.headers.getSetCookie();
      expect(setCookies.length).toBe(3);
      expect(setCookies[0]).toContain('dd_access_token=acc_123');
      expect(setCookies[1]).toContain('dd_refresh_token=ref_456');
      expect(setCookies[2]).toContain('dd_csrf=csrf_789');

      // Verify rotated x-csrf-token response header forwarded
      expect(res.headers.get('x-csrf-token')).toBe('rotated-csrf-token-abc');

      // Verify tokens never exposed in JSON body
      const jsonBody = await res.json();
      expect(jsonBody).toEqual({
        success: true,
        data: { user: { id: 'u1', email: 'user@example.com' } },
      });
      expect(JSON.stringify(jsonBody)).not.toContain('acc_123');
      expect(JSON.stringify(jsonBody)).not.toContain('ref_456');
    });

    it('returns 502 with BACKEND_CONNECTION_ERROR if Express backend is unreachable', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
      });

      const res = await forwardToExpress('/api/v1/auth/login', {
        method: 'POST',
        request: req,
        body: { email: 'a@b.com' },
      });

      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.error.code).toBe('BACKEND_CONNECTION_ERROR');
    });
  });

  describe('Route Handlers', () => {
    it('login handler enforces Origin check and forwards request', async () => {
      const unauthReq = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { origin: 'http://evil.com' },
      });
      const unauthRes = await loginHandler(unauthReq);
      expect(unauthRes.status).toBe(403);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ success: true, data: { user: { id: 'u1' } } }),
      } as unknown as Response);

      const validReq = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'u1@example.com', password: 'password123' }),
      });
      const validRes = await loginHandler(validReq);
      expect(validRes.status).toBe(200);
    });

    it('register handler enforces Origin check', async () => {
      const unauthReq = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { origin: 'http://evil.com' },
      });
      const unauthRes = await registerHandler(unauthReq);
      expect(unauthRes.status).toBe(403);
    });

    it('refresh handler enforces Origin check', async () => {
      const unauthReq = new NextRequest('http://localhost:3000/api/auth/refresh', {
        method: 'POST',
        headers: { origin: 'http://evil.com' },
      });
      const unauthRes = await refreshHandler(unauthReq);
      expect(unauthRes.status).toBe(403);
    });

    it('logout handler enforces Origin check', async () => {
      const unauthReq = new NextRequest('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: { origin: 'http://evil.com' },
      });
      const unauthRes = await logoutHandler(unauthReq);
      expect(unauthRes.status).toBe(403);
    });

    it('csrf and me handlers allow GET without Origin header', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/csrf')) {
          const headers = new Headers();
          headers.set('x-csrf-token', 'csrf-init-123');
          return {
            ok: true,
            status: 200,
            headers,
            json: async () => ({ success: true, data: { initialized: true } }),
          } as unknown as Response;
        }

        if (url.includes('/me')) {
          const headers = new Headers();
          headers.set('content-type', 'application/json');
          return {
            ok: true,
            status: 200,
            headers,
            json: async () => ({ success: true, data: { id: 'u1' } }),
          } as unknown as Response;
        }

        throw new Error(`Unexpected: ${url}`);
      });

      const csrfReq = new NextRequest('http://localhost:3000/api/auth/csrf', { method: 'GET' });
      const csrfRes = await csrfHandler(csrfReq);
      expect(csrfRes.status).toBe(200);
      expect(csrfRes.headers.get('x-csrf-token')).toBe('csrf-init-123');

      const meReq = new NextRequest('http://localhost:3000/api/auth/me', { method: 'GET' });
      const meRes = await meHandler(meReq);
      expect(meRes.status).toBe(200);
      const meJson = await meRes.json();
      expect(meJson.data.id).toBe('u1');
    });
  });
});
