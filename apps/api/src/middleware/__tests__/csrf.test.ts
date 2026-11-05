import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { csrfProtection, generateCsrfToken } from '../csrf.js';
import { errorHandler } from '../error-handler.js';
import { COOKIE_NAMES } from '../../lib/cookies.js';
import { env } from '../../config/env.js';

describe('CSRF Protection Middleware', () => {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());

  app.get('/test-safe', csrfProtection, (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/test-protected', csrfProtection, (_req, res) => {
    res.json({ success: true });
  });

  app.use(errorHandler);

  it('allows safe methods (GET) without CSRF token or origin', async () => {
    const res = await request(app).get('/test-safe');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects POST request when Origin is missing or mismatched', async () => {
    const token = generateCsrfToken();

    const res = await request(app)
      .post('/test-protected')
      .set('Origin', 'http://malicious-site.com')
      .set('Cookie', `${COOKIE_NAMES.CSRF_TOKEN}=${token}`)
      .set('x-csrf-token', token);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_ORIGIN_INVALID');
  });

  it('rejects POST request when CSRF cookie is missing', async () => {
    const token = generateCsrfToken();

    const res = await request(app)
      .post('/test-protected')
      .set('Origin', env.FRONTEND_URL)
      .set('x-csrf-token', token);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_TOKEN_MISSING');
  });

  it('rejects POST request when x-csrf-token header is missing', async () => {
    const token = generateCsrfToken();

    const res = await request(app)
      .post('/test-protected')
      .set('Origin', env.FRONTEND_URL)
      .set('Cookie', `${COOKIE_NAMES.CSRF_TOKEN}=${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_TOKEN_MISSING');
  });

  it('rejects POST request with malformed token (not 3 dot-separated parts)', async () => {
    const malformed = 'not-a-valid-csrf-token';

    const res = await request(app)
      .post('/test-protected')
      .set('Origin', env.FRONTEND_URL)
      .set('Cookie', `${COOKIE_NAMES.CSRF_TOKEN}=${malformed}`)
      .set('x-csrf-token', malformed);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_TOKEN_MALFORMED');
  });

  it('rejects POST request when cookie and header tokens do not match', async () => {
    const token1 = generateCsrfToken();
    const token2 = generateCsrfToken();

    const res = await request(app)
      .post('/test-protected')
      .set('Origin', env.FRONTEND_URL)
      .set('Cookie', `${COOKIE_NAMES.CSRF_TOKEN}=${token1}`)
      .set('x-csrf-token', token2);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_TOKEN_MISMATCH');
  });

  it('rejects POST request with timestamp far in the future (> 60s)', async () => {
    const nonce = crypto.randomBytes(16).toString('hex');
    const futureTimestamp = (Date.now() + 120000).toString(); // 2 minutes in the future
    const signature = crypto
      .createHmac('sha256', env.CSRF_SECRET)
      .update(`${nonce}.${futureTimestamp}`)
      .digest('hex');
    const futureToken = `${nonce}.${futureTimestamp}.${signature}`;

    const res = await request(app)
      .post('/test-protected')
      .set('Origin', env.FRONTEND_URL)
      .set('Cookie', `${COOKIE_NAMES.CSRF_TOKEN}=${futureToken}`)
      .set('x-csrf-token', futureToken);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_TOKEN_FUTURE');
  });

  it('rejects POST request with expired timestamp (> 24h)', async () => {
    const nonce = crypto.randomBytes(16).toString('hex');
    const oldTimestamp = (Date.now() - 25 * 60 * 60 * 1000).toString(); // 25 hours ago
    const signature = crypto
      .createHmac('sha256', env.CSRF_SECRET)
      .update(`${nonce}.${oldTimestamp}`)
      .digest('hex');
    const expiredToken = `${nonce}.${oldTimestamp}.${signature}`;

    const res = await request(app)
      .post('/test-protected')
      .set('Origin', env.FRONTEND_URL)
      .set('Cookie', `${COOKIE_NAMES.CSRF_TOKEN}=${expiredToken}`)
      .set('x-csrf-token', expiredToken);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_TOKEN_EXPIRED');
  });

  it('rejects POST request with forged signature', async () => {
    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now().toString();
    const forgedSignature = crypto.randomBytes(32).toString('hex'); // 64 hex chars of fake signature
    const forgedToken = `${nonce}.${timestamp}.${forgedSignature}`;

    const res = await request(app)
      .post('/test-protected')
      .set('Origin', env.FRONTEND_URL)
      .set('Cookie', `${COOKIE_NAMES.CSRF_TOKEN}=${forgedToken}`)
      .set('x-csrf-token', forgedToken);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_SIGNATURE_INVALID');
  });

  it('successfully authorizes POST request with valid Origin, cookie, and header', async () => {
    const validToken = generateCsrfToken();

    const res = await request(app)
      .post('/test-protected')
      .set('Origin', env.FRONTEND_URL)
      .set('Cookie', `${COOKIE_NAMES.CSRF_TOKEN}=${validToken}`)
      .set('x-csrf-token', validToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
