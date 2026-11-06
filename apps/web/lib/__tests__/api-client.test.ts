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
});

