import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { env } from '../../../config/env.js';
import { cleanDatabase, testPool, extractCookies } from '../../../test/setup.js';
import { emailService } from '../../email/email.service.js';
import { ConsoleTransport } from '../../email/transports/console.transport.js';
import { hashPassword } from '../../../lib/crypto.js';
import { securityTokenService } from '../security-token.service.js';
import { requireVerifiedEmail } from '../../../middleware/auth.js';
import type { Request, Response } from 'express';

describe('Email Verification & Account Security Integration Tests', () => {
  let testTransport: ConsoleTransport;

  beforeEach(async () => {
    await cleanDatabase();
    testTransport = new ConsoleTransport();
    emailService.setTransport(testTransport);
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
    password = 'Password123!',
    status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE',
    emailVerified = false,
    role: 'CUSTOMER' | 'ADMIN' = 'CUSTOMER',
  ) {
    const passwordHash = await hashPassword(password);
    return await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        status,
        emailVerified,
        emailVerifiedAt: emailVerified ? new Date() : null,
        profile: {
          create: {
            firstName: 'Test',
            lastName: 'User',
          },
        },
      },
      include: { profile: true },
    });
  }

  async function loginAndGetCookies(email: string, password = 'Password123!') {
    const csrfHeaders = getCsrfHeaders();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', csrfHeaders.Origin)
      .set('Cookie', csrfHeaders.Cookie)
      .set('x-csrf-token', csrfHeaders['x-csrf-token'])
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
      accessTokenVal,
      refreshCookieVal,
      csrfCookieVal,
      csrfHeader,
      cookieHeader: `${accessTokenVal}; ${refreshCookieVal}; ${csrfCookieVal}`,
    };
  }

  describe('POST /api/v1/auth/verify-email', () => {
    it('verifies customer email successfully using valid single-use token', async () => {
      const user = await createTestCustomer('unverified@example.com');
      const tokenResult = await securityTokenService.createToken(
        user.id,
        'EMAIL_VERIFICATION',
        24 * 60 * 60 * 1000,
      );

      const csrfHeaders = getCsrfHeaders();
      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Origin', csrfHeaders.Origin)
        .set('Cookie', csrfHeaders.Cookie)
        .set('x-csrf-token', csrfHeaders['x-csrf-token'])
        .send({ token: tokenResult.rawToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Email verified successfully');
      expect(res.body.data.emailVerified).toBe(true);
      expect(res.headers['x-csrf-token']).toBeDefined();

      // Verify database record
      const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(updatedUser.emailVerified).toBe(true);
      expect(updatedUser.emailVerifiedAt).toBeInstanceOf(Date);

      // Verify token marked consumed
      const dbToken = await prisma.securityToken.findUniqueOrThrow({
        where: { id: tokenResult.tokenId },
      });
      expect(dbToken.consumedAt).toBeInstanceOf(Date);
    });

    it('idempotency: consuming a valid, unconsumed token succeeds even if user is already verified', async () => {
      const user = await createTestCustomer(
        'alreadyverified@example.com',
        'Password123!',
        'ACTIVE',
        true,
      );
      const originalVerifiedAt = user.emailVerifiedAt!;

      const tokenResult = await securityTokenService.createToken(
        user.id,
        'EMAIL_VERIFICATION',
        24 * 60 * 60 * 1000,
      );

      const csrfHeaders = getCsrfHeaders();
      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Origin', csrfHeaders.Origin)
        .set('Cookie', csrfHeaders.Cookie)
        .set('x-csrf-token', csrfHeaders['x-csrf-token'])
        .send({ token: tokenResult.rawToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.emailVerified).toBe(true);

      const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(updatedUser.emailVerified).toBe(true);
      expect(updatedUser.emailVerifiedAt?.getTime()).toBe(originalVerifiedAt.getTime());

      // Token was consumed
      const dbToken = await prisma.securityToken.findUniqueOrThrow({
        where: { id: tokenResult.tokenId },
      });
      expect(dbToken.consumedAt).toBeInstanceOf(Date);
    });

    it('replay rejection: replaying an already-consumed token fails with 400 INVALID_OR_EXPIRED_TOKEN', async () => {
      const user = await createTestCustomer('replay@example.com');
      const tokenResult = await securityTokenService.createToken(
        user.id,
        'EMAIL_VERIFICATION',
        24 * 60 * 60 * 1000,
      );

      const csrfHeaders = getCsrfHeaders();

      // First verification succeeds
      const firstRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Origin', csrfHeaders.Origin)
        .set('Cookie', csrfHeaders.Cookie)
        .set('x-csrf-token', csrfHeaders['x-csrf-token'])
        .send({ token: tokenResult.rawToken });
      expect(firstRes.status).toBe(200);

      // Second attempt (replay) must fail with 400
      const secondRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Origin', csrfHeaders.Origin)
        .set('Cookie', csrfHeaders.Cookie)
        .set('x-csrf-token', csrfHeaders['x-csrf-token'])
        .send({ token: tokenResult.rawToken });

      expect(secondRes.status).toBe(400);
      expect(secondRes.body.success).toBe(false);
      expect(secondRes.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
    });

    it('expired token fails with 400 INVALID_OR_EXPIRED_TOKEN', async () => {
      const user = await createTestCustomer('expired@example.com');
      // Create token with -1ms expiry
      const tokenResult = await securityTokenService.createToken(
        user.id,
        'EMAIL_VERIFICATION',
        -1000,
      );

      const csrfHeaders = getCsrfHeaders();
      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Origin', csrfHeaders.Origin)
        .set('Cookie', csrfHeaders.Cookie)
        .set('x-csrf-token', csrfHeaders['x-csrf-token'])
        .send({ token: tokenResult.rawToken });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
    });

    it('tampered/invalid token fails with 400 INVALID_OR_EXPIRED_TOKEN', async () => {
      const csrfHeaders = getCsrfHeaders();
      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Origin', csrfHeaders.Origin)
        .set('Cookie', csrfHeaders.Cookie)
        .set('x-csrf-token', csrfHeaders['x-csrf-token'])
        .send({ token: 'non-existent-or-tampered-token-12345' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
    });

    it('suspended user cannot verify email and receives 403 ACCOUNT_SUSPENDED', async () => {
      const user = await createTestCustomer('suspended@example.com', 'Password123!', 'SUSPENDED');
      const tokenResult = await securityTokenService.createToken(
        user.id,
        'EMAIL_VERIFICATION',
        24 * 60 * 60 * 1000,
      );

      const csrfHeaders = getCsrfHeaders();
      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Origin', csrfHeaders.Origin)
        .set('Cookie', csrfHeaders.Cookie)
        .set('x-csrf-token', csrfHeaders['x-csrf-token'])
        .send({ token: tokenResult.rawToken });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('atomic single-use: concurrent consumption requests for the same token allow exactly one to succeed', async () => {
      const user = await createTestCustomer('concurrent@example.com');
      const tokenResult = await securityTokenService.createToken(
        user.id,
        'EMAIL_VERIFICATION',
        24 * 60 * 60 * 1000,
      );

      const csrfHeaders = getCsrfHeaders();

      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/auth/verify-email')
          .set('Origin', csrfHeaders.Origin)
          .set('Cookie', csrfHeaders.Cookie)
          .set('x-csrf-token', csrfHeaders['x-csrf-token'])
          .send({ token: tokenResult.rawToken }),
        request(app)
          .post('/api/v1/auth/verify-email')
          .set('Origin', csrfHeaders.Origin)
          .set('Cookie', csrfHeaders.Cookie)
          .set('x-csrf-token', csrfHeaders['x-csrf-token'])
          .send({ token: tokenResult.rawToken }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 400]);

      const successRes = res1.status === 200 ? res1 : res2;
      const failRes = res1.status === 400 ? res1 : res2;

      expect(successRes.body.success).toBe(true);
      expect(failRes.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
    });

    it('enforces verifyEmailIpLimiter: 11th verification attempt from same IP is rejected with 429', async () => {
      const csrfHeaders = getCsrfHeaders();

      for (let i = 1; i <= 10; i++) {
        const res = await request(app)
          .post('/api/v1/auth/verify-email')
          .set('Origin', csrfHeaders.Origin)
          .set('Cookie', csrfHeaders.Cookie)
          .set('x-csrf-token', csrfHeaders['x-csrf-token'])
          .set('x-test-rate-limit', 'true')
          .send({ token: `dummy-token-${i}` });
        // Fails with 400 (invalid token), but allowed through rate limiter
        expect(res.status).toBe(400);
      }

      // 11th attempt from same IP is rejected by verifyEmailIpLimiter with 429
      const res11 = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Origin', csrfHeaders.Origin)
        .set('Cookie', csrfHeaders.Cookie)
        .set('x-csrf-token', csrfHeaders['x-csrf-token'])
        .set('x-test-rate-limit', 'true')
        .send({ token: 'dummy-token-11' });

      expect(res11.status).toBe(429);
      expect(res11.body.error.code).toBe('TOO_MANY_REQUESTS');
      expect(res11.body.error.message).toContain('Too many email verification attempts');
    });
  });

  describe('POST /api/v1/auth/resend-verification', () => {
    it('authenticated user: resends verification email strictly using session email, ignoring body email', async () => {
      const user = await createTestCustomer(
        'authuser@example.com',
        'Password123!',
        'ACTIVE',
        false,
      );
      const auth = await loginAndGetCookies(user.email);

      const csrfHeaders = getCsrfHeaders();
      const sendSpy = vi.spyOn(emailService, 'sendVerificationEmail');

      const res = await request(app)
        .post('/api/v1/auth/resend-verification')
        .set('Origin', csrfHeaders.Origin)
        .set('Cookie', `${auth.cookieHeader}`)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ email: 'spoofed_target@example.com' }); // Submitted different email must be ignored

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('verification link has been sent');

      // Assert email was sent to authuser@example.com, NOT spoofed_target@example.com
      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy.mock.calls[0][0].to).toBe(user.email);

      // Assert a new EMAIL_VERIFICATION token was created for user
      const activeToken = await prisma.securityToken.findFirst({
        where: { userId: user.id, type: 'EMAIL_VERIFICATION', consumedAt: null },
      });
      expect(activeToken).not.toBeNull();
    });

    it('authenticated user: already verified returns generic message without sending email', async () => {
      const user = await createTestCustomer(
        'verifieduser@example.com',
        'Password123!',
        'ACTIVE',
        true,
      );
      const auth = await loginAndGetCookies(user.email);

      const csrfHeaders = getCsrfHeaders();
      const sendSpy = vi.spyOn(emailService, 'sendVerificationEmail');

      const res = await request(app)
        .post('/api/v1/auth/resend-verification')
        .set('Origin', csrfHeaders.Origin)
        .set('Cookie', `${auth.cookieHeader}`)
        .set('x-csrf-token', auth.csrfHeader)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('verification link has been sent');
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('unauthenticated user: dispatches verification email to registered unverified email', async () => {
      await createTestCustomer('unauth@example.com', 'Password123!', 'ACTIVE', false);
      const csrfHeaders = getCsrfHeaders();
      const sendSpy = vi.spyOn(emailService, 'sendVerificationEmail');

      const res = await request(app)
        .post('/api/v1/auth/resend-verification')
        .set('Origin', csrfHeaders.Origin)
        .set('Cookie', csrfHeaders.Cookie)
        .set('x-csrf-token', csrfHeaders['x-csrf-token'])
        .send({ email: 'unauth@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('verification link has been sent');
      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy.mock.calls[0][0].to).toBe('unauth@example.com');
    });

    it('unauthenticated user: unknown email returns generic message without sending email (enumeration prevention)', async () => {
      const csrfHeaders = getCsrfHeaders();
      const sendSpy = vi.spyOn(emailService, 'sendVerificationEmail');

      const res = await request(app)
        .post('/api/v1/auth/resend-verification')
        .set('Origin', csrfHeaders.Origin)
        .set('Cookie', csrfHeaders.Cookie)
        .set('x-csrf-token', csrfHeaders['x-csrf-token'])
        .send({ email: 'nobody@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('verification link has been sent');
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('enforces resendVerificationIpLimiter: 11th request from same IP is rejected with 429', async () => {
      const csrfHeaders = getCsrfHeaders();

      for (let i = 1; i <= 10; i++) {
        const res = await request(app)
          .post('/api/v1/auth/resend-verification')
          .set('Origin', csrfHeaders.Origin)
          .set('Cookie', csrfHeaders.Cookie)
          .set('x-csrf-token', csrfHeaders['x-csrf-token'])
          .set('x-test-rate-limit', 'true')
          .send({ email: `random_${i}@example.com` });
        expect(res.status).toBe(200);
      }

      // 11th attempt from same IP is blocked by resendVerificationIpLimiter
      const res11 = await request(app)
        .post('/api/v1/auth/resend-verification')
        .set('Origin', csrfHeaders.Origin)
        .set('Cookie', csrfHeaders.Cookie)
        .set('x-csrf-token', csrfHeaders['x-csrf-token'])
        .set('x-test-rate-limit', 'true')
        .send({ email: 'random_11@example.com' });

      expect(res11.status).toBe(429);
      expect(res11.body.error.code).toBe('TOO_MANY_REQUESTS');
      expect(res11.body.error.message).toContain(
        'Too many verification email requests from this network',
      );
    });

    it('resilience: returns generic 200 message and does not crash when email service fails', async () => {
      await createTestCustomer('failure-resilience@example.com', 'Password123!', 'ACTIVE', false);
      const csrfHeaders = getCsrfHeaders();

      vi.spyOn(emailService, 'sendVerificationEmail').mockRejectedValueOnce(
        new Error('External email delivery service unavailable'),
      );

      const res = await request(app)
        .post('/api/v1/auth/resend-verification')
        .set('Origin', csrfHeaders.Origin)
        .set('Cookie', csrfHeaders.Cookie)
        .set('x-csrf-token', csrfHeaders['x-csrf-token'])
        .send({ email: 'failure-resilience@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('verification link has been sent');
    });
  });

  describe('requireVerifiedEmail Middleware', () => {
    it('allows verified user through', async () => {
      const user = await createTestCustomer(
        'verified-guard@example.com',
        'Password123!',
        'ACTIVE',
        true,
      );

      const mockReq = {
        user: {
          id: user.id,
          email: user.email,
          role: 'CUSTOMER',
          profile: null,
          sessionId: 'mock-session',
          emailVerified: false, // Middleware rechecks DB authoritatively
        },
      } as unknown as Request;
      const mockRes = {} as Response;
      const nextFn = vi.fn();

      await requireVerifiedEmail(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
      expect(mockReq.user?.emailVerified).toBe(true);
    });

    it('blocks unverified customer with 403 EMAIL_NOT_VERIFIED', async () => {
      const user = await createTestCustomer(
        'unverified-guard@example.com',
        'Password123!',
        'ACTIVE',
        false,
      );

      const mockReq = {
        user: {
          id: user.id,
          email: user.email,
          role: 'CUSTOMER',
          profile: null,
          sessionId: 'mock-session',
          emailVerified: false,
        },
      } as unknown as Request;
      const mockRes = {} as Response;
      const nextFn = vi.fn();

      await expect(requireVerifiedEmail(mockReq, mockRes, nextFn)).rejects.toMatchObject({
        statusCode: 403,
        code: 'EMAIL_NOT_VERIFIED',
      });
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('zero role bypass: blocks unverified ADMIN with 403 EMAIL_NOT_VERIFIED', async () => {
      const admin = await createTestCustomer(
        'unverified-admin@example.com',
        'Password123!',
        'ACTIVE',
        false,
        'ADMIN',
      );

      const mockReq = {
        user: {
          id: admin.id,
          email: admin.email,
          role: 'ADMIN',
          profile: null,
          sessionId: 'mock-session',
          emailVerified: false,
        },
      } as unknown as Request;
      const mockRes = {} as Response;
      const nextFn = vi.fn();

      await expect(requireVerifiedEmail(mockReq, mockRes, nextFn)).rejects.toMatchObject({
        statusCode: 403,
        code: 'EMAIL_NOT_VERIFIED',
      });
      expect(nextFn).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/auth/me emailVerified field', () => {
    it('returns emailVerified: false for unverified customer and true after verification', async () => {
      const user = await createTestCustomer(
        'me-check@example.com',
        'Password123!',
        'ACTIVE',
        false,
      );
      const auth = await loginAndGetCookies(user.email);

      // 1. Initial /me check
      const meRes1 = await request(app).get('/api/v1/auth/me').set('Cookie', auth.cookieHeader);

      expect(meRes1.status).toBe(200);
      expect(meRes1.body.data.user.emailVerified).toBe(false);

      // 2. Verify email
      const tokenResult = await securityTokenService.createToken(
        user.id,
        'EMAIL_VERIFICATION',
        24 * 60 * 60 * 1000,
      );
      const csrfHeaders = getCsrfHeaders();
      await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Origin', csrfHeaders.Origin)
        .set('Cookie', csrfHeaders.Cookie)
        .set('x-csrf-token', csrfHeaders['x-csrf-token'])
        .send({ token: tokenResult.rawToken });

      // 3. Second /me check (same session access token queries DB freshness)
      const meRes2 = await request(app).get('/api/v1/auth/me').set('Cookie', auth.cookieHeader);

      expect(meRes2.status).toBe(200);
      expect(meRes2.body.data.user.emailVerified).toBe(true);
    });
  });
});
