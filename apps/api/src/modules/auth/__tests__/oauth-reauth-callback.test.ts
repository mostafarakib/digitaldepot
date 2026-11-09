import request from 'supertest';
import * as jose from 'jose';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import {
  generateOAuthState,
  generatePkce,
  encryptGcm,
  signAccessToken,
} from '../../../lib/crypto.js';
import { env } from '../../../config/env.js';
import { cleanDatabase, testPool, extractCookies } from '../../../test/setup.js';
import { googleOAuthService } from '../google-oauth.service.js';

describe('OAuth REAUTH Callback Integration Tests (Phase 3E-2)', () => {
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

  async function setupOAuthUserAndSession(
    email = 'reauthuser@example.com',
    googleSub = 'google-sub-reauth-1',
  ) {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: null,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    const oAuthAccount = await prisma.oAuthAccount.create({
      data: {
        userId: user.id,
        provider: 'GOOGLE',
        providerAccountId: googleSub,
      },
    });

    // Create session aged 30 minutes ago (stale)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        reauthenticatedAt: thirtyMinutesAgo,
        ipAddress: '127.0.0.1',
      },
    });

    const accessToken = await signAccessToken({
      sub: user.id,
      sid: session.id,
    });

    return { user, session, oAuthAccount, accessToken, thirtyMinutesAgo };
  }

  async function createReauthTransaction(userId: string, sessionId: string) {
    const { rawState, statePrefix, hmac: cookieHmac, stateHash } = generateOAuthState();
    const nonce = 'test-nonce-reauth-987';
    const { codeVerifier } = generatePkce();

    const encrypted = encryptGcm(codeVerifier, env.OAUTH_ENCRYPTION_SECRET);

    const tx = await prisma.oAuthTransaction.create({
      data: {
        stateHash,
        statePrefix,
        nonce,
        action: 'REAUTH',
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

  describe('POST /api/v1/auth/oauth/google/reauth (Initiation)', () => {
    it('allows stale session to initiate re-authentication without requireRecentAuth restriction', async () => {
      const { session, accessToken } = await setupOAuthUserAndSession();
      const csrf = getCsrfHeaders();

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/reauth')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ returnUrl: '/account/security' });

      // Default redirect
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('accounts.google.com');

      const cookies = extractCookies(res);
      const stateCookie = cookies.find((c: string) => c.startsWith('dd_oauth_'));
      expect(stateCookie).toBeDefined();

      // Check transaction created with action REAUTH and sessionId bound
      const tx = await prisma.oAuthTransaction.findFirst({
        where: { sessionId: session.id, action: 'REAUTH' },
      });
      expect(tx).not.toBeNull();
      expect(tx?.returnUrl).toBe('/account/security');
    });

    it('returns JSON when format=json query parameter or Accept application/json is provided', async () => {
      const { accessToken } = await setupOAuthUserAndSession();
      const csrf = getCsrfHeaders();

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/reauth?format=json')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.authUrl).toContain('accounts.google.com');
    });

    it('rejects unauthenticated requests with 401', async () => {
      const csrf = getCsrfHeaders();
      const res = await request(app)
        .post('/api/v1/auth/oauth/google/reauth')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({});

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/oauth/google/callback (REAUTH)', () => {
    it('successfully re-authenticates session, updates reauthenticatedAt, and leaves OAuthAccount records intact', async () => {
      const { user, session, accessToken, thirtyMinutesAgo } = await setupOAuthUserAndSession(
        'reauthok@example.com',
        'google-sub-ok',
      );
      const { rawState, statePrefix, cookieHmac, nonce } = await createReauthTransaction(
        user.id,
        session.id,
      );

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-ok',
        email: 'reauthok@example.com',
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
      expect(res.body.data.status).toBe('REAUTHENTICATED');
      expect(res.body.data.returnUrl).toBe('/account/security');

      // Check session.reauthenticatedAt is updated to now (> thirtyMinutesAgo)
      const updatedSession = await prisma.session.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(updatedSession.reauthenticatedAt).not.toBeNull();
      expect(new Date(updatedSession.reauthenticatedAt!).getTime()).toBeGreaterThan(
        thirtyMinutesAgo.getTime() + 20 * 60 * 1000,
      );

      // Verify no cookies were set or rotated
      const cookies = extractCookies(res);
      expect(parseCookieValue(cookies, COOKIE_NAMES.ACCESS_TOKEN)).toBeNull();
      expect(parseCookieValue(cookies, COOKIE_NAMES.REFRESH_TOKEN)).toBeNull();

      // Verify OAuthAccount count for this user is unchanged (exactly 1)
      const accounts = await prisma.oAuthAccount.findMany({
        where: { userId: user.id },
      });
      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.providerAccountId).toBe('google-sub-ok');
    });

    it('rejects with 403 OAUTH_REAUTH_IDENTITY_MISMATCH when Google sub does not match linked identity', async () => {
      const { user, session, accessToken } = await setupOAuthUserAndSession(
        'wrongsub@example.com',
        'google-sub-correct',
      );
      const { rawState, statePrefix, cookieHmac, nonce } = await createReauthTransaction(
        user.id,
        session.id,
      );

      // Google returns different sub
      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-attacker-sub',
        email: 'wrongsub@example.com',
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

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('OAUTH_REAUTH_IDENTITY_MISMATCH');
    });

    it('rejects with 403 OAUTH_REAUTH_IDENTITY_MISMATCH when caller session does not match transaction session', async () => {
      const { user, session } = await setupOAuthUserAndSession(
        'sessionmismatch@example.com',
        'google-sub-mismatch',
      );
      const { accessToken: otherAccessToken } = await setupOAuthUserAndSession(
        'other@example.com',
        'google-sub-other',
      );

      const { rawState, statePrefix, cookieHmac, nonce } = await createReauthTransaction(
        user.id,
        session.id,
      );

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-mismatch',
        email: 'sessionmismatch@example.com',
        nonce,
      });

      const csrf = getCsrfHeaders();
      // Other session attempts to complete this transaction
      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Origin', csrf.Origin)
        .set(
          'Cookie',
          `${csrf.Cookie}; ${COOKIE_NAMES.ACCESS_TOKEN}=${otherAccessToken}; dd_oauth_${statePrefix}=${cookieHmac}`,
        )
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({ code: 'valid-google-code', state: rawState });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('OAUTH_REAUTH_IDENTITY_MISMATCH');
    });

    it('rejects with 401 SESSION_REVOKED_OR_EXPIRED when session was revoked before callback completed', async () => {
      const { user, session, accessToken } = await setupOAuthUserAndSession(
        'revokedreauth@example.com',
        'google-sub-revoked-reauth',
      );
      const { rawState, statePrefix, cookieHmac, nonce } = await createReauthTransaction(
        user.id,
        session.id,
      );

      await prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-revoked-reauth',
        email: 'revokedreauth@example.com',
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

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('SESSION_REVOKED_OR_EXPIRED');
    });

    it('rejects with 403 ACCOUNT_SUSPENDED when user account is suspended', async () => {
      const { user, session, accessToken } = await setupOAuthUserAndSession(
        'suspendedreauth@example.com',
        'google-sub-suspended',
      );
      const { rawState, statePrefix, cookieHmac, nonce } = await createReauthTransaction(
        user.id,
        session.id,
      );

      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'SUSPENDED' },
      });

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-suspended',
        email: 'suspendedreauth@example.com',
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

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });
  });
});
