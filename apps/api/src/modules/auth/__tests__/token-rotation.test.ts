import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { env } from '../../../config/env.js';
import { cleanDatabase, testPool, extractCookies } from '../../../test/setup.js';

describe('Refresh-Token Rotation and Concurrency Tests', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await testPool.end();
  });

  const testUser = {
    firstName: 'Sumaiya',
    lastName: 'Haque',
    email: 'sumaiya.haque@example.com',
    password: 'Password123!',
  };

  function getCsrfHeaders() {
    const token = generateCsrfToken();
    return {
      Origin: env.FRONTEND_URL,
      Cookie: `${COOKIE_NAMES.CSRF_TOKEN}=${token}`,
      'x-csrf-token': token,
    };
  }

  async function registerAndLogin(): Promise<{
    accessToken: string;
    refreshToken: string;
    cookieHeader: string;
    userId: string;
  }> {
    const csrf = getCsrfHeaders();

    await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', csrf.Origin)
      .set('Cookie', csrf.Cookie)
      .set('x-csrf-token', csrf['x-csrf-token'])
      .send(testUser);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', csrf.Origin)
      .set('Cookie', csrf.Cookie)
      .set('x-csrf-token', csrf['x-csrf-token'])
      .send({
        email: testUser.email,
        password: testUser.password,
      });

    const cookies = extractCookies(loginRes);
    const accessToken =
      cookies
        .find((c: string) => c.includes(COOKIE_NAMES.ACCESS_TOKEN))
        ?.split(';')[0]
        .split('=')[1] || '';
    const refreshToken =
      cookies
        .find((c: string) => c.includes(COOKIE_NAMES.REFRESH_TOKEN))
        ?.split(';')[0]
        .split('=')[1] || '';
    const cookieHeader = cookies
      .filter((c: string) => !c.includes(COOKIE_NAMES.CSRF_TOKEN))
      .map((c: string) => c.split(';')[0])
      .join('; ');

    return {
      accessToken,
      refreshToken,
      cookieHeader,
      userId: loginRes.body.data.user.id,
    };
  }

  it('rotates refresh token, consuming ancestor and creating successor in same family', async () => {
    const { refreshToken, cookieHeader } = await registerAndLogin();
    const csrf = getCsrfHeaders();

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', csrf.Origin)
      .set('Cookie', `${cookieHeader}; ${csrf.Cookie}`)
      .set('x-csrf-token', csrf['x-csrf-token']);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);

    const newCookies = extractCookies(refreshRes);
    const newRefreshToken = newCookies
      .find((c: string) => c.includes(COOKIE_NAMES.REFRESH_TOKEN))
      ?.split(';')[0]
      .split('=')[1];
    expect(newRefreshToken).toBeDefined();
    expect(newRefreshToken).not.toBe(refreshToken);

    // Verify in database: exactly 1 consumed token and 1 unconsumed token in the same family
    const tokens = await prisma.refreshToken.findMany({
      orderBy: { createdAt: 'asc' },
    });
    expect(tokens).toHaveLength(2);
    expect(tokens[0]?.consumedAt).not.toBeNull();
    expect(tokens[1]?.consumedAt).toBeNull();
    expect(tokens[0]?.familyId).toBe(tokens[1]?.familyId);
  });

  it('handles simultaneous concurrent refresh requests: exactly 1 succeeds, others receive REFRESH_ALREADY_ROTATED', async () => {
    const { cookieHeader } = await registerAndLogin();
    const csrf = getCsrfHeaders();

    // Fire 5 concurrent refresh requests with the exact same initial cookie
    const requests = Array.from({ length: 5 }, () =>
      request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${cookieHeader}; ${csrf.Cookie}`)
        .set('x-csrf-token', csrf['x-csrf-token']),
    );

    const responses = await Promise.all(requests);

    const successful = responses.filter((r) => r.status === 200);
    const alreadyRotated = responses.filter(
      (r) => r.status === 401 && r.body.error?.code === 'REFRESH_ALREADY_ROTATED',
    );

    expect(successful).toHaveLength(1);
    expect(alreadyRotated).toHaveLength(4);

    // Verify session remains active in database and was not falsely revoked
    const session = await prisma.session.findFirst({
      where: { user: { email: testUser.email } },
    });
    expect(session?.revokedAt).toBeNull();
  });

  it('returns REFRESH_ALREADY_ROTATED when presenting a consumed token within the 10-second grace window', async () => {
    const { cookieHeader } = await registerAndLogin();
    const csrf = getCsrfHeaders();

    // 1st request rotates the token successfully
    const firstRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', csrf.Origin)
      .set('Cookie', `${cookieHeader}; ${csrf.Cookie}`)
      .set('x-csrf-token', csrf['x-csrf-token']);
    expect(firstRes.status).toBe(200);

    // 2nd request with the old cookie immediately (< 10s) returns REFRESH_ALREADY_ROTATED
    const secondRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', csrf.Origin)
      .set('Cookie', `${cookieHeader}; ${csrf.Cookie}`)
      .set('x-csrf-token', csrf['x-csrf-token']);

    expect(secondRes.status).toBe(401);
    expect(secondRes.body.error.code).toBe('REFRESH_ALREADY_ROTATED');

    // Verify session was NOT revoked
    const session = await prisma.session.findFirst({
      where: { user: { email: testUser.email } },
    });
    expect(session?.revokedAt).toBeNull();
  });

  it('commits replay revocation when a consumed token is presented after the 10-second grace window', async () => {
    const { cookieHeader } = await registerAndLogin();
    const csrf = getCsrfHeaders();

    // Rotate token
    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', csrf.Origin)
      .set('Cookie', `${cookieHeader}; ${csrf.Cookie}`)
      .set('x-csrf-token', csrf['x-csrf-token']);

    // Artificially age the consumed token in PostgreSQL past the 10-second grace window (15 seconds ago)
    const fifteenSecondsAgo = new Date(Date.now() - 15000);
    await prisma.refreshToken.updateMany({
      where: { consumedAt: { not: null } },
      data: { consumedAt: fifteenSecondsAgo },
    });

    // Present the consumed token again (replay attack simulation)
    const replayRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', csrf.Origin)
      .set('Cookie', `${cookieHeader}; ${csrf.Cookie}`)
      .set('x-csrf-token', csrf['x-csrf-token']);

    expect(replayRes.status).toBe(401);
    expect(replayRes.body.error.code).toBe('TOKEN_REUSE_DETECTED');

    // Safeguard 3: Verify that revocation was committed to PostgreSQL disk and not rolled back
    const session = await prisma.session.findFirst({
      where: { user: { email: testUser.email } },
    });
    expect(session?.revokedAt).not.toBeNull();
    expect(session?.revokedReason).toBe('TOKEN_REUSE_DETECTED');

    // All tokens in family are marked revoked
    const unrevokedTokens = await prisma.refreshToken.findMany({
      where: { sessionId: session?.id, revokedAt: null },
    });
    expect(unrevokedTokens).toHaveLength(0);
  });

  describe('Safeguard 4: Logout vs Concurrent Refresh Transaction Orderings', () => {
    it('Ordering 1: Logout commits first -> refresh observes revoked session and creates no credentials', async () => {
      const { cookieHeader } = await registerAndLogin();
      const csrf = getCsrfHeaders();

      // Logout commits
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${cookieHeader}; ${csrf.Cookie}`)
        .set('x-csrf-token', csrf['x-csrf-token']);
      expect(logoutRes.status).toBe(200);

      // Concurrent/subsequent refresh with old cookie observes revoked session
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${cookieHeader}; ${csrf.Cookie}`)
        .set('x-csrf-token', csrf['x-csrf-token']);

      expect(refreshRes.status).toBe(401);
      expect(refreshRes.body.error.code).toBe('SESSION_REVOKED_OR_EXPIRED');

      // Verify no active unrevoked refresh tokens exist
      const activeTokens = await prisma.refreshToken.findMany({
        where: { revokedAt: null },
      });
      expect(activeTokens).toHaveLength(0);
    });

    it('Ordering 2: Refresh commits first -> logout observes updated session, revokes it, and clears cookies', async () => {
      const { cookieHeader } = await registerAndLogin();
      const csrf = getCsrfHeaders();

      // Refresh commits first
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${cookieHeader}; ${csrf.Cookie}`)
        .set('x-csrf-token', csrf['x-csrf-token']);
      expect(refreshRes.status).toBe(200);

      const refreshedCookies = extractCookies(refreshRes);
      const refreshedAuthCookieHeader = refreshedCookies
        .filter((c: string) => !c.includes(COOKIE_NAMES.CSRF_TOKEN))
        .map((c: string) => c.split(';')[0])
        .join('; ');

      // Logout called with the newly refreshed session
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${refreshedAuthCookieHeader}; ${csrf.Cookie}`)
        .set('x-csrf-token', csrf['x-csrf-token']);
      expect(logoutRes.status).toBe(200);

      // Verify session is revoked
      const session = await prisma.session.findFirst({
        where: { user: { email: testUser.email } },
      });
      expect(session?.revokedAt).not.toBeNull();
      expect(session?.revokedReason).toBe('LOGOUT');
    });
  });
});
