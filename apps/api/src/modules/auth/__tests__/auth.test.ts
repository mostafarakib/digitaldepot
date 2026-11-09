import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { env } from '../../../config/env.js';
import { cleanDatabase, testPool, extractCookies } from '../../../test/setup.js';

describe('Authentication API Integration Tests', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await testPool.end();
  });

  const validRegistration = {
    firstName: 'Tanvir',
    lastName: 'Ahmed',
    email: 'tanvir.ahmed@example.com',
    password: 'SecurePassword123!',
  };

  function getCsrfHeaders() {
    const token = generateCsrfToken();
    return {
      Origin: env.FRONTEND_URL,
      Cookie: `${COOKIE_NAMES.CSRF_TOKEN}=${token}`,
      'x-csrf-token': token,
    };
  }

  describe('GET /api/v1/auth/csrf', () => {
    it('returns CSRF token, sets dd_csrf cookie, and sets no-cache bootstrap headers', async () => {
      const res = await request(app).get('/api/v1/auth/csrf');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.csrfToken).toBe('string');
      expect(res.headers['x-csrf-token']).toBe(res.body.data.csrfToken);

      const cookies = extractCookies(res);
      const csrfCookie = cookies.find((c) => c.startsWith(`${COOKIE_NAMES.CSRF_TOKEN}=`));
      expect(csrfCookie).toBeDefined();

      expect(res.headers['cache-control']).toBe('no-store, no-cache, must-revalidate');
      expect(res.headers['pragma']).toBe('no-cache');
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it('successfully registers a customer without auto-logging in', async () => {
      const csrf = getCsrfHeaders();

      const res = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send(validRegistration);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Registration successful. Please log in.');
      expect(res.body.data.userId).toBeDefined();

      // Safeguard 7: Registration does NOT set auth cookies
      const cookies = extractCookies(res);
      const hasAccessToken = cookies.some((c: string) => c.includes(COOKIE_NAMES.ACCESS_TOKEN));
      const hasRefreshToken = cookies.some((c: string) => c.includes(COOKIE_NAMES.REFRESH_TOKEN));
      expect(hasAccessToken).toBe(false);
      expect(hasRefreshToken).toBe(false);

      // Verify record committed in PostgreSQL
      const dbUser = await prisma.user.findUnique({
        where: { email: validRegistration.email },
        include: { profile: true },
      });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.role).toBe('CUSTOMER');
      expect(dbUser?.status).toBe('ACTIVE');
      expect(dbUser?.profile?.firstName).toBe(validRegistration.firstName);
      expect(dbUser?.profile?.lastName).toBe(validRegistration.lastName);
    });

    it('rejects registration with duplicate email with 409 Conflict', async () => {
      const csrf = getCsrfHeaders();

      // Register first time
      await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send(validRegistration);

      // Attempt duplicate
      const duplicateRes = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send(validRegistration);

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('rejects registration missing firstName or lastName', async () => {
      const csrf = getCsrfHeaders();

      const res = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          email: 'missing.name@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      const csrf = getCsrfHeaders();
      await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send(validRegistration);
    });

    it('successfully logs in with valid credentials and sets HttpOnly cookies', async () => {
      const csrf = getCsrfHeaders();

      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          email: validRegistration.email,
          password: validRegistration.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(validRegistration.email);
      expect(res.body.data.user.role).toBe('CUSTOMER');
      expect(res.body.data.user.profile.firstName).toBe(validRegistration.firstName);

      const cookies = extractCookies(res);
      const accessTokenCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.ACCESS_TOKEN));
      const refreshTokenCookie = cookies.find((c: string) =>
        c.includes(COOKIE_NAMES.REFRESH_TOKEN),
      );

      expect(accessTokenCookie).toBeDefined();
      expect(accessTokenCookie).toContain('HttpOnly');
      expect(accessTokenCookie).toContain('Path=/');

      expect(refreshTokenCookie).toBeDefined();
      expect(refreshTokenCookie).toContain('HttpOnly');
      expect(refreshTokenCookie).toContain('Path=/');

      // Verify Session committed in PostgreSQL
      const sessions = await prisma.session.findMany({
        where: { user: { email: validRegistration.email } },
        include: { refreshTokens: true },
      });
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.refreshTokens).toHaveLength(1);
      expect(sessions[0]?.revokedAt).toBeNull();
    });

    it('returns generic invalid credentials for unknown email', async () => {
      const csrf = getCsrfHeaders();

      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('returns generic invalid credentials for incorrect password', async () => {
      const csrf = getCsrfHeaders();

      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          email: validRegistration.email,
          password: 'WrongPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('verifies password before revealing suspended account status', async () => {
      const csrf = getCsrfHeaders();

      // Register the user first
      await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send(validRegistration);

      // Suspend user in PostgreSQL
      await prisma.user.update({
        where: { email: validRegistration.email },
        data: { status: 'SUSPENDED' },
      });

      // Attempt login with WRONG password on suspended account -> MUST return generic 401
      const wrongPwRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          email: validRegistration.email,
          password: 'IncorrectPassword123!',
        });

      expect(wrongPwRes.status).toBe(401);
      expect(wrongPwRes.body.error.code).toBe('INVALID_CREDENTIALS');

      // Attempt login with CORRECT password on suspended account -> Returns 403 ACCOUNT_SUSPENDED
      const correctPwRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          email: validRegistration.email,
          password: validRegistration.password,
        });

      expect(correctPwRes.status).toBe(403);
      expect(correctPwRes.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns authenticated user profile using active database role', async () => {
      const csrf = getCsrfHeaders();
      await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send(validRegistration);

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          email: validRegistration.email,
          password: validRegistration.password,
        });

      const cookies = extractCookies(loginRes);
      const cookieHeader = cookies.map((c: string) => c.split(';')[0]).join('; ');

      const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', cookieHeader);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data.user.email).toBe(validRegistration.email);
      expect(meRes.body.data.user.role).toBe('CUSTOMER');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('revokes session in database and clears auth cookies', async () => {
      const csrf = getCsrfHeaders();
      await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send(validRegistration);

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          email: validRegistration.email,
          password: validRegistration.password,
        });

      expect(loginRes.status).toBe(200);

      const cookies = extractCookies(loginRes);
      const authCookieHeader = cookies
        .filter((c: string) => !c.includes(COOKIE_NAMES.CSRF_TOKEN))
        .map((c: string) => c.split(';')[0])
        .join('; ');

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${authCookieHeader}; ${csrf.Cookie}`)
        .set('x-csrf-token', csrf['x-csrf-token']);

      expect(logoutRes.status).toBe(200);

      // Verify session marked revoked in PostgreSQL
      const session = await prisma.session.findFirst({
        where: { user: { email: validRegistration.email } },
      });
      expect(session).not.toBeNull();
      expect(session?.revokedAt).not.toBeNull();
      expect(session?.revokedReason).toBe('LOGOUT');

      // Subsequent /auth/me call returns 401
      const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', authCookieHeader);
      expect(meRes.status).toBe(401);
    });
  });
});
