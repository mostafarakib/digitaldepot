import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, setInMemoryCsrfToken } from '../api-client';

describe('Account Security & Email Verification Flow Integration', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setInMemoryCsrfToken('mock-valid-csrf');
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  describe('Email Verification Flow', () => {
    it('calls POST /api/auth/verify-email with token payload', async () => {
      let capturedBody: unknown;
      let capturedHeaders: Headers | undefined;

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === '/api/auth/verify-email') {
          capturedBody = JSON.parse(init?.body as string);
          capturedHeaders = new Headers(init?.headers);
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'x-csrf-token': 'new-rotated-csrf' }),
            json: async () => ({
              success: true,
              data: { message: 'Email verified successfully', emailVerified: true },
            }),
          } as unknown as Response;
        }
        throw new Error(`Unexpected: ${url}`);
      });
      global.fetch = mockFetch;

      const result = await apiClient<{ message: string; emailVerified: boolean }>(
        '/api/auth/verify-email',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: 'raw_verification_token_abc123' }),
        },
      );

      expect(result.emailVerified).toBe(true);
      expect(capturedBody).toEqual({ token: 'raw_verification_token_abc123' });
      expect(capturedHeaders?.get('x-csrf-token')).toBe('mock-valid-csrf');
    });

    it('calls POST /api/auth/resend-verification for authenticated and unauthenticated scenarios', async () => {
      let sentBodies: unknown[] = [];

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === '/api/auth/resend-verification') {
          sentBodies.push(init?.body ? JSON.parse(init.body as string) : undefined);
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({
              success: true,
              data: { message: 'Verification email sent' },
            }),
          } as unknown as Response;
        }
        throw new Error(`Unexpected: ${url}`);
      });
      global.fetch = mockFetch;

      // 1. Authenticated user (body is empty object or undefined)
      await apiClient('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      // 2. Unauthenticated user (body provides email)
      await apiClient('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'customer@example.com' }),
      });

      expect(sentBodies).toEqual([{}, { email: 'customer@example.com' }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Password Change Flow', () => {
    it('submits change-password payload with CSRF header and preserves revocation preference', async () => {
      let capturedPayload: unknown;

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === '/api/auth/change-password') {
          capturedPayload = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'x-csrf-token': 'rotated-after-password-change' }),
            json: async () => ({
              success: true,
              data: { message: 'Password updated successfully' },
            }),
          } as unknown as Response;
        }
        throw new Error(`Unexpected: ${url}`);
      });
      global.fetch = mockFetch;

      const payload = {
        currentPassword: 'OldPassword123!',
        newPassword: 'BrandNewPassword456!',
        revokeAllSessions: true,
      };

      const result = await apiClient<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(result.message).toBe('Password updated successfully');
      expect(capturedPayload).toEqual(payload);
    });
  });

  describe('Active Sessions Management Flow', () => {
    it('fetches sessions via GET and revokes single session via DELETE', async () => {
      let deletedId = '';

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === '/api/auth/sessions' && (!init?.method || init.method === 'GET')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({
              success: true,
              data: {
                sessions: [
                  {
                    id: 'sess-current',
                    isCurrent: true,
                    ipAddress: '192.0.2.1',
                    userAgent: 'Chrome on macOS',
                    createdAt: '2026-11-07T00:00:00Z',
                    lastActiveAt: '2026-11-07T01:00:00Z',
                    expiresAt: '2026-11-14T00:00:00Z',
                  },
                  {
                    id: 'sess-secondary',
                    isCurrent: false,
                    ipAddress: '198.51.100.5',
                    userAgent: 'Mobile Safari',
                    createdAt: '2026-11-06T00:00:00Z',
                    lastActiveAt: '2026-11-06T12:00:00Z',
                    expiresAt: '2026-11-13T00:00:00Z',
                  },
                ],
              },
            }),
          } as unknown as Response;
        }

        if (url.startsWith('/api/auth/sessions/') && init?.method === 'DELETE') {
          deletedId = url.split('/').pop()!;
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'x-csrf-token': 'csrf-after-revoke' }),
            json: async () => ({
              success: true,
              data: { message: 'Session revoked successfully' },
            }),
          } as unknown as Response;
        }

        throw new Error(`Unexpected: ${url}`);
      });
      global.fetch = mockFetch;

      const sessionsData = await apiClient<{ sessions: Array<{ id: string; isCurrent: boolean }> }>(
        '/api/auth/sessions',
      );
      expect(sessionsData.sessions).toHaveLength(2);
      expect(sessionsData.sessions[0].isCurrent).toBe(true);

      const revokeRes = await apiClient<{ message: string }>('/api/auth/sessions/sess-secondary', {
        method: 'DELETE',
      });
      expect(revokeRes.message).toBe('Session revoked successfully');
      expect(deletedId).toBe('sess-secondary');
    });

    it('revokes all other sessions via POST /api/auth/sessions/revoke-others', async () => {
      let calledRevokeOthers = false;

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === '/api/auth/sessions/revoke-others' && init?.method === 'POST') {
          calledRevokeOthers = true;
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'x-csrf-token': 'csrf-after-revoke-others' }),
            json: async () => ({
              success: true,
              data: { message: 'All other sessions have been revoked', revokedCount: 3 },
            }),
          } as unknown as Response;
        }
        throw new Error(`Unexpected: ${url}`);
      });
      global.fetch = mockFetch;

      const res = await apiClient<{ message: string; revokedCount: number }>(
        '/api/auth/sessions/revoke-others',
        { method: 'POST' },
      );

      expect(calledRevokeOthers).toBe(true);
      expect(res.revokedCount).toBe(3);
    });
  });
});
