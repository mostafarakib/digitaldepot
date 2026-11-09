import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { validateBffOrigin, forwardToExpress } from '../bff-utils';
import { POST as loginHandler } from '../login/route';
import { POST as registerHandler } from '../register/route';
import { POST as refreshHandler } from '../refresh/route';
import { POST as logoutHandler } from '../logout/route';
import { POST as forgotPasswordHandler } from '../forgot-password/route';
import { POST as resetPasswordHandler } from '../reset-password/route';
import { POST as verifyEmailHandler } from '../verify-email/route';
import { POST as resendVerificationHandler } from '../resend-verification/route';
import { POST as changePasswordHandler } from '../change-password/route';
import { GET as sessionsHandler } from '../sessions/route';
import { POST as revokeOtherSessionsHandler } from '../sessions/revoke-others/route';
import { DELETE as revokeSessionHandler } from '../sessions/[id]/route';
import { GET as csrfHandler } from '../csrf/route';
import { GET as meHandler } from '../me/route';
import { POST as confirmPasswordHandler } from '../confirm-password/route';
import { POST as setPasswordHandler } from '../set-password/route';
import { POST as oauthReauthHandler } from '../oauth/google/reauth/route';
import { GET as oauthInitiateHandler } from '../oauth/google/route';
import { POST as confirmLinkHandler } from '../oauth/google/confirm-link/route';
import { GET as oauthCallbackHandler } from '../oauth/google/callback/route';
import { GET as oauthProvidersHandler } from '../../account/oauth/route';
import { POST as linkGoogleHandler } from '../../account/oauth/google/link/route';
import { DELETE as unlinkGoogleHandler } from '../../account/oauth/google/route';

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

    it('register handler enforces Origin check and forwards payload including locale', async () => {
      const unauthReq = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { origin: 'http://evil.com' },
      });
      const unauthRes = await registerHandler(unauthReq);
      expect(unauthRes.status).toBe(403);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { message: 'Registration successful. Please log in.', userId: 'u_bn_1' },
        }),
      });
      global.fetch = mockFetch;

      const validReq = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          firstName: 'রকিব',
          lastName: 'হাসান',
          email: 'rakib@example.com',
          password: 'Password123!',
          locale: 'bn',
        }),
      });

      const res = await registerHandler(validReq);
      expect(res.status).toBe(201);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [calledUrl, calledInit] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('http://localhost:4000/api/v1/auth/register');
      const forwardedBody = JSON.parse(calledInit.body);
      expect(forwardedBody.locale).toBe('bn');
      expect(forwardedBody.firstName).toBe('রকিব');
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

    it('forgot-password handler enforces Origin check and forwards request', async () => {
      const unauthReq = new NextRequest('http://localhost:3000/api/auth/forgot-password', {
        method: 'POST',
        headers: { origin: 'http://evil.com' },
      });
      const unauthRes = await forgotPasswordHandler(unauthReq);
      expect(unauthRes.status).toBe(403);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { message: 'Reset email sent' },
        }),
      });
      global.fetch = mockFetch;

      const validReq = new NextRequest('http://localhost:3000/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email: 'test@example.com', locale: 'bn' }),
      });

      const res = await forgotPasswordHandler(validReq);
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('http://localhost:4000/api/v1/auth/forgot-password');
      const body = JSON.parse(calledInit.body);
      expect(body.email).toBe('test@example.com');
      expect(body.locale).toBe('bn');
    });

    it('reset-password handler enforces Origin check and forwards rotated x-csrf-token', async () => {
      const unauthReq = new NextRequest('http://localhost:3000/api/auth/reset-password', {
        method: 'POST',
        headers: { origin: 'http://evil.com' },
      });
      const unauthRes = await resetPasswordHandler(unauthReq);
      expect(unauthRes.status).toBe(403);

      const headers = new Headers({ 'content-type': 'application/json' });
      headers.set('x-csrf-token', 'rotated-csrf-token-xyz');
      headers.append('set-cookie', 'dd_access_token=; Max-Age=0');
      headers.append('set-cookie', 'dd_refresh_token=; Max-Age=0');
      headers.append('set-cookie', 'dd_csrf=rotated-csrf-token-xyz; Max-Age=86400');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers,
        json: async () => ({
          success: true,
          data: { message: 'Password reset successful', csrfToken: 'rotated-csrf-token-xyz' },
        }),
      });
      global.fetch = mockFetch;

      const validReq = new NextRequest('http://localhost:3000/api/auth/reset-password', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ token: 'raw-token-123', password: 'NewPassword123!' }),
      });

      const res = await resetPasswordHandler(validReq);
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(res.headers.get('x-csrf-token')).toBe('rotated-csrf-token-xyz');
      const setCookies = res.headers.getSetCookie();
      expect(setCookies).toHaveLength(3);
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

    it('verify-email, resend-verification, change-password, and session routes enforce Origin and forward requests', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init?.method || 'GET';
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: { ok: true } }),
        } as unknown as Response;
      });

      // 1. verify-email without Origin fails
      const noOriginReq = new NextRequest('http://localhost:3000/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: 'tok_123' }),
      });
      const noOriginRes = await verifyEmailHandler(noOriginReq);
      expect(noOriginRes.status).toBe(403);

      // 2. verify-email with valid Origin succeeds
      const verifyReq = new NextRequest('http://localhost:3000/api/auth/verify-email', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({ token: 'tok_123' }),
      });
      const verifyRes = await verifyEmailHandler(verifyReq);
      expect(verifyRes.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/auth/verify-email');
      expect(forwardedMethod).toBe('POST');

      // 3. resend-verification with valid Origin succeeds
      const resendReq = new NextRequest('http://localhost:3000/api/auth/resend-verification', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'user@example.com' }),
      });
      const resendRes = await resendVerificationHandler(resendReq);
      expect(resendRes.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/auth/resend-verification');

      // 4. change-password with valid Origin succeeds
      const changePassReq = new NextRequest('http://localhost:3000/api/auth/change-password', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
        }),
      });
      const changePassRes = await changePasswordHandler(changePassReq);
      expect(changePassRes.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/auth/change-password');

      // 5. GET sessions succeeds without Origin
      const sessionsReq = new NextRequest('http://localhost:3000/api/auth/sessions', {
        method: 'GET',
      });
      const sessionsRes = await sessionsHandler(sessionsReq);
      expect(sessionsRes.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/auth/sessions');
      expect(forwardedMethod).toBe('GET');

      // 6. POST sessions/revoke-others succeeds with Origin
      const revokeOthersReq = new NextRequest(
        'http://localhost:3000/api/auth/sessions/revoke-others',
        {
          method: 'POST',
          headers: { origin: 'http://localhost:3000' },
        },
      );
      const revokeOthersRes = await revokeOtherSessionsHandler(revokeOthersReq);
      expect(revokeOthersRes.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/auth/sessions/revoke-others');

      // 7. DELETE sessions/[id] succeeds with Origin
      const deleteSessionReq = new NextRequest('http://localhost:3000/api/auth/sessions/sess_123', {
        method: 'DELETE',
        headers: { origin: 'http://localhost:3000' },
      });
      const deleteSessionRes = await revokeSessionHandler(deleteSessionReq, {
        params: Promise.resolve({ id: 'sess_123' }),
      });
      expect(deleteSessionRes.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/auth/sessions/sess_123');
      expect(forwardedMethod).toBe('DELETE');
    });

    it('enforces Origin validation and forwards Phase 3E-2 requests to Express API', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';
      let forwardedBody: unknown = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init?.method ?? 'GET';
        forwardedBody = init?.body ? JSON.parse(init.body as string) : null;
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'content-type': 'application/json',
            'set-cookie': 'dd_test=cookie_val; Path=/',
          }),
          json: async () => ({
            success: true,
            data: { status: 'LINKED', returnUrl: '/account/security' },
          }),
        } as unknown as Response;
      });

      // 1. POST confirm-password rejects without Origin
      const confirmNoOrigin = new NextRequest('http://localhost:3000/api/auth/confirm-password', {
        method: 'POST',
        body: JSON.stringify({ password: 'pw' }),
      });
      const confirmNoOriginRes = await confirmPasswordHandler(confirmNoOrigin);
      expect(confirmNoOriginRes.status).toBe(403);

      // 2. POST confirm-password succeeds with Origin
      const confirmWithOrigin = new NextRequest('http://localhost:3000/api/auth/confirm-password', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({ password: 'ValidPassword123!' }),
      });
      const confirmRes = await confirmPasswordHandler(confirmWithOrigin);
      expect(confirmRes.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/auth/confirm-password');

      // 3. POST set-password succeeds with Origin
      const setPassReq = new NextRequest('http://localhost:3000/api/auth/set-password', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({ password: 'NewPassword123!' }),
      });
      const setPassRes = await setPasswordHandler(setPassReq);
      expect(setPassRes.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/auth/set-password');

      // 4. POST oauth/google/reauth succeeds with Origin
      const reauthReq = new NextRequest('http://localhost:3000/api/auth/oauth/google/reauth', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({ returnUrl: '/account/security' }),
      });
      const reauthRes = await oauthReauthHandler(reauthReq);
      expect(reauthRes.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/auth/oauth/google/reauth');

      // 5. GET account/oauth succeeds without Origin
      const oauthListReq = new NextRequest('http://localhost:3000/api/account/oauth', {
        method: 'GET',
      });
      const oauthListRes = await oauthProvidersHandler(oauthListReq);
      expect(oauthListRes.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/account/oauth');
      expect(forwardedMethod).toBe('GET');

      // 6. POST account/oauth/google/link succeeds with Origin
      const linkReq = new NextRequest('http://localhost:3000/api/account/oauth/google/link', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({ returnUrl: '/account/security' }),
      });
      const linkRes = await linkGoogleHandler(linkReq);
      expect(linkRes.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/account/oauth/google/link');

      // 7. DELETE account/oauth/google succeeds with Origin
      const unlinkReq = new NextRequest('http://localhost:3000/api/account/oauth/google', {
        method: 'DELETE',
        headers: { origin: 'http://localhost:3000' },
      });
      const unlinkRes = await unlinkGoogleHandler(unlinkReq);
      expect(unlinkRes.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/account/oauth/google');
      expect(forwardedMethod).toBe('DELETE');

      // 8. GET oauth/google/callback forwards to backend and redirects browser
      const callbackReq = new NextRequest(
        'http://localhost:3000/api/auth/oauth/google/callback?code=mock_code&state=mock_state_1234567890',
        { method: 'GET' },
      );
      const callbackRes = await oauthCallbackHandler(callbackReq);
      expect(callbackRes.status).toBe(307);
      expect(callbackRes.headers.get('location')).toContain('/account/security?linked=true');
      expect(forwardedUrl).toContain('/api/v1/auth/oauth/google/callback');
      expect(forwardedMethod).toBe('POST');

      // 9. GET oauth/google returns JSON with authUrl when format=json
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'content-type': 'application/json',
            'set-cookie': 'dd_oauth_prefix123=hmacval; Path=/; HttpOnly; SameSite=Lax',
          }),
          json: async () => ({
            success: true,
            data: {
              authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=123',
              statePrefix: 'prefix123',
            },
          }),
        } as unknown as Response;
      });

      const initiateJsonReq = new NextRequest(
        'http://localhost:3000/api/auth/oauth/google?format=json&returnUrl=/account',
        { method: 'GET' },
      );
      const initiateJsonRes = await oauthInitiateHandler(initiateJsonReq);
      expect(initiateJsonRes.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/auth/oauth/google?format=json&returnUrl=%2Faccount');
      const initiateData = await initiateJsonRes.json();
      expect(initiateData.data.authUrl).toContain('accounts.google.com');
      const initiateCookies = initiateJsonRes.headers.getSetCookie();
      expect(initiateCookies.some((c) => c.includes('dd_oauth_prefix123'))).toBe(true);

      // 10. GET oauth/google redirects to authUrl on direct browser navigation
      const initiateDirectReq = new NextRequest(
        'http://localhost:3000/api/auth/oauth/google?returnUrl=/profile',
        {
          method: 'GET',
          headers: { accept: 'text/html,application/xhtml+xml' },
        },
      );
      const initiateDirectRes = await oauthInitiateHandler(initiateDirectReq);
      expect(initiateDirectRes.status).toBe(302);
      expect(initiateDirectRes.headers.get('location')).toContain('accounts.google.com');

      // 11. POST oauth/google/confirm-link enforces Origin and forwards to backend
      const confirmLinkNoOrigin = new NextRequest(
        'http://localhost:3000/api/auth/oauth/google/confirm-link',
        {
          method: 'POST',
          body: JSON.stringify({ challengePrefix: 'abcdefghijklmnop', password: 'password123' }),
        },
      );
      const confirmLinkNoOriginRes = await confirmLinkHandler(confirmLinkNoOrigin);
      expect(confirmLinkNoOriginRes.status).toBe(403);

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init?.method ?? 'GET';
        forwardedBody = init?.body ? JSON.parse(init.body as string) : null;
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'content-type': 'application/json',
            'set-cookie': 'dd_access_token=token123; Path=/',
            'x-csrf-token': 'new-csrf-token',
          }),
          json: async () => ({
            success: true,
            data: { status: 'AUTHENTICATED', user: { id: 'u1', email: 'test@example.com' } },
          }),
        } as unknown as Response;
      });

      const confirmLinkValidReq = new NextRequest(
        'http://localhost:3000/api/auth/oauth/google/confirm-link',
        {
          method: 'POST',
          headers: {
            origin: 'http://localhost:3000',
            cookie: 'dd_link_abcdefghijklmnop=raw_link_token',
          },
          body: JSON.stringify({
            challengePrefix: 'abcdefghijklmnop',
            password: 'ValidPassword123!',
          }),
        },
      );
      const confirmLinkValidRes = await confirmLinkHandler(confirmLinkValidReq);
      expect(confirmLinkValidRes.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/auth/oauth/google/confirm-link');
      expect(forwardedMethod).toBe('POST');
      expect(forwardedBody).toEqual({
        challengePrefix: 'abcdefghijklmnop',
        password: 'ValidPassword123!',
      });
      const confirmCookies = confirmLinkValidRes.headers.getSetCookie();
      expect(confirmCookies.some((c) => c.includes('dd_access_token=token123'))).toBe(true);
      expect(confirmLinkValidRes.headers.get('x-csrf-token')).toBe('new-csrf-token');

      // 12. GET oauth/google/callback routing: unauthenticated failure goes to /login?error=...
      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 409,
          headers: new Headers({
            'content-type': 'application/json',
            'set-cookie': 'dd_oauth_mock=; Path=/; Max-Age=0',
          }),
          json: async () => ({
            success: false,
            error: {
              code: 'OAUTH_PROVIDER_IDENTITY_CONFLICT',
              message: 'Already linked',
            },
          }),
        } as unknown as Response;
      });

      const unauthCallbackReq = new NextRequest(
        'http://localhost:3000/api/auth/oauth/google/callback?code=code_val&state=state_val_12345678',
        { method: 'GET' },
      );
      const unauthCallbackRes = await oauthCallbackHandler(unauthCallbackReq);
      expect(unauthCallbackRes.status).toBe(307);
      expect(unauthCallbackRes.headers.get('location')).toBe(
        'http://localhost:3000/login?error=OAUTH_PROVIDER_IDENTITY_CONFLICT',
      );

      // 13. GET oauth/google/callback routing: authenticated failure goes to /account/security?error=...
      const authCallbackReq = new NextRequest(
        'http://localhost:3000/api/auth/oauth/google/callback?code=code_val&state=state_val_12345678',
        {
          method: 'GET',
          headers: { cookie: 'dd_access_token=valid_access_token' },
        },
      );
      const authCallbackRes = await oauthCallbackHandler(authCallbackReq);
      expect(authCallbackRes.status).toBe(307);
      expect(authCallbackRes.headers.get('location')).toBe(
        'http://localhost:3000/account/security?error=OAUTH_PROVIDER_IDENTITY_CONFLICT',
      );
    });
  });
});
