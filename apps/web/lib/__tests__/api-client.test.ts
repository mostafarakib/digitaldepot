import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiClient,
  ApiError,
  setInMemoryCsrfToken,
  getInMemoryCsrfToken,
  ensureCsrfToken,
  onAuthLogout,
} from '../api-client';

describe('apiClient and auth coordination', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setInMemoryCsrfToken(null);
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  describe('CSRF Token Handling & Rotation', () => {
    it('uses existing in-memory CSRF token for mutations', async () => {
      setInMemoryCsrfToken('mock-memory-csrf');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ success: true, data: { result: 'ok' } }),
      } as unknown as Response);
      global.fetch = mockFetch;

      const result = await apiClient<{ result: string }>('/api/test-mutation', {
        method: 'POST',
      });

      expect(result).toEqual({ result: 'ok' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callHeaders = mockFetch.mock.calls[0][1].headers as Headers;
      expect(callHeaders.get('x-csrf-token')).toBe('mock-memory-csrf');
    });

    it('bootstraps CSRF token from /api/auth/csrf if in-memory token is empty', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/auth/csrf') {
          const headers = new Headers();
          headers.set('x-csrf-token', 'bootstrapped-csrf-123');
          return {
            ok: true,
            status: 200,
            headers,
            json: async () => ({ success: true, data: { initialized: true } }),
          } as unknown as Response;
        }

        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ success: true, data: { saved: true } }),
        } as unknown as Response;
      });
      global.fetch = mockFetch;

      const result = await apiClient<{ saved: boolean }>('/api/test-mutation', {
        method: 'POST',
      });

      expect(result).toEqual({ saved: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][0]).toBe('/api/auth/csrf');
      expect(getInMemoryCsrfToken()).toBe('bootstrapped-csrf-123');
      const mutationHeaders = mockFetch.mock.calls[1][1].headers as Headers;
      expect(mutationHeaders.get('x-csrf-token')).toBe('bootstrapped-csrf-123');
    });

    it('bootstraps CSRF token from /api/auth/csrf even when document.cookie already contains dd_csrf', async () => {
      // Simulate post-OAuth redirect state: cookie exists in document.cookie, but in-memory token is empty
      setInMemoryCsrfToken(null);
      (global as unknown as { document: unknown }).document = {
        cookie: 'dd_csrf=cookie-csrf-from-redirect.hmac',
      };

      try {
        const mockFetch = vi.fn().mockImplementation(async (url: string) => {
          if (url === '/api/auth/csrf') {
            const headers = new Headers();
            headers.set('x-csrf-token', 'header-csrf-token-abc');
            return {
              ok: true,
              status: 200,
              headers,
              json: async () => ({ success: true, data: { initialized: true } }),
            } as unknown as Response;
          }

          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({ success: true, data: { posted: true } }),
          } as unknown as Response;
        });
        global.fetch = mockFetch;

        const result = await apiClient<{ posted: boolean }>('/api/test-mutation', {
          method: 'POST',
        });

        expect(result).toEqual({ posted: true });
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch.mock.calls[0][0]).toBe('/api/auth/csrf');
        expect(getInMemoryCsrfToken()).toBe('header-csrf-token-abc');
        const mutationHeaders = mockFetch.mock.calls[1][1].headers as Headers;
        expect(mutationHeaders.get('x-csrf-token')).toBe('header-csrf-token-abc');
      } finally {
        delete (global as Record<string, unknown>).document;
      }
    });

    it('rotates in-memory CSRF token whenever a response includes x-csrf-token', async () => {
      setInMemoryCsrfToken('old-csrf-token');

      const responseHeaders = new Headers();
      responseHeaders.set('x-csrf-token', 'rotated-csrf-token-999');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: responseHeaders,
        json: async () => ({ success: true, data: { message: 'hello' } }),
      } as unknown as Response);
      global.fetch = mockFetch;

      await apiClient('/api/some-endpoint', { method: 'GET' });

      expect(getInMemoryCsrfToken()).toBe('rotated-csrf-token-999');
    });
  });

  describe('Silent Refresh & Retry Boundaries', () => {
    it('refreshes token once on 401 and retries original request', async () => {
      setInMemoryCsrfToken('valid-csrf');
      let meCallCount = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/auth/me') {
          meCallCount++;
          if (meCallCount === 1) {
            // First attempt fails with 401 (expired access token)
            return {
              ok: false,
              status: 401,
              headers: new Headers(),
              json: async () => ({
                success: false,
                error: { code: 'AUTHENTICATION_REQUIRED', message: 'Token expired' },
              }),
            } as unknown as Response;
          }
          // Retry attempt succeeds
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({
              success: true,
              data: { id: 'usr-123', email: 'test@example.com' },
            }),
          } as unknown as Response;
        }

        if (url === '/api/auth/refresh') {
          const headers = new Headers();
          headers.set('x-csrf-token', 'refreshed-csrf');
          return {
            ok: true,
            status: 200,
            headers,
            json: async () => ({ success: true, data: { refreshed: true } }),
          } as unknown as Response;
        }

        throw new Error(`Unexpected url: ${url}`);
      });
      global.fetch = mockFetch;

      const data = await apiClient<{ id: string; email: string }>('/api/auth/me');

      expect(data).toEqual({ id: 'usr-123', email: 'test@example.com' });
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[0][0]).toBe('/api/auth/me');
      expect(mockFetch.mock.calls[1][0]).toBe('/api/auth/refresh');
      expect(mockFetch.mock.calls[2][0]).toBe('/api/auth/me');
      expect(getInMemoryCsrfToken()).toBe('refreshed-csrf');
    });

    it('enforces maximum 1 retry and throws ApiError if retry also fails with 401', async () => {
      setInMemoryCsrfToken('valid-csrf');

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/protected-data') {
          return {
            ok: false,
            status: 401,
            headers: new Headers(),
            json: async () => ({
              success: false,
              error: { code: 'AUTHENTICATION_REQUIRED', message: 'Unauthorized' },
            }),
          } as unknown as Response;
        }

        if (url === '/api/auth/refresh') {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({ success: true, data: { refreshed: true } }),
          } as unknown as Response;
        }

        throw new Error(`Unexpected url: ${url}`);
      });
      global.fetch = mockFetch;

      await expect(apiClient('/api/protected-data')).rejects.toThrow(ApiError);
      // 1 initial attempt + 1 refresh + 1 retry = 3 calls total
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('does not attempt silent refresh for excluded auth paths (login, register, logout, refresh)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
        }),
      } as unknown as Response);
      global.fetch = mockFetch;

      await expect(
        apiClient('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: 'wrong@example.com', password: 'password123' }),
        }),
      ).rejects.toThrow(ApiError);

      // Must only call /api/auth/login (plus possibly csrf bootstrap), NEVER /api/auth/refresh
      const urlsCalled = mockFetch.mock.calls.map((c) => c[0]);
      expect(urlsCalled).not.toContain('/api/auth/refresh');
    });

    it('does not attempt silent refresh on HTTP 500 server error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: async () => ({
          success: false,
          error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database failure' },
        }),
      } as unknown as Response);
      global.fetch = mockFetch;

      await expect(apiClient('/api/some-resource')).rejects.toThrow(ApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not attempt silent refresh on network connection errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

      await expect(apiClient('/api/some-resource')).rejects.toThrow('Failed to fetch');
    });

    it('handles REFRESH_ALREADY_ROTATED with grace backoff and succeeds on retry', async () => {
      setInMemoryCsrfToken('valid-csrf');
      let protectedCallCount = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/protected-data') {
          protectedCallCount++;
          if (protectedCallCount === 1) {
            return {
              ok: false,
              status: 401,
              headers: new Headers(),
              json: async () => ({
                success: false,
                error: { code: 'AUTHENTICATION_REQUIRED', message: 'Unauthorized' },
              }),
            } as unknown as Response;
          }
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({ success: true, data: { secret: 'gold' } }),
          } as unknown as Response;
        }

        if (url === '/api/auth/refresh') {
          // Returns 401 with REFRESH_ALREADY_ROTATED (another tab already refreshed it < 10s ago)
          return {
            ok: false,
            status: 401,
            headers: new Headers(),
            json: async () => ({
              success: false,
              error: {
                code: 'REFRESH_ALREADY_ROTATED',
                message: 'Token was recently rotated by another concurrent request',
              },
            }),
          } as unknown as Response;
        }

        throw new Error(`Unexpected url: ${url}`);
      });
      global.fetch = mockFetch;

      const data = await apiClient<{ secret: string }>('/api/protected-data');
      expect(data).toEqual({ secret: 'gold' });
      expect(protectedCallCount).toBe(2);
    });

    it('triggers logout listeners when refresh fails due to TOKEN_REUSE_DETECTED or SESSION_REVOKED_OR_EXPIRED', async () => {
      setInMemoryCsrfToken('valid-csrf');
      const logoutListener = vi.fn();
      const unsubscribe = onAuthLogout(logoutListener);

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/protected-data') {
          return {
            ok: false,
            status: 401,
            headers: new Headers(),
            json: async () => ({
              success: false,
              error: { code: 'AUTHENTICATION_REQUIRED', message: 'Unauthorized' },
            }),
          } as unknown as Response;
        }

        if (url === '/api/auth/refresh') {
          return {
            ok: false,
            status: 401,
            headers: new Headers(),
            json: async () => ({
              success: false,
              error: {
                code: 'TOKEN_REUSE_DETECTED',
                message: 'Compromised token family revoked',
              },
            }),
          } as unknown as Response;
        }

        throw new Error(`Unexpected url: ${url}`);
      });
      global.fetch = mockFetch;

      await expect(apiClient('/api/protected-data')).rejects.toThrow(ApiError);
      expect(logoutListener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });
  });

  describe('Web Locks, In-Flight Coordination & CSRF Recovery', () => {
    const originalNavigator = global.navigator;
    let mockCookie = '';

    beforeEach(() => {
      mockCookie = '';
      Object.defineProperty(global, 'document', {
        value: {
          get cookie() {
            return mockCookie;
          },
          set cookie(val: string) {
            if (val.includes('Max-Age=0') || val === '') {
              mockCookie = '';
            } else {
              mockCookie = val.split(';')[0];
            }
          },
        },
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        writable: true,
        configurable: true,
      });
      delete (global as Record<string, unknown>).document;
    });

    it('supported browsers use Web Locks for bootstrap coordination', async () => {
      let lockRequested = false;
      const mockLocks = {
        request: vi
          .fn()
          .mockImplementation(async (name: string, callback: () => Promise<string>) => {
            if (name === 'dd_csrf_bootstrap_lock') {
              lockRequested = true;
            }
            return await callback();
          }),
      };
      Object.defineProperty(global, 'navigator', {
        value: { locks: mockLocks },
        writable: true,
        configurable: true,
      });

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/auth/csrf') {
          const headers = new Headers();
          headers.set('x-csrf-token', 'lock-acquired-token');
          return {
            ok: true,
            status: 200,
            headers,
            json: async () => ({ success: true, data: { initialized: true } }),
          } as unknown as Response;
        }
        throw new Error(`Unexpected url: ${url}`);
      });
      global.fetch = mockFetch;

      const token = await ensureCsrfToken();
      expect(token).toBe('lock-acquired-token');
      expect(lockRequested).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('bootstrap callback failure never triggers an uncoordinated second fetch outside the lock', async () => {
      let lockAcquired = false;
      const mockLocks = {
        request: vi
          .fn()
          .mockImplementation(async (name: string, callback: () => Promise<string>) => {
            lockAcquired = true;
            return await callback();
          }),
      };
      Object.defineProperty(global, 'navigator', {
        value: { locks: mockLocks },
        writable: true,
        configurable: true,
      });

      const mockFetch = vi.fn().mockRejectedValue(new Error('Network connection timeout'));
      global.fetch = mockFetch;

      await expect(ensureCsrfToken()).rejects.toThrow('Network connection timeout');
      expect(lockAcquired).toBe(true);
      // Must be called exactly once inside the lock callback; NEVER re-executed outside the lock!
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('lock acquisition failure is handled separately from callback failure and delegates to fallback', async () => {
      const mockLocks = {
        request: vi.fn().mockRejectedValue(new Error('SecurityError: Lock request rejected')),
      };
      Object.defineProperty(global, 'navigator', {
        value: { locks: mockLocks },
        writable: true,
        configurable: true,
      });

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/auth/csrf') {
          const headers = new Headers();
          headers.set('x-csrf-token', 'fallback-direct-token');
          return {
            ok: true,
            status: 200,
            headers,
            json: async () => ({ success: true, data: { initialized: true } }),
          } as unknown as Response;
        }
        throw new Error(`Unexpected url: ${url}`);
      });
      global.fetch = mockFetch;

      const token = await ensureCsrfToken();
      expect(token).toBe('fallback-direct-token');
      expect(mockLocks.request).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('unsupported environments execute bootstrap directly with in-tab deduplication', async () => {
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      });

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/auth/csrf') {
          await new Promise((r) => setTimeout(r, 20));
          const headers = new Headers();
          headers.set('x-csrf-token', 'deduped-token');
          return {
            ok: true,
            status: 200,
            headers,
            json: async () => ({ success: true, data: { initialized: true } }),
          } as unknown as Response;
        }
        throw new Error(`Unexpected url: ${url}`);
      });
      global.fetch = mockFetch;

      const [token1, token2] = await Promise.all([ensureCsrfToken(), ensureCsrfToken()]);
      expect(token1).toBe('deduped-token');
      expect(token2).toBe('deduped-token');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('forced recovery arriving while normal bootstrap is in flight awaits it and adopts newer cookie', async () => {
      let resolveBootstrap: (value: Response) => void;
      const pendingFetch = new Promise<Response>((resolve) => {
        resolveBootstrap = resolve;
      });

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/auth/csrf') {
          return await pendingFetch;
        }
        throw new Error(`Unexpected url: ${url}`);
      });
      global.fetch = mockFetch;

      // 1. Normal bootstrap starts
      const normalPromise = ensureCsrfToken();

      // 2. Forced recovery arrives with failedToken='stale-tok' while normal bootstrap is still pending
      const forcedPromise = ensureCsrfToken({ forceRefresh: true, failedToken: 'stale-tok' });

      // Simulate the normal bootstrap resolving and setting cookie to 'fresh-tok'
      document.cookie = 'dd_csrf=fresh-tok; path=/';
      const headers = new Headers();
      headers.set('x-csrf-token', 'fresh-tok');
      resolveBootstrap!({
        ok: true,
        status: 200,
        headers,
        json: async () => ({ success: true, data: {} }),
      } as unknown as Response);

      const [normalResult, forcedResult] = await Promise.all([normalPromise, forcedPromise]);
      expect(normalResult).toBe('fresh-tok');
      expect(forcedResult).toBe('fresh-tok');
      // Exactly 1 network fetch occurred; forced recovery did NOT trigger a redundant second rotation!
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('forced recovery performs new bootstrap when cookie still equals failedToken', async () => {
      let bootstrapCalls = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/auth/csrf') {
          bootstrapCalls++;
          const token = `token-gen-${bootstrapCalls}`;
          document.cookie = `dd_csrf=${token}; path=/`;
          const headers = new Headers();
          headers.set('x-csrf-token', token);
          return {
            ok: true,
            status: 200,
            headers,
            json: async () => ({ success: true, data: {} }),
          } as unknown as Response;
        }
        throw new Error(`Unexpected url: ${url}`);
      });
      global.fetch = mockFetch;

      // Set cookie to stale value
      document.cookie = 'dd_csrf=stale-token; path=/';

      // Forced recovery rejects stale-token and triggers new bootstrap
      const token = await ensureCsrfToken({ forceRefresh: true, failedToken: 'stale-token' });
      expect(token).toBe('token-gen-1');
      expect(bootstrapCalls).toBe(1);
    });

    it('concurrent forced recovery calls deduplicate without duplicate rotations', async () => {
      let bootstrapCalls = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/auth/csrf') {
          bootstrapCalls++;
          await new Promise((r) => setTimeout(r, 20));
          const token = `forced-token-${bootstrapCalls}`;
          document.cookie = `dd_csrf=${token}; path=/`;
          const headers = new Headers();
          headers.set('x-csrf-token', token);
          return {
            ok: true,
            status: 200,
            headers,
            json: async () => ({ success: true, data: {} }),
          } as unknown as Response;
        }
        throw new Error(`Unexpected url: ${url}`);
      });
      global.fetch = mockFetch;

      document.cookie = 'dd_csrf=expired-token; path=/';

      const [res1, res2] = await Promise.all([
        ensureCsrfToken({ forceRefresh: true, failedToken: 'expired-token' }),
        ensureCsrfToken({ forceRefresh: true, failedToken: 'expired-token' }),
      ]);

      expect(res1).toBe('forced-token-1');
      expect(res2).toBe('forced-token-1');
      expect(bootstrapCalls).toBe(1);
    });

    it('GET requests never trigger CSRF recovery even on 403 CSRF_TOKEN_MISMATCH', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers(),
        json: async () => ({
          success: false,
          error: { code: 'CSRF_TOKEN_MISMATCH', message: 'CSRF mismatch' },
        }),
      } as unknown as Response);
      global.fetch = mockFetch;

      await expect(apiClient('/api/test-get', { method: 'GET' })).rejects.toMatchObject({
        code: 'CSRF_TOKEN_MISMATCH',
        status: 403,
      });

      // GET method must never invoke /api/auth/csrf or retry
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const urlsCalled = mockFetch.mock.calls.map((c) => c[0]);
      expect(urlsCalled).not.toContain('/api/auth/csrf');
    });

    it('unsupported or non-CSRF 403 error codes never trigger recovery', async () => {
      setInMemoryCsrfToken('mock-csrf');
      const nonCsrfCodes = [
        'CSRF_ORIGIN_INVALID',
        'ORIGIN_REQUIRED',
        'INVALID_ORIGIN',
        'INSUFFICIENT_PERMISSIONS',
        'EMAIL_NOT_VERIFIED',
        'ACCOUNT_SUSPENDED',
      ];

      for (const code of nonCsrfCodes) {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
          headers: new Headers(),
          json: async () => ({
            success: false,
            error: { code, message: 'Forbidden action' },
          }),
        } as unknown as Response);
        global.fetch = mockFetch;

        await expect(
          apiClient('/api/test-mutation', { method: 'POST', body: JSON.stringify({ a: 1 }) }),
        ).rejects.toMatchObject({
          code,
          status: 403,
        });

        // Exactly 1 call, no /api/auth/csrf bootstrap, no retry
        expect(mockFetch).toHaveBeenCalledTimes(1);
      }
    });

    it('POST request body and headers are preserved during the one permitted retry', async () => {
      setInMemoryCsrfToken('expired-csrf-1');
      let mutationCalls = 0;
      const requestPayload = JSON.stringify({ item: 'Wireless Headphones', quantity: 2 });

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === '/api/orders') {
          mutationCalls++;
          if (mutationCalls === 1) {
            // First attempt fails with 403 CSRF_TOKEN_EXPIRED
            return {
              ok: false,
              status: 403,
              headers: new Headers(),
              json: async () => ({
                success: false,
                error: { code: 'CSRF_TOKEN_EXPIRED', message: 'Token expired' },
              }),
            } as unknown as Response;
          }
          // Retry attempt: verify body preservation
          expect(init?.body).toBe(requestPayload);
          const headers = new Headers(init?.headers);
          expect(headers.get('x-csrf-token')).toBe('refreshed-csrf-2');
          return {
            ok: true,
            status: 201,
            headers: new Headers(),
            json: async () => ({ success: true, data: { orderId: 'ord-123' } }),
          } as unknown as Response;
        }

        if (url === '/api/auth/csrf') {
          const headers = new Headers();
          headers.set('x-csrf-token', 'refreshed-csrf-2');
          document.cookie = 'dd_csrf=refreshed-csrf-2; path=/';
          return {
            ok: true,
            status: 200,
            headers,
            json: async () => ({ success: true, data: {} }),
          } as unknown as Response;
        }

        throw new Error(`Unexpected url: ${url}`);
      });
      global.fetch = mockFetch;

      const result = await apiClient<{ orderId: string }>('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: requestPayload,
      });

      expect(result).toEqual({ orderId: 'ord-123' });
      expect(mutationCalls).toBe(2);
    });

    it('a second consecutive CSRF failure terminates immediately without infinite retry', async () => {
      setInMemoryCsrfToken('stale-token');
      let mutationCalls = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/orders') {
          mutationCalls++;
          // Both initial attempt and retry fail with 403
          return {
            ok: false,
            status: 403,
            headers: new Headers(),
            json: async () => ({
              success: false,
              error: { code: 'CSRF_TOKEN_MISMATCH', message: 'Persistent mismatch' },
            }),
          } as unknown as Response;
        }

        if (url === '/api/auth/csrf') {
          const headers = new Headers();
          headers.set('x-csrf-token', 'new-token-attempt');
          document.cookie = 'dd_csrf=new-token-attempt; path=/';
          return {
            ok: true,
            status: 200,
            headers,
            json: async () => ({ success: true, data: {} }),
          } as unknown as Response;
        }

        throw new Error(`Unexpected url: ${url}`);
      });
      global.fetch = mockFetch;

      await expect(
        apiClient('/api/orders', { method: 'POST', body: JSON.stringify({ item: 'Watch' }) }),
      ).rejects.toMatchObject({
        code: 'CSRF_TOKEN_MISMATCH',
        status: 403,
      });

      // Exactly 2 mutation calls (1 initial + 1 retry max), never 3+
      expect(mutationCalls).toBe(2);
    });

    it('independent 401 refresh and CSRF recovery coordinate cleanly without mutual interference', async () => {
      setInMemoryCsrfToken('expired-csrf');
      let resourceCalls = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/account-update') {
          resourceCalls++;
          if (resourceCalls === 1) {
            // Step 1: fails with 401 (access token expired)
            return {
              ok: false,
              status: 401,
              headers: new Headers(),
              json: async () => ({
                success: false,
                error: { code: 'AUTHENTICATION_REQUIRED', message: 'Expired access token' },
              }),
            } as unknown as Response;
          }
          if (resourceCalls === 2) {
            // Step 2: 401 refresh succeeded, but CSRF token is expired
            return {
              ok: false,
              status: 403,
              headers: new Headers(),
              json: async () => ({
                success: false,
                error: { code: 'CSRF_TOKEN_EXPIRED', message: 'Expired CSRF token' },
              }),
            } as unknown as Response;
          }
          // Step 3: both auth refresh and CSRF recovery succeeded
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({ success: true, data: { updated: true } }),
          } as unknown as Response;
        }

        if (url === '/api/auth/refresh') {
          const headers = new Headers();
          headers.set('x-csrf-token', 'auth-refreshed-csrf');
          return {
            ok: true,
            status: 200,
            headers,
            json: async () => ({ success: true, data: { refreshed: true } }),
          } as unknown as Response;
        }

        if (url === '/api/auth/csrf') {
          const headers = new Headers();
          headers.set('x-csrf-token', 'final-valid-csrf');
          document.cookie = 'dd_csrf=final-valid-csrf; path=/';
          return {
            ok: true,
            status: 200,
            headers,
            json: async () => ({ success: true, data: {} }),
          } as unknown as Response;
        }

        throw new Error(`Unexpected url: ${url}`);
      });
      global.fetch = mockFetch;

      const result = await apiClient<{ updated: boolean }>('/api/account-update', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Name' }),
      });

      expect(result).toEqual({ updated: true });
      expect(resourceCalls).toBe(3);
    });

    it('internal retry flags (_isRetry, _isCsrfRetry) are stripped from options passed to window.fetch', async () => {
      setInMemoryCsrfToken('valid-csrf');
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ success: true, data: { ok: true } }),
      } as unknown as Response);
      global.fetch = mockFetch;

      await apiClient('/api/test-mutation', {
        method: 'POST',
        _isRetry: true,
        _isCsrfRetry: true,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const passedOptions = mockFetch.mock.calls[0][1] as Record<string, unknown>;
      expect(passedOptions._isRetry).toBeUndefined();
      expect(passedOptions._isCsrfRetry).toBeUndefined();
    });
  });
});
