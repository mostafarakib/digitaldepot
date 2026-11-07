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
import { hashPassword, hashToken } from '../../../lib/crypto.js';
import { securityTokenService } from '../security-token.service.js';

describe('Password Reset & Account Recovery Integration Tests', () => {
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

  describe('POST /api/v1/auth/forgot-password', () => {
    const genericExpectedMsg =
      'If an account with that email address exists, a password reset link has been sent.';

    it('issues a PASSWORD_RESET token and dispatches reset email for existing active account', async () => {
      const user = await createTestCustomer('active@example.com');
      const csrf = getCsrfHeaders();

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ email: 'active@example.com', locale: 'bn' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe(genericExpectedMsg);

      // Verify token in database
      const tokens = await prisma.securityToken.findMany({
        where: { userId: user.id, type: 'PASSWORD_RESET', consumedAt: null },
      });
      expect(tokens).toHaveLength(1);
      const tokenRow = tokens[0];
      expect(tokenRow.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Verify email was dispatched
      const sent = testTransport.getLastSentEmail();
      expect(sent).toBeDefined();
      expect(sent?.to).toBe('active@example.com');
      expect(sent?.subject).toBe('আপনার DigitalDepot পাসওয়ার্ড রিসেট করুন');
      expect(sent?.text).toContain('/bn/reset-password?token=');

      // Verify raw token in email matches tokenHash in DB
      const match = sent?.text.match(/\/bn\/reset-password\?token=([a-zA-Z0-9_-]+)/);
      expect(match).not.toBeNull();
      expect(hashToken(match![1])).toBe(tokenRow.tokenHash);
    });

    it('returns generic response for unknown account without issuing token or sending email', async () => {
      const csrf = getCsrfHeaders();

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ email: 'unknown@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe(genericExpectedMsg);

      // Verify no tokens and no emails
      const tokens = await prisma.securityToken.findMany({});
      expect(tokens).toHaveLength(0);
      expect(testTransport.getSentEmails()).toHaveLength(0);
    });

    it('returns generic response for suspended account without issuing token or sending email', async () => {
      await createTestCustomer('suspended@example.com', 'Pass123!', 'SUSPENDED');
      const csrf = getCsrfHeaders();

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ email: 'suspended@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe(genericExpectedMsg);

      const tokens = await prisma.securityToken.findMany({});
      expect(tokens).toHaveLength(0);
      expect(testTransport.getSentEmails()).toHaveLength(0);
    });

    it('handles race condition where account becomes SUSPENDED before User row lock is acquired', async () => {
      const user = await createTestCustomer('race-suspended@example.com', 'Pass123!', 'ACTIVE');
      const csrf = getCsrfHeaders();

      // Acquire an uncommitted row lock updating status to SUSPENDED using a separate PostgreSQL client.
      // In PostgreSQL Read Committed mode, forgotPassword's initial lookup sees committed 'ACTIVE' status,
      // but its subsequent `SELECT ... FOR UPDATE` will block until this transaction commits.
      const pgClient = await testPool.connect();
      try {
        await pgClient.query('BEGIN');
        await pgClient.query('UPDATE "User" SET status = $1 WHERE id = $2', ['SUSPENDED', user.id]);

        // Launch forgot-password request concurrently (reads ACTIVE, then blocks on FOR UPDATE lock)
        const reqPromise = request(app)
          .post('/api/v1/auth/forgot-password')
          .set('Origin', csrf.Origin)
          .set('Cookie', csrf.Cookie)
          .set('x-csrf-token', csrf['x-csrf-token'])
          .send({ email: 'race-suspended@example.com' });

        // Wait briefly for request to perform initial lookup and block waiting for row lock
        await new Promise((r) => setTimeout(r, 60));

        // Commit suspension, releasing the row lock
        await pgClient.query('COMMIT');

        const res = await reqPromise;

        // Anti-enumeration generic response preserved
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.message).toBe(genericExpectedMsg);

        // Under row lock, status was rechecked as SUSPENDED, so no token was issued
        const tokens = await prisma.securityToken.findMany({
          where: { userId: user.id },
        });
        expect(tokens).toHaveLength(0);

        // No email was dispatched
        expect(testTransport.getSentEmails()).toHaveLength(0);
      } finally {
        pgClient.release();
      }
    });

    it('handles race condition where account becomes SUSPENDED before User row lock is acquired', async () => {
      const user = await createTestCustomer('race-suspended@example.com', 'Pass123!', 'ACTIVE');
      const csrf = getCsrfHeaders();

      // Acquire an uncommitted row lock updating status to SUSPENDED using a separate PostgreSQL client.
      // In PostgreSQL Read Committed mode, forgotPassword's initial lookup sees committed 'ACTIVE' status,
      // but its subsequent `SELECT ... FOR UPDATE` will block until this transaction commits.
      const pgClient = await testPool.connect();
      try {
        await pgClient.query('BEGIN');
        await pgClient.query('UPDATE "User" SET status = $1 WHERE id = $2', ['SUSPENDED', user.id]);

        // Launch forgot-password request concurrently (reads ACTIVE, then blocks on FOR UPDATE lock)
        const reqPromise = request(app)
          .post('/api/v1/auth/forgot-password')
          .set('Origin', csrf.Origin)
          .set('Cookie', csrf.Cookie)
          .set('x-csrf-token', csrf['x-csrf-token'])
          .send({ email: 'race-suspended@example.com' });

        // Wait briefly for request to perform initial lookup and block waiting for row lock
        await new Promise((r) => setTimeout(r, 60));

        // Commit suspension, releasing the row lock
        await pgClient.query('COMMIT');

        const res = await reqPromise;

        // Anti-enumeration generic response preserved
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.message).toBe(genericExpectedMsg);

        // Under row lock, status was rechecked as SUSPENDED, so no token was issued
        const tokens = await prisma.securityToken.findMany({
          where: { userId: user.id },
        });
        expect(tokens).toHaveLength(0);

        // No email was dispatched
        expect(testTransport.getSentEmails()).toHaveLength(0);
      } finally {
        pgClient.release();
      }
    });

    it('invalidates prior unconsumed token when requesting reset again (satisfies partial unique index)', async () => {
      const user = await createTestCustomer('repeat@example.com');
      const csrf = getCsrfHeaders();

      // First request
      await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ email: 'repeat@example.com' });

      // Second request
      await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ email: 'repeat@example.com' });

      // In database: exactly 1 unconsumed token exists
      const activeTokens = await prisma.securityToken.findMany({
        where: { userId: user.id, type: 'PASSWORD_RESET', consumedAt: null },
      });
      expect(activeTokens).toHaveLength(1);

      // Total tokens = 2 (1 consumed, 1 active)
      const allTokens = await prisma.securityToken.findMany({
        where: { userId: user.id, type: 'PASSWORD_RESET' },
      });
      expect(allTokens).toHaveLength(2);
      expect(allTokens.filter((t) => t.consumedAt !== null)).toHaveLength(1);
    });

    it('does not reveal failure or throw when email transport fails', async () => {
      await createTestCustomer('fail-email@example.com');
      const csrf = getCsrfHeaders();

      const failingTransport = {
        send: vi.fn().mockRejectedValue(new Error('Resend network timeout')),
      };
      emailService.setTransport(failingTransport);

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ email: 'fail-email@example.com' });

      // Still returns 200 with generic message
      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe(genericExpectedMsg);
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    it('successfully resets password, revokes active sessions, and rotates CSRF', async () => {
      const user = await createTestCustomer('reset-user@example.com', 'OldPassword123!');

      // Create an active session and refresh token for this user
      const session = await prisma.session.create({
        data: {
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          refreshTokens: {
            create: {
              familyId: 'family_1',
              tokenHash: 'sample-hash-1',
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          },
        },
      });

      // Issue PASSWORD_RESET token
      const { rawToken } = await securityTokenService.createToken(
        user.id,
        'PASSWORD_RESET',
        60 * 60 * 1000,
      );

      const csrf = getCsrfHeaders();
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          token: rawToken,
          password: 'NewStrongPassword456!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('Password reset successful');
      expect(res.body.data.csrfToken).toBeDefined();

      // Verify token is consumed
      const tokenInDb = await prisma.securityToken.findUnique({
        where: { tokenHash: hashToken(rawToken) },
      });
      expect(tokenInDb?.consumedAt).not.toBeNull();

      // Verify active session was revoked
      const sessionInDb = await prisma.session.findUnique({
        where: { id: session.id },
      });
      expect(sessionInDb?.revokedAt).not.toBeNull();
      expect(sessionInDb?.revokedReason).toBe('PASSWORD_RESET');

      // Verify refresh tokens were revoked
      const refreshTokens = await prisma.refreshToken.findMany({
        where: { sessionId: session.id },
      });
      expect(refreshTokens[0]?.revokedAt).not.toBeNull();

      // Verify cookie handling: auth cookies are cleared, CSRF cookie is set
      const cookies = extractCookies(res);
      const accessCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.ACCESS_TOKEN));
      const refreshCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.REFRESH_TOKEN));
      const csrfCookie = cookies.find((c: string) => c.includes(COOKIE_NAMES.CSRF_TOKEN));

      expect(accessCookie).toContain('Max-Age=0');
      expect(refreshCookie).toContain('Max-Age=0');
      expect(csrfCookie).toBeDefined();
      expect(csrfCookie).not.toContain('Max-Age=0');

      // Verify user can now log in with the new password and old password fails
      const loginOldRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          email: 'reset-user@example.com',
          password: 'OldPassword123!',
        });
      expect(loginOldRes.status).toBe(401);

      const loginNewRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          email: 'reset-user@example.com',
          password: 'NewStrongPassword456!',
        });
      expect(loginNewRes.status).toBe(200);
      expect(loginNewRes.body.success).toBe(true);
    });

    it('rejects reuse of consumed reset token with 400 INVALID_OR_EXPIRED_TOKEN', async () => {
      const user = await createTestCustomer('reuse@example.com');
      const { rawToken } = await securityTokenService.createToken(
        user.id,
        'PASSWORD_RESET',
        60 * 60 * 1000,
      );

      const csrf = getCsrfHeaders();

      // First reset succeeds
      const res1 = await request(app)
        .post('/api/v1/auth/reset-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ token: rawToken, password: 'NewPassword123!' });
      expect(res1.status).toBe(200);

      // Second reset attempt with same token fails
      const res2 = await request(app)
        .post('/api/v1/auth/reset-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ token: rawToken, password: 'AnotherPassword456!' });
      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
    });

    it('rejects expired reset token with 400 INVALID_OR_EXPIRED_TOKEN', async () => {
      const user = await createTestCustomer('expired@example.com');
      const { rawToken } = await securityTokenService.createToken(
        user.id,
        'PASSWORD_RESET',
        -1000, // Expired 1 second ago
      );

      const csrf = getCsrfHeaders();
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ token: rawToken, password: 'NewPassword123!' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
    });

    it('handles concurrent reset attempts on same token: exactly 1 succeeds and others fail', async () => {
      const user = await createTestCustomer('concurrent-reset@example.com');
      const { rawToken } = await securityTokenService.createToken(
        user.id,
        'PASSWORD_RESET',
        60 * 60 * 1000,
      );

      const csrf = getCsrfHeaders();

      // Fire 5 concurrent reset requests with the same token
      const responses = await Promise.all(
        Array.from({ length: 5 }).map((_, i) =>
          request(app)
            .post('/api/v1/auth/reset-password')
            .set('Origin', csrf.Origin)
            .set('Cookie', csrf.Cookie)
            .set('x-csrf-token', csrf['x-csrf-token'])
            .send({ token: rawToken, password: `ConcurPassword${i}!` }),
        ),
      );

      const successful = responses.filter((r) => r.status === 200);
      const failed = responses.filter((r) => r.status === 400);

      expect(successful).toHaveLength(1);
      expect(failed).toHaveLength(4);
      failed.forEach((r) => {
        expect(r.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
      });
    });

    it('invalidates pending security tokens for user when password is reset', async () => {
      const user = await createTestCustomer('invalidate-tokens@example.com');

      // Create an EMAIL_VERIFICATION token
      await securityTokenService.createToken(user.id, 'EMAIL_VERIFICATION', 24 * 60 * 60 * 1000);

      // Create a PASSWORD_RESET token
      const { rawToken } = await securityTokenService.createToken(
        user.id,
        'PASSWORD_RESET',
        60 * 60 * 1000,
      );

      const csrf = getCsrfHeaders();
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ token: rawToken, password: 'BrandNewPassword123!' });

      expect(res.status).toBe(200);

      // Check DB: all security tokens for this user must now be consumed
      const activeTokens = await prisma.securityToken.findMany({
        where: { userId: user.id, consumedAt: null },
      });
      expect(activeTokens).toHaveLength(0);
    });

    it('rolls back database transaction completely when a failure occurs after token consumption', async () => {
      const user = await createTestCustomer('rollback-test@example.com', 'OriginalPassword123!');

      // Create an active session and refresh token
      const session = await prisma.session.create({
        data: {
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          refreshTokens: {
            create: {
              familyId: 'family_rollback',
              tokenHash: 'sample-hash-rollback',
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          },
        },
      });

      // Issue PASSWORD_RESET token
      const { rawToken } = await securityTokenService.createToken(
        user.id,
        'PASSWORD_RESET',
        60 * 60 * 1000,
      );

      // Force an error inside the real PostgreSQL transaction AFTER token consumption (Step 3C),
      // password update (Step 3D), and session revocation (Step 3E) have already executed on the DB.
      const spy = vi
        .spyOn(securityTokenService, 'invalidateAllUserTokens')
        .mockRejectedValueOnce(new Error('Simulated failure during post-reset cleanup'));

      const csrf = getCsrfHeaders();
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          token: rawToken,
          password: 'NewAttemptedPassword456!',
        });

      spy.mockRestore();

      // Transaction aborted due to internal failure
      expect(res.status).toBe(500);

      // 1. Verify reset token remains UNCONSUMED after transaction rollback
      const tokenInDb = await prisma.securityToken.findUnique({
        where: { tokenHash: hashToken(rawToken) },
      });
      expect(tokenInDb).toBeDefined();
      expect(tokenInDb?.consumedAt).toBeNull();

      // 2. Verify original password remains VALID (login with old password succeeds)
      const loginOldRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          email: 'rollback-test@example.com',
          password: 'OriginalPassword123!',
        });
      expect(loginOldRes.status).toBe(200);
      expect(loginOldRes.body.success).toBe(true);

      // 3. Verify new password is NOT valid (login with new password fails)
      const loginNewRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          email: 'rollback-test@example.com',
          password: 'NewAttemptedPassword456!',
        });
      expect(loginNewRes.status).toBe(401);

      // 4. Verify existing session remains UNREVOKED
      const sessionInDb = await prisma.session.findUnique({
        where: { id: session.id },
      });
      expect(sessionInDb?.revokedAt).toBeNull();
      expect(sessionInDb?.revokedReason).toBeNull();

      // 5. Verify existing refresh tokens remain UNREVOKED
      const refreshTokensInDb = await prisma.refreshToken.findMany({
        where: { sessionId: session.id },
      });
      expect(refreshTokensInDb).toHaveLength(1);
      expect(refreshTokensInDb[0]?.revokedAt).toBeNull();
    });
  });
});
