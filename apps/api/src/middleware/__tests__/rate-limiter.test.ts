import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loginTargetedLimiter,
  forgotPasswordTargetedLimiter,
  resendVerificationTargetedLimiter,
  verifyEmailIpLimiter,
  resendVerificationIpLimiter,
  globalApiLimiter,
  paymentCallbackLimiter,
  reviewSubmissionLimiter,
  setRateLimitingEnabledForTesting,
} from '../rate-limiter.js';
import { errorHandler } from '../error-handler.js';
import type { AuthenticatedUser } from '../../types/express.js';

describe('Rate Limiter Middleware', () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());

  app.post('/test-login', loginTargetedLimiter, (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/test-forgot-password-targeted', forgotPasswordTargetedLimiter, (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/test-verify-email-ip', verifyEmailIpLimiter, (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/test-resend-verification-ip', resendVerificationIpLimiter, (_req, res) => {
    res.json({ ok: true });
  });

  app.post(
    '/test-resend-targeted',
    (req, _res, next) => {
      const authHeader = req.headers['x-test-auth-user'];
      if (typeof authHeader === 'string') {
        req.user = {
          id: 'user-123',
          email: authHeader,
          role: 'CUSTOMER',
          profile: null,
          sessionId: 'session-123',
          emailVerified: false,
          hasPassword: true,
          reauthenticatedAt: new Date(),
        } satisfies AuthenticatedUser;
      }
      next();
    },
    resendVerificationTargetedLimiter,
    (_req, res) => {
      res.json({ ok: true });
    },
  );

  app.get('/test-global', globalApiLimiter, (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/test-payment-callback', paymentCallbackLimiter, (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/test-review', reviewSubmissionLimiter, (_req, res) => {
    res.json({ ok: true });
  });

  app.use(errorHandler);

  beforeEach(() => {
    setRateLimitingEnabledForTesting(true);
  });

  afterEach(() => {
    setRateLimitingEnabledForTesting(false);
  });

  it('allows requests within limit and rejects after 5 attempts for the same IP and email', async () => {
    const payload = { email: 'rate.limit.test@example.com' };

    for (let i = 1; i <= 5; i++) {
      const res = await request(app).post('/test-login').send(payload);
      expect(res.status).toBe(200);
    }

    const blockedRes = await request(app).post('/test-login').send(payload);
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('never bypasses rate limits based on client-supplied x-test-rate-limit or arbitrary headers (Clarification 2)', async () => {
    const payload = { email: 'header-bypass-check@example.com' };

    for (let i = 1; i <= 5; i++) {
      const res = await request(app)
        .post('/test-login')
        .set('x-test-rate-limit', 'false')
        .send(payload);
      expect(res.status).toBe(200);
    }

    // 6th attempt with bypass header attempt is still strictly blocked
    const blocked = await request(app)
      .post('/test-login')
      .set('x-test-rate-limit', 'false')
      .set('x-bypass-rate-limit', 'true')
      .send(payload);

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('bypasses rate limiting in test environment when programmatic testing flag is disabled', async () => {
    setRateLimitingEnabledForTesting(false);

    for (let i = 0; i < 7; i++) {
      const res = await request(app)
        .post('/test-forgot-password-targeted')
        .send({ email: 'bypass.test@example.com' });
      expect(res.status).toBe(200);
    }
  });

  describe('forgotPasswordTargetedLimiter', () => {
    it('blocks fourth attempt for same IP and normalized email with HTTP 429, normalizing case and whitespace', async () => {
      const res1 = await request(app)
        .post('/test-forgot-password-targeted')
        .send({ email: 'target.reset@example.com' });
      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .post('/test-forgot-password-targeted')
        .send({ email: '  TARGET.RESET@EXAMPLE.COM  ' });
      expect(res2.status).toBe(200);

      const res3 = await request(app)
        .post('/test-forgot-password-targeted')
        .send({ email: 'Target.Reset@Example.Com' });
      expect(res3.status).toBe(200);

      const res4 = await request(app)
        .post('/test-forgot-password-targeted')
        .send({ email: 'target.reset@example.com' });
      expect(res4.status).toBe(429);
      expect(res4.body.success).toBe(false);
      expect(res4.body.error.code).toBe('TOO_MANY_REQUESTS');
      expect(res4.body.error.message).toContain('Too many password reset requests for this email');
    });

    it('maintains independent rate-limit buckets for different normalized emails from the same IP', async () => {
      const res = await request(app)
        .post('/test-forgot-password-targeted')
        .send({ email: 'independent.email@example.com' });
      expect(res.status).toBe(200);
    });

    it('maintains independent rate-limit buckets for the same email from a different IP', async () => {
      const res = await request(app)
        .post('/test-forgot-password-targeted')
        .set('X-Forwarded-For', '198.51.100.77')
        .send({ email: 'target.reset@example.com' });
      expect(res.status).toBe(200);
    });
  });

  describe('resendVerificationTargetedLimiter', () => {
    it('authenticated user: rate limits by req.user.email and ignores varying body email', async () => {
      const authEmail = 'auth.target@example.com';

      for (let i = 1; i <= 3; i++) {
        const res = await request(app)
          .post('/test-resend-targeted')
          .set('x-test-auth-user', authEmail)
          .send({ email: `different_${i}@example.com` });
        expect(res.status).toBe(200);
      }

      const res4 = await request(app)
        .post('/test-resend-targeted')
        .set('x-test-auth-user', authEmail)
        .send({ email: 'yet_another@example.com' });

      expect(res4.status).toBe(429);
      expect(res4.body.error.code).toBe('TOO_MANY_REQUESTS');
      expect(res4.body.error.message).toContain('Too many verification email requests');
    });

    it('unauthenticated user: rate limits by normalized body email', async () => {
      const email = 'unauth.target@example.com';

      for (let i = 1; i <= 3; i++) {
        const res = await request(app)
          .post('/test-resend-targeted')
          .send({ email: `  ${email.toUpperCase()}  ` });
        expect(res.status).toBe(200);
      }

      const res4 = await request(app).post('/test-resend-targeted').send({ email });

      expect(res4.status).toBe(429);
      expect(res4.body.error.code).toBe('TOO_MANY_REQUESTS');
    });
  });

  describe('paymentCallbackLimiter', () => {
    it('allows callback requests up to limit and rejects exceeding requests with 429', async () => {
      // 60 requests allowed per 15m
      for (let i = 1; i <= 60; i++) {
        const res = await request(app)
          .post('/test-payment-callback')
          .set('X-Forwarded-For', '203.0.113.10')
          .send({ tran_id: `TXN-${i}` });
        expect(res.status).toBe(200);
      }

      const blocked = await request(app)
        .post('/test-payment-callback')
        .set('X-Forwarded-For', '203.0.113.10')
        .send({ tran_id: 'TXN-61' });

      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
    });
  });
});
