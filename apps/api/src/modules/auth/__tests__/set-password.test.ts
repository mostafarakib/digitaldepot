import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { hashPassword, verifyPassword } from '../../../lib/crypto.js';
import { env } from '../../../config/env.js';
import { cleanDatabase, testPool, extractCookies } from '../../../test/setup.js';

describe('Password Confirmation & Initial Setup (Phase 3E-2)', () => {
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

  function parseCookieValue(cookies: string[], cookieName: string): string | null {
    for (const cookie of cookies) {
      if (cookie.startsWith(`${cookieName}=`)) {
        return cookie.split(';')[0]!.split('=')[1] ?? null;
      }
    }
    return null;
  }

  async function createPasswordUser(email = 'user@example.com', password = 'ValidPassword123!') {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    const csrf = getCsrfHeaders();
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', csrf.Origin)
      .set('Cookie', csrf.Cookie)
      .set('x-csrf-token', csrf['x-csrf-token'])
      .send({ email, password });

    const rawCookies = extractCookies(loginRes);
    const accessToken = parseCookieValue(rawCookies, COOKIE_NAMES.ACCESS_TOKEN)!;
    const refreshToken = parseCookieValue(rawCookies, COOKIE_NAMES.REFRESH_TOKEN)!;

    const session = await prisma.session.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null },
    });

    return { user, session, accessToken, refreshToken, rawCookies };
  }

  async function createOAuthOnlyUser(email = 'oauth@example.com') {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: null,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    await prisma.oAuthAccount.create({
      data: {
        userId: user.id,
        provider: 'GOOGLE',
        providerAccountId: 'google-sub-12345',
      },
    });

    // Create session directly with recent reauthenticatedAt
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        reauthenticatedAt: new Date(),
        ipAddress: '127.0.0.1',
      },
    });

    const csrf = getCsrfHeaders();
    // Simulate login by issuing access token using the session
    const { signAccessToken } = await import('../../../lib/crypto.js');
    const accessToken = await signAccessToken({
      sub: user.id,
      sid: session.id,
    });

    return { user, session, accessToken, csrf };
  }

  describe('POST /api/v1/auth/confirm-password', () => {
    it('successfully confirms password and updates Session.reauthenticatedAt', async () => {
      const { session, accessToken } = await createPasswordUser();

      // Age the reauthenticatedAt by 20 minutes to verify update
      await prisma.session.update({
        where: { id: session.id },
        data: { reauthenticatedAt: new Date(Date.now() - 20 * 60 * 1000) },
      });

      const csrf = getCsrfHeaders();
      const res = await request(app)
        .post('/api/v1/auth/confirm-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ password: 'ValidPassword123!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Password confirmed successfully');

      const updatedSession = await prisma.session.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(updatedSession.reauthenticatedAt).not.toBeNull();
      expect(new Date(updatedSession.reauthenticatedAt!).getTime()).toBeGreaterThan(
        Date.now() - 5000,
      );
    });

    it('rejects incorrect password with 401 INVALID_CREDENTIALS', async () => {
      const { accessToken } = await createPasswordUser();
      const csrf = getCsrfHeaders();

      const res = await request(app)
        .post('/api/v1/auth/confirm-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ password: 'WrongPassword999!' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('runs dummy Argon2id timing and rejects with 400 NO_PASSWORD_SET when account has no password', async () => {
      const { accessToken, csrf } = await createOAuthOnlyUser();

      const start = Date.now();
      const res = await request(app)
        .post('/api/v1/auth/confirm-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ password: 'AnyPassword123!' });

      const duration = Date.now() - start;
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NO_PASSWORD_SET');
      // Argon2id dummy hash must take measurable time (> 10ms)
      expect(duration).toBeGreaterThanOrEqual(10);
    });

    it('rejects with 401 SESSION_REVOKED_OR_EXPIRED when session was revoked', async () => {
      const { session, accessToken } = await createPasswordUser();
      await prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });

      const csrf = getCsrfHeaders();
      const res = await request(app)
        .post('/api/v1/auth/confirm-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ password: 'ValidPassword123!' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('SESSION_REVOKED_OR_EXPIRED');
    });

    it('rejects with 403 ACCOUNT_SUSPENDED when user is suspended', async () => {
      const { user, accessToken } = await createPasswordUser();
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'SUSPENDED' },
      });

      const csrf = getCsrfHeaders();
      const res = await request(app)
        .post('/api/v1/auth/confirm-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ password: 'ValidPassword123!' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('requires CSRF and Origin header', async () => {
      const { accessToken } = await createPasswordUser();
      const res = await request(app)
        .post('/api/v1/auth/confirm-password')
        .set('Cookie', `${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .send({ password: 'ValidPassword123!' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/auth/set-password', () => {
    it('sets password for OAuth-only user with fresh session and does not extend reauthenticatedAt', async () => {
      const { user, session, accessToken, csrf } = await createOAuthOnlyUser();
      const initialReauth = session.reauthenticatedAt!;

      const res = await request(app)
        .post('/api/v1/auth/set-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ password: 'NewSecurePassword123!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBeDefined();

      // Verify User record now has passwordHash
      const updatedUser = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(updatedUser.passwordHash).not.toBeNull();
      const matches = await verifyPassword('NewSecurePassword123!', updatedUser.passwordHash!);
      expect(matches).toBe(true);

      // Verify reauthenticatedAt was NOT touched
      const updatedSession = await prisma.session.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(updatedSession.reauthenticatedAt?.getTime()).toBe(initialReauth.getTime());

      // Verify user can now log in with the new password
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ email: user.email, password: 'NewSecurePassword123!' });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.email).toBe(user.email);
    });

    it('rejects with 400 PASSWORD_ALREADY_SET when user already has a password', async () => {
      const { accessToken } = await createPasswordUser();
      const csrf = getCsrfHeaders();

      const res = await request(app)
        .post('/api/v1/auth/set-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ password: 'BrandNewPassword123!' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PASSWORD_ALREADY_SET');
    });

    it('rejects with 403 REAUTHENTICATION_REQUIRED when session is stale (>15m)', async () => {
      const { session, accessToken, csrf } = await createOAuthOnlyUser();

      // Age session freshness to 16 minutes ago
      await prisma.session.update({
        where: { id: session.id },
        data: { reauthenticatedAt: new Date(Date.now() - 16 * 60 * 1000) },
      });

      const res = await request(app)
        .post('/api/v1/auth/set-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ password: 'BrandNewPassword123!' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('REAUTHENTICATION_REQUIRED');
    });

    it('rejects with 401 SESSION_REVOKED_OR_EXPIRED when session was revoked', async () => {
      const { session, accessToken, csrf } = await createOAuthOnlyUser();

      await prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });

      const res = await request(app)
        .post('/api/v1/auth/set-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ password: 'BrandNewPassword123!' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('SESSION_REVOKED_OR_EXPIRED');
    });

    it('rejects with 403 ACCOUNT_SUSPENDED when user is suspended', async () => {
      const { user, accessToken, csrf } = await createOAuthOnlyUser();

      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'SUSPENDED' },
      });

      const res = await request(app)
        .post('/api/v1/auth/set-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ password: 'BrandNewPassword123!' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });
  });
});
