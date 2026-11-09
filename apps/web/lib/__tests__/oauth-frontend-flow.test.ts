import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { confirmLinkFormSchema } from '../auth-schemas';
import { apiClient, setInMemoryCsrfToken, ApiError } from '../api-client';

describe('OAuth Frontend Flow & Conflict Resolution Integration', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setInMemoryCsrfToken('mock-valid-csrf');
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  describe('confirmLinkFormSchema', () => {
    it('accepts valid password', () => {
      const result = confirmLinkFormSchema.safeParse({ password: 'Password123!' });
      expect(result.success).toBe(true);
    });

    it('rejects empty password', () => {
      const result = confirmLinkFormSchema.safeParse({ password: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Password is required');
      }
    });

    it('rejects password exceeding 128 characters', () => {
      const result = confirmLinkFormSchema.safeParse({ password: 'a'.repeat(129) });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Password cannot exceed 128 characters');
      }
    });
  });

  describe('OAuth Initiation Client Flow', () => {
    it('calls GET /api/auth/oauth/google with format=json and returnUrl', async () => {
      let capturedUrl = '';
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=123',
              statePrefix: 'pref_1234567890',
            },
          }),
        } as unknown as Response;
      });
      global.fetch = mockFetch;

      const result = await apiClient<{ authUrl: string; statePrefix: string }>(
        '/api/auth/oauth/google?format=json&returnUrl=%2Faccount',
      );

      expect(result.authUrl).toContain('accounts.google.com');
      expect(result.statePrefix).toBe('pref_1234567890');
      expect(capturedUrl).toContain('format=json');
      expect(capturedUrl).toContain('returnUrl=%2Faccount');
    });
  });

  describe('OAuth Conflict Resolution (Confirm Link) Client Flow', () => {
    it('calls POST /api/auth/oauth/google/confirm-link with challengePrefix and password', async () => {
      let capturedUrl = '';
      let capturedBody: unknown;
      let capturedHeaders: Headers | undefined;

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init?.body as string);
        capturedHeaders = new Headers(init?.headers);
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'content-type': 'application/json',
            'x-csrf-token': 'rotated-csrf',
          }),
          json: async () => ({
            success: true,
            data: {
              status: 'AUTHENTICATED',
              user: {
                id: 'u_123',
                email: 'user@example.com',
                role: 'CUSTOMER',
                emailVerified: true,
                hasPassword: true,
                profile: { firstName: 'Rahim', lastName: 'Chowdhury' },
              },
            },
          }),
        } as unknown as Response;
      });
      global.fetch = mockFetch;

      const result = await apiClient<{ status: string; user: { id: string; email: string } }>(
        '/api/auth/oauth/google/confirm-link',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            challengePrefix: 'abcdefghijklmnop',
            password: 'MyAccountPassword123!',
          }),
        },
      );

      expect(capturedUrl).toBe('/api/auth/oauth/google/confirm-link');
      expect(capturedBody).toEqual({
        challengePrefix: 'abcdefghijklmnop',
        password: 'MyAccountPassword123!',
      });
      expect(capturedHeaders?.get('x-csrf-token')).toBe('mock-valid-csrf');
      expect(result.status).toBe('AUTHENTICATED');
      expect(result.user.email).toBe('user@example.com');
    });

    it('propagates remaining attempts on 401 INVALID_CREDENTIALS error', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: false,
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Invalid password. 3 attempts remaining.',
            },
          }),
        } as unknown as Response;
      });

      try {
        await apiClient('/api/auth/oauth/google/confirm-link', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            challengePrefix: 'abcdefghijklmnop',
            password: 'WrongPassword',
          }),
        });
        expect.unreachable('Should have thrown ApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.code).toBe('INVALID_CREDENTIALS');
        expect(apiErr.status).toBe(401);
        const match = apiErr.message.match(/(\d+)\s+attempts\s+remaining/i);
        expect(match?.[1]).toBe('3');
      }
    });

    it('propagates 400 MAX_ATTEMPTS_EXCEEDED when lockout occurs', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 400,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: false,
            error: {
              code: 'MAX_ATTEMPTS_EXCEEDED',
              message: 'Too many failed password attempts. Link challenge has been invalidated.',
            },
          }),
        } as unknown as Response;
      });

      await expect(
        apiClient('/api/auth/oauth/google/confirm-link', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            challengePrefix: 'abcdefghijklmnop',
            password: 'FifthWrongPassword',
          }),
        }),
      ).rejects.toThrow(ApiError);
    });

    it('propagates 400 LINK_CHALLENGE_EXPIRED when challenge is not found or expired', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 400,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: false,
            error: {
              code: 'LINK_CHALLENGE_EXPIRED',
              message: 'Link challenge has expired or is invalid',
            },
          }),
        } as unknown as Response;
      });

      try {
        await apiClient('/api/auth/oauth/google/confirm-link', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            challengePrefix: 'expired123456789',
            password: 'AnyPassword',
          }),
        });
        expect.unreachable('Should have thrown ApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.code).toBe('LINK_CHALLENGE_EXPIRED');
        expect(apiErr.status).toBe(400);
      }
    });
  });
});

