import request from 'supertest';
import * as jose from 'jose';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import {
  hashPassword,
  generateOAuthState,
  generatePkce,
  encryptGcm,
  signAccessToken,
} from '../../../lib/crypto.js';
import { env } from '../../../config/env.js';
import { cleanDatabase, testPool, extractCookies } from '../../../test/setup.js';
import { googleOAuthService } from '../google-oauth.service.js';

describe('OAuth LINK Callback Integration Tests (Phase 3E-2)', () => {
  let keyPair: jose.GenerateKeyPairResult;
  let publicJwk: jose.JWK;
  let currentMockIdToken: string | null = null;

  beforeAll(async () => {
    keyPair = await jose.generateKeyPair('RS256');
    const exported = await jose.exportJWK(keyPair.publicKey);
    publicJwk = {
      ...exported,
      kid: 'test-google-key-id',
      alg: 'RS256',
      use: 'sig',
    };
  });

  beforeEach(async () => {
    await cleanDatabase();

    const localJwks = jose.createLocalJWKSet({ keys: [publicJwk] });
    googleOAuthService.setCustomJwks(localJwks);

    currentMockIdToken = null;
    googleOAuthService.setCustomCodeExchanger(async () => {
      if (!currentMockIdToken) {
        throw new Error('currentMockIdToken not configured in test');
      }
      return { idToken: currentMockIdToken, accessToken: 'test-access-token' };
    });
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

  function parseCookieValue(cookies: string[], cookieName: string): string | null {
    for (const cookie of cookies) {
      if (cookie.startsWith(`${cookieName}=`)) {
        return cookie.split(';')[0]!.split('=')[1] ?? null;
      }
    }
    return null;
  }

  async function issueGoogleIdToken(params: {
    sub: string;
    email: string;
    nonce: string;
    email_verified?: boolean;
    name?: string;
  }): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new jose.SignJWT({
      sub: params.sub,
      email: params.email,
      email_verified: params.email_verified ?? true,
      name: params.name ?? 'Test User',
      nonce: params.nonce,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-google-key-id' })
      .setIssuer('https://accounts.google.com')
      .setAudience(env.GOOGLE_CLIENT_ID)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(keyPair.privateKey);
  }

  async function setupUserAndSession(email = 'user@example.com', password = 'ValidPassword123!') {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        reauthenticatedAt: new Date(),
        ipAddress: '127.0.0.1',
      },
    });

    const accessToken = await signAccessToken({
      sub: user.id,
      sid: session.id,
    });

    return { user, session, accessToken };
  }

  async function createLinkTransaction(userId: string, sessionId: string) {
    const { rawState, statePrefix, hmac: cookieHmac, stateHash } = generateOAuthState();
    const nonce = 'test-nonce-1234567890';
    const { codeVerifier } = generatePkce();

    const encrypted = encryptGcm(codeVerifier, env.OAUTH_ENCRYPTION_SECRET);

    const tx = await prisma.oAuthTransaction.create({
      data: {
        stateHash,
        statePrefix,
        nonce,
        action: 'LINK',
        userId,
        sessionId,
        returnUrl: '/account/security',
        encryptedCodeVerifier: encrypted.ciphertext,
        codeVerifierIv: encrypted.iv,
        codeVerifierTag: encrypted.tag,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    return { rawState, statePrefix, cookieHmac, nonce, tx };
  }

  it('successfully links Google account under row lock and preserves existing auth cookies', async () => {
    const { user, session, accessToken } = await setupUserAndSession('linkuser@example.com');
    const { rawState, statePrefix, cookieHmac, nonce } = await createLinkTransaction(
      user.id,
      session.id,
    );

    currentMockIdToken = await issueGoogleIdToken({
      sub: 'google-sub-link-1',
      email: 'linkuser@example.com',
      nonce,
    });

    const csrf = getCsrfHeaders();
    const res = await request(app)
      .post('/api/v1/auth/oauth/google/callback')
      .set('Origin', csrf.Origin)
      .set(
        'Cookie',
        `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}; dd_oauth_${statePrefix}=${cookieHmac}`,
      )
      .set('x-csrf-token', csrf['x-csrf-token'])
      .send({ code: 'valid-google-code', state: rawState });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('LINKED');
    expect(res.body.data.returnUrl).toBe('/account/security');

    // Confirm NO new authentication cookies were set (existing session preserved)
    const cookies = extractCookies(res);
    expect(parseCookieValue(cookies, COOKIE_NAMES.ACCESS_TOKEN)).toBeNull();
    expect(parseCookieValue(cookies, COOKIE_NAMES.REFRESH_TOKEN)).toBeNull();

    // Verify OAuthAccount row was created
    const linked = await prisma.oAuthAccount.findUnique({
      where: {
        unique_provider_account: {
          provider: 'GOOGLE',
          providerAccountId: 'google-sub-link-1',
        },
      },
    });
    expect(linked).not.toBeNull();
    expect(linked?.userId).toBe(user.id);
  });

  it('rejects with 403 OAUTH_LINK_IDENTITY_MISMATCH when a different session tries to complete callback', async () => {
    const { user: userA, session: sessionA } = await setupUserAndSession('userA@example.com');
    const { accessToken: accessTokenB } = await setupUserAndSession('userB@example.com');
    const { rawState, statePrefix, cookieHmac, nonce } = await createLinkTransaction(
      userA.id,
      sessionA.id,
    );

    currentMockIdToken = await issueGoogleIdToken({
      sub: 'google-sub-link-diff-session',
      email: 'userA@example.com',
      nonce,
    });

    const csrf = getCsrfHeaders();
    // Session B attempts to complete Session A's LINK transaction
    const res = await request(app)
      .post('/api/v1/auth/oauth/google/callback')
      .set('Origin', csrf.Origin)
      .set(
        'Cookie',
        `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessTokenB}; dd_oauth_${statePrefix}=${cookieHmac}`,
      )
      .set('x-csrf-token', csrf['x-csrf-token'])
      .send({ code: 'valid-code', state: rawState });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('OAUTH_LINK_IDENTITY_MISMATCH');
  });

  it('rejects with 401 AUTHENTICATION_REQUIRED when caller token is missing', async () => {
    const { user, session } = await setupUserAndSession('notoken@example.com');
    const { rawState, statePrefix, cookieHmac, nonce } = await createLinkTransaction(
      user.id,
      session.id,
    );

    currentMockIdToken = await issueGoogleIdToken({
      sub: 'google-sub-no-token',
      email: 'notoken@example.com',
      nonce,
    });

    const csrf = getCsrfHeaders();
    const res = await request(app)
      .post('/api/v1/auth/oauth/google/callback')
      .set('Origin', csrf.Origin)
      .set('Cookie', `${csrf.Cookie}; dd_oauth_${statePrefix}=${cookieHmac}`)
      .set('x-csrf-token', csrf['x-csrf-token'])
      .send({ code: 'valid-code', state: rawState });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('rejects with 403 REAUTHENTICATION_REQUIRED when recent-authentication expired during round-trip', async () => {
    const { user, session, accessToken } = await setupUserAndSession('expirefresh@example.com');
    const { rawState, statePrefix, cookieHmac, nonce } = await createLinkTransaction(
      user.id,
      session.id,
    );

    // Age the session's reauthenticatedAt to 16 minutes ago
    await prisma.session.update({
      where: { id: session.id },
      data: { reauthenticatedAt: new Date(Date.now() - 16 * 60 * 1000) },
    });

    currentMockIdToken = await issueGoogleIdToken({
      sub: 'google-sub-expired-freshness',
      email: 'expirefresh@example.com',
      nonce,
    });

    const csrf = getCsrfHeaders();
    const res = await request(app)
      .post('/api/v1/auth/oauth/google/callback')
      .set('Origin', csrf.Origin)
      .set(
        'Cookie',
        `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}; dd_oauth_${statePrefix}=${cookieHmac}`,
      )
      .set('x-csrf-token', csrf['x-csrf-token'])
      .send({ code: 'valid-code', state: rawState });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('REAUTHENTICATION_REQUIRED');
  });

  it('rejects with 400 EMAIL_MISMATCH when Google account email does not match user email', async () => {
    const { user, session, accessToken } = await setupUserAndSession('mismatch@example.com');
    const { rawState, statePrefix, cookieHmac, nonce } = await createLinkTransaction(
      user.id,
      session.id,
    );

    currentMockIdToken = await issueGoogleIdToken({
      sub: 'google-sub-mismatch',
      email: 'different-email@example.com',
      nonce,
    });

    const csrf = getCsrfHeaders();
    const res = await request(app)
      .post('/api/v1/auth/oauth/google/callback')
      .set('Origin', csrf.Origin)
      .set(
        'Cookie',
        `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}; dd_oauth_${statePrefix}=${cookieHmac}`,
      )
      .set('x-csrf-token', csrf['x-csrf-token'])
      .send({ code: 'valid-code', state: rawState });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMAIL_MISMATCH');
  });

  it('rejects with 409 OAUTH_ALREADY_LINKED when user is already linked to Google', async () => {
    const { user, session, accessToken } = await setupUserAndSession('already@example.com');

    await prisma.oAuthAccount.create({
      data: {
        userId: user.id,
        provider: 'GOOGLE',
        providerAccountId: 'existing-sub-1234',
      },
    });

    const { rawState, statePrefix, cookieHmac, nonce } = await createLinkTransaction(
      user.id,
      session.id,
    );

    currentMockIdToken = await issueGoogleIdToken({
      sub: 'new-google-sub-5678',
      email: 'already@example.com',
      nonce,
    });

    const csrf = getCsrfHeaders();
    const res = await request(app)
      .post('/api/v1/auth/oauth/google/callback')
      .set('Origin', csrf.Origin)
      .set(
        'Cookie',
        `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}; dd_oauth_${statePrefix}=${cookieHmac}`,
      )
      .set('x-csrf-token', csrf['x-csrf-token'])
      .send({ code: 'valid-code', state: rawState });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OAUTH_ALREADY_LINKED');
  });

  it('rejects with 409 OAUTH_PROVIDER_IDENTITY_CONFLICT when Google sub is already linked to another user', async () => {
    const { user: userOther } = await setupUserAndSession('other@example.com');
    await prisma.oAuthAccount.create({
      data: {
        userId: userOther.id,
        provider: 'GOOGLE',
        providerAccountId: 'conflict-sub-999',
      },
    });

    const { user, session, accessToken } = await setupUserAndSession('conflict@example.com');
    const { rawState, statePrefix, cookieHmac, nonce } = await createLinkTransaction(
      user.id,
      session.id,
    );

    currentMockIdToken = await issueGoogleIdToken({
      sub: 'conflict-sub-999',
      email: 'conflict@example.com',
      nonce,
    });

    const csrf = getCsrfHeaders();
    const res = await request(app)
      .post('/api/v1/auth/oauth/google/callback')
      .set('Origin', csrf.Origin)
      .set(
        'Cookie',
        `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}; dd_oauth_${statePrefix}=${cookieHmac}`,
      )
      .set('x-csrf-token', csrf['x-csrf-token'])
      .send({ code: 'valid-code', state: rawState });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OAUTH_PROVIDER_IDENTITY_CONFLICT');
  });

  it('rejects with 401 SESSION_REVOKED_OR_EXPIRED when session was revoked during round-trip', async () => {
    const { user, session, accessToken } = await setupUserAndSession('revokedlink@example.com');
    const { rawState, statePrefix, cookieHmac, nonce } = await createLinkTransaction(
      user.id,
      session.id,
    );

    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    currentMockIdToken = await issueGoogleIdToken({
      sub: 'google-sub-revoked-link',
      email: 'revokedlink@example.com',
      nonce,
    });

    const csrf = getCsrfHeaders();
    const res = await request(app)
      .post('/api/v1/auth/oauth/google/callback')
      .set('Origin', csrf.Origin)
      .set(
        'Cookie',
        `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}; dd_oauth_${statePrefix}=${cookieHmac}`,
      )
      .set('x-csrf-token', csrf['x-csrf-token'])
      .send({ code: 'valid-code', state: rawState });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_REVOKED_OR_EXPIRED');
  });
});
