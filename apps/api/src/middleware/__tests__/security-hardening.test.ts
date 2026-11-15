import request from 'supertest';
import { describe, it, expect } from 'vitest';
import app from '../../app.js';

describe('API Security Hardening Middleware', () => {
  it('sets standard defensive HTTP security headers on all responses', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('suppresses X-Powered-By header to avoid leaking server fingerprint', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects oversized JSON request payloads exceeding 1MB limit with HTTP 413', async () => {
    // Generate a payload exceeding 1MB
    const largeString = 'a'.repeat(1024 * 1024 + 100);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'test@example.com', password: largeString }));

    expect(res.status).toBe(413);
  });
});
