import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { hashPassword, signAccessToken } from '../../../lib/crypto.js';
import { env } from '../../../config/env.js';
import { cleanDatabase, testPool, extractCookies } from '../../../test/setup.js';

describe('OAuth Account Management (Phase 3E-2)', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPool.end();
  });

  function getCsrfHeaders() {
    const token = generateCsrfToken();
    return {
      Origin: env.FRONTEND_URL,
      Cookie: `${COOKIE_NAMES.CSRF_TOKEN}=${token}`,
      'x-csrf-token': token,
    };
  }

  async function createTestUser(params: {
    email?: string;
    hasPassword?: boolean;
    linkedGoogleSub?: string | null;
    freshAuth?: boolean;
  }) {
    const {
      email = 'user@example.com',
      hasPassword = true,
      linkedGoogleSub = null,
      freshAuth = true,
    } = params;

    const passwordHash = hasPassword ? await hashPassword('ValidPassword123!') : null;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    if (linkedGoogleSub) {
      await prisma.oAuthAccount.create({
        data: {
          userId: user.id,
          provider: 'GOOGLE',
          providerAccountId: linkedGoogleSub,
        },
      });
    }

    const reauthTime = freshAuth ? new Date() : new Date(Date.now() - 20 * 60 * 1000); // 20m ago (stale)
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        reauthenticatedAt: reauthTime,
        ipAddress: '127.0.0.1',
      },
    });

    const accessToken = await signAccessToken({
      sub: user.id,
      sid: session.id,
    });

    const csrf = getCsrfHeaders();
    return { user, session, accessToken, csrf };
  }

  describe('GET /api/v1/account/oauth', () => {
    it('returns linked providers list without providerAccountId', async () => {
      const { accessToken } = await createTestUser({
        linkedGoogleSub: 'secret-sub-12345',
      });

      const res = await request(app)
        .get('/api/v1/account/oauth')
        .set('Cookie', `${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.providers).toHaveLength(1);
      expect(res.body.data.providers[0].provider).toBe('GOOGLE');
      expect(res.body.data.providers[0].linkedAt).toBeDefined();
      expect(res.body.data.providers[0].providerAccountId).toBeUndefined();
      expect(res.body.data.providers[0].sub).toBeUndefined();
    });

    it('returns empty list when user has no linked providers', async () => {
      const { accessToken } = await createTestUser({
        linkedGoogleSub: null,
      });

      const res = await request(app)
        .get('/api/v1/account/oauth')
        .set('Cookie', `${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.providers).toEqual([]);
    });

    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/account/oauth');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/account/oauth/google/link', () => {
    it('initiates link flow for fresh session, sets state cookie, and returns auth URL', async () => {
      const { session, accessToken, csrf } = await createTestUser({
        freshAuth: true,
        linkedGoogleSub: null,
      });

      const res = await request(app)
        .post('/api/v1/account/oauth/google/link?format=json')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ returnUrl: '/account/security' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.authUrl).toContain('accounts.google.com');

      const cookies = extractCookies(res);
      const stateCookie = cookies.find((c: string) => c.startsWith('dd_oauth_'));
      expect(stateCookie).toBeDefined();

      // Verify transaction in database is bound to session
      const tx = await prisma.oAuthTransaction.findFirst({
        where: { sessionId: session.id, action: 'LINK' },
      });
      expect(tx).not.toBeNull();
      expect(tx?.returnUrl).toBe('/account/security');
    });

    it('rejects stale session (>15m) with 403 REAUTHENTICATION_REQUIRED', async () => {
      const { accessToken, csrf } = await createTestUser({
        freshAuth: false,
        linkedGoogleSub: null,
      });

      const res = await request(app)
        .post('/api/v1/account/oauth/google/link')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ returnUrl: '/account/security' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('REAUTHENTICATION_REQUIRED');
    });

    it('rejects with 409 OAUTH_ALREADY_LINKED if user is already linked to Google', async () => {
      const { accessToken, csrf } = await createTestUser({
        freshAuth: true,
        linkedGoogleSub: 'existing-google-sub',
      });

      const res = await request(app)
        .post('/api/v1/account/oauth/google/link')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ returnUrl: '/account/security' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('OAUTH_ALREADY_LINKED');
    });

    it('rejects external returnUrl with 400 VALIDATION_ERROR', async () => {
      const { accessToken, csrf } = await createTestUser({
        freshAuth: true,
        linkedGoogleSub: null,
      });

      const res = await request(app)
        .post('/api/v1/account/oauth/google/link')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ returnUrl: 'https://evil.com/phish' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects double-encoded returnUrl with 400 VALIDATION_ERROR', async () => {
      const { accessToken, csrf } = await createTestUser({
        freshAuth: true,
        linkedGoogleSub: null,
      });

      const res = await request(app)
        .post('/api/v1/account/oauth/google/link')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ returnUrl: '/%252F%252Fevil.com' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/v1/account/oauth/google', () => {
    it('successfully unlinks Google account for fresh session with password configured', async () => {
      const { accessToken, csrf } = await createTestUser({
        hasPassword: true,
        freshAuth: true,
        linkedGoogleSub: 'google-sub-to-unlink',
      });

      const res = await request(app)
        .delete('/api/v1/account/oauth/google')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token']);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBeDefined();

      const remaining = await prisma.oAuthAccount.findUnique({
        where: {
          unique_provider_account: {
            provider: 'GOOGLE',
            providerAccountId: 'google-sub-to-unlink',
          },
        },
      });
      expect(remaining).toBeNull();
    });

    it('rejects with 400 CANNOT_UNLINK_LAST_AUTH_METHOD when OAuth-only user attempts to unlink', async () => {
      const { accessToken, csrf } = await createTestUser({
        hasPassword: false,
        freshAuth: true,
        linkedGoogleSub: 'last-auth-sub',
      });

      const res = await request(app)
        .delete('/api/v1/account/oauth/google')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token']);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CANNOT_UNLINK_LAST_AUTH_METHOD');
    });

    it('rejects stale session (>15m) with 403 REAUTHENTICATION_REQUIRED', async () => {
      const { accessToken, csrf } = await createTestUser({
        hasPassword: true,
        freshAuth: false,
        linkedGoogleSub: 'google-sub-stale',
      });

      const res = await request(app)
        .delete('/api/v1/account/oauth/google')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token']);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('REAUTHENTICATION_REQUIRED');
    });

    it('rejects with 404 OAUTH_ACCOUNT_NOT_LINKED when Google is not linked', async () => {
      const { accessToken, csrf } = await createTestUser({
        hasPassword: true,
        freshAuth: true,
        linkedGoogleSub: null,
      });

      const res = await request(app)
        .delete('/api/v1/account/oauth/google')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token']);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('OAUTH_ACCOUNT_NOT_LINKED');
    });

    it('rejects with 401 SESSION_REVOKED_OR_EXPIRED if session was revoked', async () => {
      const { session, accessToken, csrf } = await createTestUser({
        hasPassword: true,
        freshAuth: true,
        linkedGoogleSub: 'sub-revoked-unlink',
      });

      await prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });

      const res = await request(app)
        .delete('/api/v1/account/oauth/google')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token']);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('SESSION_REVOKED_OR_EXPIRED');
    });
  });
});
