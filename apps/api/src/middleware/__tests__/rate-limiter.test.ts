import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import {
  loginTargetedLimiter,
  forgotPasswordTargetedLimiter,
  resendVerificationTargetedLimiter,
  verifyEmailIpLimiter,
  resendVerificationIpLimiter,
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
      // Simulate optionalAuthenticate populating req.user if header present
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

  app.use(errorHandler);

  it('allows requests within limit and rejects after 5 attempts for the same IP and email', async () => {
    const payload = { email: 'rate.limit.test@example.com' };

    // Requests 1 through 5 succeed
    for (let i = 1; i <= 5; i++) {
      const res = await request(app)
        .post('/test-login')
        .set('x-test-rate-limit', 'true')
        .send(payload);
      expect(res.status).toBe(200);
    }

    // 6th request is rate-limited with HTTP 429
    const blockedRes = await request(app)
      .post('/test-login')
      .set('x-test-rate-limit', 'true')
      .send(payload);
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  describe('forgotPasswordTargetedLimiter', () => {
    it('blocks fourth attempt for same IP and normalized email with HTTP 429, normalizing case and whitespace', async () => {
      // 1st attempt: standard lowercase
      const res1 = await request(app)
        .post('/test-forgot-password-targeted')
        .set('x-test-rate-limit', 'true')
        .send({ email: 'target.reset@example.com' });
      expect(res1.status).toBe(200);

      // 2nd attempt: uppercase with surrounding whitespace
      const res2 = await request(app)
        .post('/test-forgot-password-targeted')
        .set('x-test-rate-limit', 'true')
        .send({ email: '  TARGET.RESET@EXAMPLE.COM  ' });
      expect(res2.status).toBe(200);

      // 3rd attempt: mixed case
      const res3 = await request(app)
        .post('/test-forgot-password-targeted')
        .set('x-test-rate-limit', 'true')
        .send({ email: 'Target.Reset@Example.Com' });
      expect(res3.status).toBe(200);

      // 4th attempt: should be blocked by targeted limiter (limit is 3 per 15 min)
      const res4 = await request(app)
        .post('/test-forgot-password-targeted')
        .set('x-test-rate-limit', 'true')
        .send({ email: 'target.reset@example.com' });
      expect(res4.status).toBe(429);
      expect(res4.body.success).toBe(false);
      expect(res4.body.error.code).toBe('TOO_MANY_REQUESTS');
      expect(res4.body.error.message).toContain('Too many password reset requests for this email');
    });

    it('maintains independent rate-limit buckets for different normalized emails from the same IP', async () => {
      // Different email should not be affected by the blocked email above
      const res = await request(app)
        .post('/test-forgot-password-targeted')
        .set('x-test-rate-limit', 'true')
        .send({ email: 'independent.email@example.com' });
      expect(res.status).toBe(200);
    });

    it('maintains independent rate-limit buckets for the same email from a different IP', async () => {
      // Same email as the blocked one, but arriving from a distinct IP address
      const res = await request(app)
        .post('/test-forgot-password-targeted')
        .set('x-test-rate-limit', 'true')
        .set('X-Forwarded-For', '198.51.100.77')
        .send({ email: 'target.reset@example.com' });
      expect(res.status).toBe(200);
    });

    it('bypasses rate limiting in test environment when x-test-rate-limit header is omitted', async () => {
      // 5 consecutive requests without x-test-rate-limit succeed even though limit is 3
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/test-forgot-password-targeted')
          .send({ email: 'bypass.test@example.com' });
        expect(res.status).toBe(200);
      }
    });
  });

  describe('resendVerificationTargetedLimiter', () => {
    it('authenticated user: rate limits by req.user.email and ignores varying body email', async () => {
      const authEmail = 'auth.target@example.com';

      // 3 attempts succeed (limit is 3 per 15 min)
      for (let i = 1; i <= 3; i++) {
        const res = await request(app)
          .post('/test-resend-targeted')
          .set('x-test-rate-limit', 'true')
          .set('x-test-auth-user', authEmail)
          .send({ email: `different_${i}@example.com` }); // Body email variation must be ignored
        expect(res.status).toBe(200);
      }

      // 4th attempt is blocked under authEmail key even with yet another body email
      const res4 = await request(app)
        .post('/test-resend-targeted')
        .set('x-test-rate-limit', 'true')
        .set('x-test-auth-user', authEmail)
        .send({ email: 'yet_another@example.com' });

      expect(res4.status).toBe(429);
      expect(res4.body.error.code).toBe('TOO_MANY_REQUESTS');
      expect(res4.body.error.message).toContain('Too many verification email requests');
    });

    it('unauthenticated user: rate limits by normalized body email', async () => {
      const email = 'unauth.target@example.com';

      // 3 attempts succeed
      for (let i = 1; i <= 3; i++) {
        const res = await request(app)
          .post('/test-resend-targeted')
          .set('x-test-rate-limit', 'true')
          .send({ email: `  ${email.toUpperCase()}  ` });
        expect(res.status).toBe(200);
      }

      // 4th attempt is blocked
      const res4 = await request(app)
        .post('/test-resend-targeted')
        .set('x-test-rate-limit', 'true')
        .send({ email });

      expect(res4.status).toBe(429);
      expect(res4.body.error.code).toBe('TOO_MANY_REQUESTS');
    });
  });

  describe('verifyEmailIpLimiter', () => {
    it('allows 10 attempts per IP within 15 minutes and rejects the 11th with 429', async () => {
      // 10 attempts succeed
      for (let i = 1; i <= 10; i++) {
        const res = await request(app)
          .post('/test-verify-email-ip')
          .set('x-test-rate-limit', 'true')
          .send({});
        expect(res.status).toBe(200);
      }

      // 11th attempt is rejected
      const res11 = await request(app)
        .post('/test-verify-email-ip')
        .set('x-test-rate-limit', 'true')
        .send({});

      expect(res11.status).toBe(429);
      expect(res11.body.error.code).toBe('TOO_MANY_REQUESTS');
      expect(res11.body.error.message).toContain('Too many email verification attempts');
    });
  });

  describe('resendVerificationIpLimiter', () => {
    it('allows 10 attempts per IP within 15 minutes and rejects the 11th with 429', async () => {
      // 10 attempts succeed
      for (let i = 1; i <= 10; i++) {
        const res = await request(app)
          .post('/test-resend-verification-ip')
          .set('x-test-rate-limit', 'true')
          .send({});
        expect(res.status).toBe(200);
      }

      // 11th attempt is rejected
      const res11 = await request(app)
        .post('/test-resend-verification-ip')
        .set('x-test-rate-limit', 'true')
        .send({});

      expect(res11.status).toBe(429);
      expect(res11.body.error.code).toBe('TOO_MANY_REQUESTS');
      expect(res11.body.error.message).toContain('Too many verification email requests');
    });
  });
});
