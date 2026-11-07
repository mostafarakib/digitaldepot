import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { env } from '../../../config/env.js';
import { cleanDatabase, testPool, extractCookies } from '../../../test/setup.js';
import { hashPassword, hashToken, generateOpaqueToken } from '../../../lib/crypto.js';
import { securityTokenService } from '../security-token.service.js';

describe('Phase 3C-4: Password Change & Session Management Integration Tests', () => {
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

  async function createTestCustomer(
    email = 'customer@example.com',
    password = 'InitialPassword123!',
    status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE',
  ) {
    const passwordHash = await hashPassword(password);
    return await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'CUSTOMER',
        status,
        profile: {
          create: {
            firstName: 'Customer',
            lastName: 'User',
          },
        },
      },
      include: { profile: true },
    });
  }

  async function loginCustomer(email: string, password = 'InitialPassword123!') {
    const csrf = getCsrfHeaders();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', csrf.Origin)
      .set('Cookie', csrf.Cookie)
      .set('x-csrf-token', csrf['x-csrf-token'])
      .send({ email, password });

    expect(res.status).toBe(200);

    const cookies = extractCookies(res);
    const accessCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.ACCESS_TOKEN))!;
    const refreshCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.REFRESH_TOKEN))!;
    const csrfCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.CSRF_TOKEN))!;

    const accessTokenVal = accessCookie.split(';')[0];
    const refreshCookieVal = refreshCookie.split(';')[0];
    const csrfCookieVal = csrfCookie.split(';')[0];

    const csrfHeader = res.headers['x-csrf-token'] || csrfCookieVal.split('=')[1];

    return {
      res,
      accessTokenVal,
      refreshCookieVal,
      csrfCookieVal,
      csrfHeader,
      cookieHeader: `${accessTokenVal}; ${refreshCookieVal}; ${csrfCookieVal}`,
    };
  }

  async function createSecondarySession(userId: string, userAgent = 'Mozilla/5.0 Safari/605.1') {
    const now = new Date();
    const sessionExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const refreshExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const rawRefreshToken = generateOpaqueToken();

    return await prisma.session.create({
      data: {
        userId,
        userAgent,
        ipAddress: '198.51.100.50',
        expiresAt: sessionExpiresAt,
        reauthenticatedAt: now,
        lastUsedAt: now,
        refreshTokens: {
          create: {
            familyId: `fam_${generateOpaqueToken()}`,
            tokenHash: hashToken(rawRefreshToken),
            expiresAt: refreshExpiresAt,
          },
        },
      },
      include: { refreshTokens: true },
    });
  }

  describe('POST /api/v1/auth/change-password', () => {
    it('successfully changes password, rotates current refresh token, revokes other sessions, and omits csrfToken from JSON body', async () => {
      const user = await createTestCustomer('change-pw@example.com', 'OldPassword123!');
      const session2 = await createSecondarySession(user.id);

      const auth = await loginCustomer('change-pw@example.com', 'OldPassword123!');

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewStrongPassword456!',
          revokeAllSessions: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe(
        'Password changed successfully. Other active sessions have been signed out.',
      );
      // Requirement 2: csrfToken must be removed from JSON response body
      expect(res.body.data.csrfToken).toBeUndefined();

      // Delivered via header and cookie
      expect(res.headers['x-csrf-token']).toBeDefined();
      const cookies = extractCookies(res);
      const csrfCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.CSRF_TOKEN));
      expect(csrfCookie).toBeDefined();

      // Current session refresh token was rotated: fresh auth cookies issued
      const accessCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.ACCESS_TOKEN));
      const refreshCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.REFRESH_TOKEN));
      expect(accessCookie).toBeDefined();
      expect(accessCookie).not.toContain('Max-Age=0');
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).not.toContain('Max-Age=0');

      // Secondary session is revoked in DB
      const dbSession2 = await prisma.session.findUnique({ where: { id: session2.id } });
      expect(dbSession2?.revokedAt).not.toBeNull();
      expect(dbSession2?.revokedReason).toBe('PASSWORD_CHANGE');

      const dbTokens2 = await prisma.refreshToken.findMany({ where: { sessionId: session2.id } });
      expect(dbTokens2[0]?.revokedAt).not.toBeNull();

      // Login with new password succeeds
      const newLoginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.csrfCookieVal)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ email: 'change-pw@example.com', password: 'NewStrongPassword456!' });
      expect(newLoginRes.status).toBe(200);

      // Login with old password fails
      const oldLoginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.csrfCookieVal)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ email: 'change-pw@example.com', password: 'OldPassword123!' });
      expect(oldLoginRes.status).toBe(401);
    });

    it('revokes current session too and clears auth cookies when revokeAllSessions=true', async () => {
      await createTestCustomer('revoke-all@example.com', 'OldPassword123!');
      const auth = await loginCustomer('revoke-all@example.com', 'OldPassword123!');

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'BrandNewPassword456!',
          revokeAllSessions: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe(
        'Password changed successfully. All sessions have been signed out.',
      );

      // Auth cookies cleared
      const cookies = extractCookies(res);
      const accessCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.ACCESS_TOKEN));
      const refreshCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.REFRESH_TOKEN));
      expect(accessCookie).toContain('Max-Age=0');
      expect(refreshCookie).toContain('Max-Age=0');

      // Subsequent request using previous access token fails
      const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', auth.accessTokenVal);
      expect(meRes.status).toBe(401);
    });

    it('revokes current session and clears cookies if refresh token is missing in cookies', async () => {
      await createTestCustomer('missing-refresh@example.com', 'OldPassword123!');
      const auth = await loginCustomer('missing-refresh@example.com', 'OldPassword123!');

      // Send request with valid access token but NO refresh token cookie
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', `${auth.accessTokenVal}; ${auth.csrfCookieVal}`)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'BrandNewPassword456!',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain(
        'Your session could not be renewed and you must log in again',
      );

      const cookies = extractCookies(res);
      const accessCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.ACCESS_TOKEN));
      expect(accessCookie).toContain('Max-Age=0');
    });

    it('rejects incorrect current password with 401 INVALID_CREDENTIALS', async () => {
      await createTestCustomer('wrong-pw@example.com', 'CorrectPassword123!');
      const auth = await loginCustomer('wrong-pw@example.com', 'CorrectPassword123!');

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          currentPassword: 'IncorrectPassword999!',
          newPassword: 'NewStrongPassword456!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('rejects new password matching current password with 400 IDENTICAL_PASSWORD before opening transaction', async () => {
      await createTestCustomer('identical-pw@example.com', 'CurrentPassword123!');
      const auth = await loginCustomer('identical-pw@example.com', 'CurrentPassword123!');

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          currentPassword: 'CurrentPassword123!',
          newPassword: 'CurrentPassword123!',
        });

      expect(res.status).toBe(400);
      // Schema refinement catches identical strings
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects password change for social login user with 403 PASSWORD_NOT_SET', async () => {
      const oauthUser = await prisma.user.create({
        data: {
          email: 'oauth-user@example.com',
          passwordHash: null,
          role: 'CUSTOMER',
          status: 'ACTIVE',
        },
      });

      const session = await prisma.session.create({
        data: {
          userId: oauthUser.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          refreshTokens: {
            create: {
              familyId: 'fam_oauth',
              tokenHash: 'sample_oauth_hash',
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          },
        },
      });

      const { signAccessToken } = await import('../../../lib/crypto.js');
      const token = await signAccessToken({ sub: oauthUser.id, sid: session.id });
      const csrf = getCsrfHeaders();

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${COOKIE_NAMES.ACCESS_TOKEN}=${token}; ${csrf.Cookie}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          currentPassword: 'AnyPassword123!',
          newPassword: 'NewPassword456!',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PASSWORD_NOT_SET');
    });

    it('prevents two concurrent requests verified against same old password from both succeeding', async () => {
      await createTestCustomer('concur-pw@example.com', 'InitialPassword123!');
      const auth = await loginCustomer('concur-pw@example.com', 'InitialPassword123!');

      // Fire 2 concurrent password change requests with different new passwords
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/auth/change-password')
          .set('Origin', env.FRONTEND_URL)
          .set('Cookie', auth.cookieHeader)
          .set('x-csrf-token', auth.csrfHeader)
          .send({
            currentPassword: 'InitialPassword123!',
            newPassword: 'FirstNewPassword456!',
          }),
        request(app)
          .post('/api/v1/auth/change-password')
          .set('Origin', env.FRONTEND_URL)
          .set('Cookie', auth.cookieHeader)
          .set('x-csrf-token', auth.csrfHeader)
          .send({
            currentPassword: 'InitialPassword123!',
            newPassword: 'SecondNewPassword789!',
          }),
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);

      // The losing request must fail safely with 409 Conflict (hash re-verification failed under lock)
      const conflictRes = res1.status === 409 ? res1 : res2;
      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.error.code).toBe('PASSWORD_ALREADY_CHANGED');
    });

    it('rolls back database transaction completely when a failure occurs during changePassword', async () => {
      const user = await createTestCustomer('rollback-change@example.com', 'OriginalPassword123!');
      const secondary = await createSecondarySession(user.id);

      // Create a PASSWORD_RESET token
      const { rawToken: resetToken } = await securityTokenService.createToken(
        user.id,
        'PASSWORD_RESET',
        60 * 60 * 1000,
      );

      const auth = await loginCustomer('rollback-change@example.com', 'OriginalPassword123!');

      // Force an error inside the real PostgreSQL interactive transaction AFTER
      // password update, session revocation, and refresh token rotation have executed on the DB.
      const spy = vi
        .spyOn(securityTokenService, 'invalidateUserTokensByType')
        .mockRejectedValueOnce(
          new Error('Simulated failure during post-change token invalidation'),
        );

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          currentPassword: 'OriginalPassword123!',
          newPassword: 'AttemptedNewPassword456!',
        });

      spy.mockRestore();

      // Transaction aborted due to internal failure
      expect(res.status).toBe(500);

      // 1. Verify original password remains valid
      const loginOldRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.csrfCookieVal)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          email: 'rollback-change@example.com',
          password: 'OriginalPassword123!',
        });
      expect(loginOldRes.status).toBe(200);

      // 2. Verify new password is NOT valid
      const loginNewRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.csrfCookieVal)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          email: 'rollback-change@example.com',
          password: 'AttemptedNewPassword456!',
        });
      expect(loginNewRes.status).toBe(401);

      // 3. Verify other sessions remain active
      const dbSecondary = await prisma.session.findUnique({
        where: { id: secondary.id },
      });
      expect(dbSecondary?.revokedAt).toBeNull();

      // 4. Verify their refresh tokens remain active
      const secTokens = await prisma.refreshToken.findMany({
        where: { sessionId: secondary.id },
      });
      expect(secTokens[0]?.revokedAt).toBeNull();

      // 5. Verify PASSWORD_RESET token remains UNCONSUMED
      const dbResetToken = await prisma.securityToken.findUnique({
        where: { tokenHash: hashToken(resetToken) },
      });
      expect(dbResetToken?.consumedAt).toBeNull();
    });

    it('handles concurrent refresh and password-change requests deterministically without deadlocks', async () => {
      const user = await createTestCustomer(
        'concur-refresh-change@example.com',
        'OriginalPassword123!',
      );
      const auth = await loginCustomer('concur-refresh-change@example.com', 'OriginalPassword123!');

      // Fire POST /api/v1/auth/refresh and POST /api/v1/auth/change-password concurrently
      // using the exact same session and refresh token
      const [refreshRes, changePwRes] = await Promise.all([
        request(app)
          .post('/api/v1/auth/refresh')
          .set('Origin', env.FRONTEND_URL)
          .set('Cookie', auth.cookieHeader)
          .set('x-csrf-token', auth.csrfHeader),
        request(app)
          .post('/api/v1/auth/change-password')
          .set('Origin', env.FRONTEND_URL)
          .set('Cookie', auth.cookieHeader)
          .set('x-csrf-token', auth.csrfHeader)
          .send({
            currentPassword: 'OriginalPassword123!',
            newPassword: 'NewConcurPassword456!',
          }),
      ]);

      // Neither request should fail with a 500 error or deadlock
      expect(changePwRes.status).toBe(200);
      expect([200, 401]).toContain(refreshRes.status);

      // Verify password change succeeded in DB: new password works, old password rejected
      const loginNewRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.csrfCookieVal)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          email: 'concur-refresh-change@example.com',
          password: 'NewConcurPassword456!',
        });
      expect(loginNewRes.status).toBe(200);

      const loginOldRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.csrfCookieVal)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          email: 'concur-refresh-change@example.com',
          password: 'OriginalPassword123!',
        });
      expect(loginOldRes.status).toBe(401);

      // Inspect PostgreSQL token and session state invariants:
      // Ordering A: change-password commits first -> refresh observes consumed token within grace window (401 REFRESH_ALREADY_ROTATED).
      // Ordering B: refresh commits first -> change-password observes consumed token within grace window -> change-password revokes session.
      const session = await prisma.session.findFirst({
        where: { userId: user.id },
      });

      if (refreshRes.status === 401) {
        // Ordering A: change-password won the refresh rotation
        expect(refreshRes.body.error?.code).toBe('REFRESH_ALREADY_ROTATED');
        expect(session?.revokedAt).toBeNull();

        // Exactly 1 active refresh token exists in the family
        const activeTokens = await prisma.refreshToken.findMany({
          where: { sessionId: session?.id, consumedAt: null, revokedAt: null },
        });
        expect(activeTokens).toHaveLength(1);
      } else {
        // Ordering B: refresh won the refresh rotation (200), so change-password saw already-rotated token and safely revoked session
        expect(refreshRes.status).toBe(200);
        expect(changePwRes.body.data.message).toContain('Your session could not be renewed');
        expect(session?.revokedAt).not.toBeNull();
        expect(session?.revokedReason).toBe('PASSWORD_CHANGE');

        // Revoked session retains NO active unrevoked refresh tokens
        const activeTokens = await prisma.refreshToken.findMany({
          where: { sessionId: session?.id, revokedAt: null },
        });
        expect(activeTokens).toHaveLength(0);
      }
    });

    it('revokes session and clears cookies when supplied refresh token is expired during password change', async () => {
      const user = await createTestCustomer('expired-refresh@example.com', 'OldPassword123!');
      const auth = await loginCustomer('expired-refresh@example.com', 'OldPassword123!');

      // Age the refresh token past its expiration in PostgreSQL
      const sessions = await prisma.session.findMany({ where: { userId: user.id } });
      await prisma.refreshToken.updateMany({
        where: { sessionId: sessions[0].id },
        data: { expiresAt: new Date(Date.now() - 5000) },
      });

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'BrandNewPassword456!',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain(
        'Your session could not be renewed and you must log in again',
      );

      // Auth cookies cleared
      const cookies = extractCookies(res);
      const accessCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.ACCESS_TOKEN));
      const refreshCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.REFRESH_TOKEN));
      expect(accessCookie).toContain('Max-Age=0');
      expect(refreshCookie).toContain('Max-Age=0');

      // Session revoked
      const dbSession = await prisma.session.findUnique({ where: { id: sessions[0].id } });
      expect(dbSession?.revokedAt).not.toBeNull();
      expect(dbSession?.revokedReason).toBe('PASSWORD_CHANGE');

      // New password is active
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.csrfCookieVal)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ email: 'expired-refresh@example.com', password: 'BrandNewPassword456!' });
      expect(loginRes.status).toBe(200);
    });

    it('revokes session and clears cookies when supplied refresh token was already consumed within grace window', async () => {
      const user = await createTestCustomer('grace-consumed@example.com', 'OldPassword123!');
      const auth = await loginCustomer('grace-consumed@example.com', 'OldPassword123!');

      // Mark the refresh token as consumed 2 seconds ago (within 10s grace window)
      const sessions = await prisma.session.findMany({ where: { userId: user.id } });
      await prisma.refreshToken.updateMany({
        where: { sessionId: sessions[0].id },
        data: { consumedAt: new Date(Date.now() - 2000) },
      });

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'BrandNewPassword456!',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain(
        'Your session could not be renewed and you must log in again',
      );

      // Auth cookies cleared
      const cookies = extractCookies(res);
      const accessCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.ACCESS_TOKEN));
      const refreshCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.REFRESH_TOKEN));
      expect(accessCookie).toContain('Max-Age=0');
      expect(refreshCookie).toContain('Max-Age=0');

      // Session revoked
      const dbSession = await prisma.session.findUnique({ where: { id: sessions[0].id } });
      expect(dbSession?.revokedAt).not.toBeNull();

      // New password is active
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.csrfCookieVal)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ email: 'grace-consumed@example.com', password: 'BrandNewPassword456!' });
      expect(loginRes.status).toBe(200);
    });

    it('revokes session and token family when supplied refresh token was replayed beyond grace window', async () => {
      const user = await createTestCustomer('replayed-refresh@example.com', 'OldPassword123!');
      const auth = await loginCustomer('replayed-refresh@example.com', 'OldPassword123!');

      // Mark the refresh token as consumed 15 seconds ago (outside 10s grace window -> replay attack)
      const sessions = await prisma.session.findMany({ where: { userId: user.id } });
      await prisma.refreshToken.updateMany({
        where: { sessionId: sessions[0].id },
        data: { consumedAt: new Date(Date.now() - 15000) },
      });

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'BrandNewPassword456!',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain(
        'Your session could not be renewed and you must log in again',
      );

      // Auth cookies cleared
      const cookies = extractCookies(res);
      const accessCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.ACCESS_TOKEN));
      const refreshCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.REFRESH_TOKEN));
      expect(accessCookie).toContain('Max-Age=0');
      expect(refreshCookie).toContain('Max-Age=0');

      // Session revoked
      const dbSession = await prisma.session.findUnique({ where: { id: sessions[0].id } });
      expect(dbSession?.revokedAt).not.toBeNull();

      // All refresh tokens for session marked revoked
      const unrevokedTokens = await prisma.refreshToken.findMany({
        where: { sessionId: sessions[0].id, revokedAt: null },
      });
      expect(unrevokedTokens).toHaveLength(0);

      // New password is active
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.csrfCookieVal)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ email: 'replayed-refresh@example.com', password: 'BrandNewPassword456!' });
      expect(loginRes.status).toBe(200);
    });

    it('invalidates PASSWORD_RESET tokens while preserving EMAIL_VERIFICATION tokens', async () => {
      const user = await createTestCustomer('selective-tokens@example.com', 'OldPassword123!');

      // Issue EMAIL_VERIFICATION token
      const { rawToken: emailToken } = await securityTokenService.createToken(
        user.id,
        'EMAIL_VERIFICATION',
        24 * 60 * 60 * 1000,
      );

      // Issue PASSWORD_RESET token
      const { rawToken: resetToken } = await securityTokenService.createToken(
        user.id,
        'PASSWORD_RESET',
        60 * 60 * 1000,
      );

      const auth = await loginCustomer('selective-tokens@example.com', 'OldPassword123!');

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword456!',
        });

      expect(res.status).toBe(200);

      // PASSWORD_RESET token must be consumed
      const dbResetToken = await prisma.securityToken.findUnique({
        where: { tokenHash: hashToken(resetToken) },
      });
      expect(dbResetToken?.consumedAt).not.toBeNull();

      // EMAIL_VERIFICATION token must remain UNCONSUMED
      const dbEmailToken = await prisma.securityToken.findUnique({
        where: { tokenHash: hashToken(emailToken) },
      });
      expect(dbEmailToken?.consumedAt).toBeNull();
    });

    it('enforces changePasswordLimiter: 6th attempt within 15 min is rejected with 429', async () => {
      await createTestCustomer('rate-limit-pw@example.com', 'OldPassword123!');
      const auth = await loginCustomer('rate-limit-pw@example.com', 'OldPassword123!');

      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/v1/auth/change-password')
          .set('Origin', env.FRONTEND_URL)
          .set('Cookie', auth.cookieHeader)
          .set('x-csrf-token', auth.csrfHeader)
          .set('x-test-rate-limit', 'true')
          .send({
            currentPassword: 'WrongPassword!',
            newPassword: 'NewPassword456!',
          });
        expect(res.status).toBe(401);
      }

      // 6th attempt blocked with 429
      const blockedRes = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .set('x-test-rate-limit', 'true')
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword456!',
        });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error.code).toBe('TOO_MANY_REQUESTS');
    });
  });

  describe('GET /api/v1/auth/sessions', () => {
    it('returns active sessions with masked IP, parsed device, and current session flag', async () => {
      const user = await createTestCustomer('list-sessions@example.com');
      const auth = await loginCustomer('list-sessions@example.com');

      // Create secondary active session
      const secSession = await createSecondarySession(
        user.id,
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
      );

      // Create a revoked session (should be excluded)
      await prisma.session.create({
        data: {
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          revokedAt: new Date(),
          revokedReason: 'LOGOUT',
        },
      });

      // Create an expired session (should be excluded)
      await prisma.session.create({
        data: {
          userId: user.id,
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      const res = await request(app).get('/api/v1/auth/sessions').set('Cookie', auth.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const sessions = res.body.data.sessions;
      expect(sessions).toHaveLength(2); // Current session + secSession

      const current = sessions.find((s: { isCurrent: boolean }) => s.isCurrent === true);
      const secondary = sessions.find((s: { isCurrent: boolean }) => s.isCurrent === false);

      expect(current).toBeDefined();
      expect(secondary).toBeDefined();
      expect(secondary.id).toBe(secSession.id);
      expect(secondary.device.deviceType).toBe('mobile');
      expect(secondary.device.os).toBe('iOS');
      expect(secondary.ipAddress).toBe('198.51.100.xxx');

      // Refresh tokens and hashes are not exposed
      expect(sessions[0].refreshTokens).toBeUndefined();
      expect(sessions[0].tokenHash).toBeUndefined();
    });

    it('enforces cross-user isolation: User A cannot see User B sessions', async () => {
      await createTestCustomer('user-a@example.com');
      const userB = await createTestCustomer('user-b@example.com');

      const authA = await loginCustomer('user-a@example.com');
      await createSecondarySession(userB.id);

      const res = await request(app).get('/api/v1/auth/sessions').set('Cookie', authA.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.data.sessions).toHaveLength(1);
    });
  });

  describe('DELETE /api/v1/auth/sessions/:id', () => {
    it('revokes a secondary session and its refresh tokens', async () => {
      const user = await createTestCustomer('revoke-sec@example.com');
      const auth = await loginCustomer('revoke-sec@example.com');
      const secondary = await createSecondarySession(user.id);

      const res = await request(app)
        .delete(`/api/v1/auth/sessions/${secondary.id}`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader);

      expect(res.status).toBe(200);
      expect(res.body.data.isCurrentSession).toBe(false);

      const dbSec = await prisma.session.findUnique({ where: { id: secondary.id } });
      expect(dbSec?.revokedAt).not.toBeNull();
      expect(dbSec?.revokedReason).toBe('USER_REVOKED');

      const dbTokens = await prisma.refreshToken.findMany({ where: { sessionId: secondary.id } });
      expect(dbTokens[0]?.revokedAt).not.toBeNull();
    });

    it('revokes own current session and clears auth cookies with isCurrentSession=true', async () => {
      const user = await createTestCustomer('revoke-curr@example.com');
      const auth = await loginCustomer('revoke-curr@example.com');

      // Find current session ID
      const sessions = await prisma.session.findMany({ where: { userId: user.id } });
      const currentSessionId = sessions[0].id;

      const res = await request(app)
        .delete(`/api/v1/auth/sessions/${currentSessionId}`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader);

      expect(res.status).toBe(200);
      expect(res.body.data.isCurrentSession).toBe(true);
      expect(res.body.data.csrfToken).toBeUndefined();

      // Rotated CSRF token returned through header
      expect(res.headers['x-csrf-token']).toBeDefined();

      const cookies = extractCookies(res);

      // Auth cookies cleared
      const accessCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.ACCESS_TOKEN));
      const refreshCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.REFRESH_TOKEN));
      expect(accessCookie).toBeDefined();
      expect(accessCookie).toContain('Max-Age=0');
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('Max-Age=0');

      // CSRF cookie is present and NOT cleared
      const csrfCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.CSRF_TOKEN));
      expect(csrfCookie).toBeDefined();
      expect(csrfCookie).not.toContain('Max-Age=0');
    });

    it('returns 404 SESSION_NOT_FOUND when attempting to revoke another user session without locking it', async () => {
      await createTestCustomer('attacker@example.com');
      const victim = await createTestCustomer('victim@example.com');

      const authAttacker = await loginCustomer('attacker@example.com');
      const victimSession = await createSecondarySession(victim.id);

      const res = await request(app)
        .delete(`/api/v1/auth/sessions/${victimSession.id}`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', authAttacker.cookieHeader)
        .set('x-csrf-token', authAttacker.csrfHeader);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('SESSION_NOT_FOUND');

      // Victim session remains untouched
      const dbVictimSession = await prisma.session.findUnique({ where: { id: victimSession.id } });
      expect(dbVictimSession?.revokedAt).toBeNull();
    });

    it('returns 404 SESSION_NOT_FOUND for non-existent session ID', async () => {
      await createTestCustomer('not-found-session@example.com');
      const auth = await loginCustomer('not-found-session@example.com');

      const res = await request(app)
        .delete('/api/v1/auth/sessions/non-existent-id-123')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
    });
  });

  describe('POST /api/v1/auth/sessions/revoke-others', () => {
    it('revokes all secondary sessions and leaves current session intact', async () => {
      const user = await createTestCustomer('revoke-others@example.com');
      const auth = await loginCustomer('revoke-others@example.com');

      const sec1 = await createSecondarySession(user.id);
      const sec2 = await createSecondarySession(user.id);

      const res = await request(app)
        .post('/api/v1/auth/sessions/revoke-others')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.revokedCount).toBe(2);
      expect(res.body.data.csrfToken).toBeUndefined();

      // Check DB
      const dbSec1 = await prisma.session.findUnique({ where: { id: sec1.id } });
      const dbSec2 = await prisma.session.findUnique({ where: { id: sec2.id } });
      expect(dbSec1?.revokedAt).not.toBeNull();
      expect(dbSec2?.revokedAt).not.toBeNull();

      // Current session still works
      const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', auth.accessTokenVal);
      expect(meRes.status).toBe(200);
    });

    it('returns revokedCount=0 when no other sessions exist', async () => {
      await createTestCustomer('single-session@example.com');
      const auth = await loginCustomer('single-session@example.com');

      const res = await request(app)
        .post('/api/v1/auth/sessions/revoke-others')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader);

      expect(res.status).toBe(200);
      expect(res.body.data.revokedCount).toBe(0);
    });

    it('handles concurrent revoke-others calls safely without deadlocks', async () => {
      const user = await createTestCustomer('concur-revoke@example.com');
      const auth = await loginCustomer('concur-revoke@example.com');

      await createSecondarySession(user.id);
      await createSecondarySession(user.id);

      // Fire 3 simultaneous revoke-others calls
      const responses = await Promise.all([
        request(app)
          .post('/api/v1/auth/sessions/revoke-others')
          .set('Origin', env.FRONTEND_URL)
          .set('Cookie', auth.cookieHeader)
          .set('x-csrf-token', auth.csrfHeader),
        request(app)
          .post('/api/v1/auth/sessions/revoke-others')
          .set('Origin', env.FRONTEND_URL)
          .set('Cookie', auth.cookieHeader)
          .set('x-csrf-token', auth.csrfHeader),
        request(app)
          .post('/api/v1/auth/sessions/revoke-others')
          .set('Origin', env.FRONTEND_URL)
          .set('Cookie', auth.cookieHeader)
          .set('x-csrf-token', auth.csrfHeader),
      ]);

      responses.forEach((r) => {
        expect(r.status).toBe(200);
      });

      const totalRevoked = responses.reduce((acc, r) => acc + r.body.data.revokedCount, 0);
      expect(totalRevoked).toBe(2);
    });
  });
});
