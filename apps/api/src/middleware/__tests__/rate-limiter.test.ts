import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { loginTargetedLimiter } from '../rate-limiter.js';
import { errorHandler } from '../error-handler.js';

describe('Rate Limiter Middleware', () => {
  const app = express();
  app.use(express.json());

  app.post('/test-login', loginTargetedLimiter, (_req, res) => {
    res.json({ ok: true });
  });

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
});
