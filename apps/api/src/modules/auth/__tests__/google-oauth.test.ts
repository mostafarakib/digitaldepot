import request from 'supertest';
import * as jose from 'jose';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { Prisma } from '../../../generated/client/client.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { hashPassword } from '../../../lib/crypto.js';
import { env } from '../../../config/env.js';
import { cleanDatabase, testPool, extractCookies } from '../../../test/setup.js';
import { googleOAuthService } from '../google-oauth.service.js';

describe('Google OAuth Integration Tests (Phase 3E-1)', () => {
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
    email_verified?: boolean;
    nonce: string;
    name?: string;
    picture?: string;
    expiresIn?: string;
    issuer?: string;
    audience?: string | string[];
    azp?: string;
    iat?: number;
  }): Promise<string> {
    const claims: Record<string, unknown> = {
      sub: params.sub,
      email: params.email,
      email_verified: params.email_verified ?? true,
      nonce: params.nonce,
      name: params.name ?? 'Google User',
      picture: params.picture,
    };

    if (params.azp !== undefined) {
      claims['azp'] = params.azp;
    }

    const jwt = new jose.SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-google-key-id' })
      .setIssuer(params.issuer ?? 'https://accounts.google.com')
      .setAudience(params.audience ?? env.GOOGLE_CLIENT_ID)
      .setExpirationTime(params.expiresIn ?? '1h');

    if (params.iat !== undefined) {
      jwt.setIssuedAt(params.iat);
    } else {
      jwt.setIssuedAt();
    }

    return jwt.sign(keyPair.privateKey);
  }

  describe('GET /api/v1/auth/oauth/google (Initiation)', () => {
    it('initiates OAuth flow, sets per-transaction state cookie, and redirects to Google auth URL', async () => {
      const res = await request(app).get('/api/v1/auth/oauth/google?returnUrl=/checkout');

      expect(res.status).toBe(302);
      const redirectUrl = new URL(res.headers.location);
      expect(redirectUrl.origin + redirectUrl.pathname).toBe(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
      expect(redirectUrl.searchParams.get('client_id')).toBe(env.GOOGLE_CLIENT_ID);
      expect(redirectUrl.searchParams.get('redirect_uri')).toBe(env.GOOGLE_CALLBACK_URL);
      expect(redirectUrl.searchParams.get('response_type')).toBe('code');
      expect(redirectUrl.searchParams.get('scope')).toBe('openid email profile');
      expect(redirectUrl.searchParams.get('code_challenge_method')).toBe('S256');

      const rawState = redirectUrl.searchParams.get('state');
      const nonce = redirectUrl.searchParams.get('nonce');
      expect(rawState).toBeDefined();
      expect(nonce).toBeDefined();

      const statePrefix = rawState!.slice(0, 16);
      const cookies = extractCookies(res);
      const stateCookieVal = parseCookieValue(cookies, `dd_oauth_${statePrefix}`);
      expect(stateCookieVal).toBeDefined();
      expect(stateCookieVal).toHaveLength(64); // SHA-256 HMAC

      // Verify transaction committed to database
      const tx = await prisma.oAuthTransaction.findFirst({
        where: { statePrefix },
      });
      expect(tx).not.toBeNull();
      expect(tx!.returnUrl).toBe('/checkout');
      expect(tx!.action).toBe('SIGNIN');
      expect(tx!.consumedAt).toBeNull();
    });

    it('returns JSON payload when format=json query parameter is supplied', async () => {
      const res = await request(app).get('/api/v1/auth/oauth/google?format=json');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(res.body.data.statePrefix).toHaveLength(16);

      const cookies = extractCookies(res);
      const stateCookieVal = parseCookieValue(cookies, `dd_oauth_${res.body.data.statePrefix}`);
      expect(stateCookieVal).toBeDefined();
    });

    it('rejects external or malformed returnUrl with 400 Bad Request', async () => {
      const res = await request(app).get(
        '/api/v1/auth/oauth/google?format=json&returnUrl=https://evil.com',
      );

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');

      const protocolRelativeRes = await request(app).get(
        '/api/v1/auth/oauth/google?format=json&returnUrl=//evil.com',
      );
      expect(protocolRelativeRes.status).toBe(400);
    });

    it('supports multi-tab isolation by assigning unique state prefixes and cookies', async () => {
      const tab1Res = await request(app).get('/api/v1/auth/oauth/google?format=json');
      const tab2Res = await request(app).get('/api/v1/auth/oauth/google?format=json');

      const prefix1 = tab1Res.body.data.statePrefix;
      const prefix2 = tab2Res.body.data.statePrefix;

      expect(prefix1).not.toBe(prefix2);

      const cookies1 = extractCookies(tab1Res);
      const cookies2 = extractCookies(tab2Res);

      expect(parseCookieValue(cookies1, `dd_oauth_${prefix1}`)).toBeDefined();
      expect(parseCookieValue(cookies2, `dd_oauth_${prefix2}`)).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/oauth/google/callback', () => {
    async function setupInitiatedOAuth(returnUrl = '/account') {
      const initRes = await request(app).get(
        `/api/v1/auth/oauth/google?format=json&returnUrl=${encodeURIComponent(returnUrl)}`,
      );
      const authUrl = new URL(initRes.body.data.authUrl);
      const rawState = authUrl.searchParams.get('state')!;
      const statePrefix = initRes.body.data.statePrefix;
      const cookies = extractCookies(initRes);
      const stateCookieVal = parseCookieValue(cookies, `dd_oauth_${statePrefix}`)!;

      const tx = await prisma.oAuthTransaction.findFirst({
        where: { statePrefix },
      });

      return {
        rawState,
        statePrefix,
        stateCookieVal,
        stateCookieHeader: `dd_oauth_${statePrefix}=${stateCookieVal}`,
        nonce: tx!.nonce,
        txId: tx!.id,
      };
    }

    it('registers a new customer account, populates HTTPS avatar, and establishes authenticated session', async () => {
      const { rawState, stateCookieHeader, nonce } = await setupInitiatedOAuth('/dashboard');

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-user-001',
        email: 'tariq.zaman@example.com',
        nonce,
        name: 'Tariq Zaman',
        picture: 'https://lh3.googleusercontent.com/a/test-avatar-photo',
      });

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({
          code: 'valid-google-auth-code',
          state: rawState,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('AUTHENTICATED');
      expect(res.body.data.returnUrl).toBe('/dashboard');
      expect(res.body.data.user.email).toBe('tariq.zaman@example.com');
      expect(res.body.data.user.emailVerified).toBe(true);
      expect(res.body.data.user.profile.firstName).toBe('Tariq');
      expect(res.body.data.user.profile.lastName).toBe('Zaman');
      expect(res.body.data.user.profile.avatarUrl).toBe(
        'https://lh3.googleusercontent.com/a/test-avatar-photo',
      );

      // Verify cookies
      const cookies = extractCookies(res);
      expect(parseCookieValue(cookies, COOKIE_NAMES.ACCESS_TOKEN)).toBeDefined();
      expect(parseCookieValue(cookies, COOKIE_NAMES.REFRESH_TOKEN)).toBeDefined();
      expect(parseCookieValue(cookies, COOKIE_NAMES.CSRF_TOKEN)).toBeDefined();

      // State cookie cleared
      const rawStatePrefix = rawState.slice(0, 16);
      const stateCookie = cookies.find((c) => c.startsWith(`dd_oauth_${rawStatePrefix}=`));
      expect(stateCookie).toBeDefined();
      expect(stateCookie).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/);

      // Verify database entities
      const user = await prisma.user.findUnique({
        where: { email: 'tariq.zaman@example.com' },
        include: { oauthAccounts: true, profile: true },
      });
      expect(user).not.toBeNull();
      expect(user!.passwordHash).toBeNull();
      expect(user!.oauthAccounts).toHaveLength(1);
      expect(user!.oauthAccounts[0]!.provider).toBe('GOOGLE');
      expect(user!.oauthAccounts[0]!.providerAccountId).toBe('google-sub-user-001');
    });

    it('ignores non-HTTPS avatar URLs for new users', async () => {
      const { rawState, stateCookieHeader, nonce } = await setupInitiatedOAuth();

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-insecure-pic',
        email: 'insecure.avatar@example.com',
        nonce,
        name: 'Insecure Pic',
        picture: 'http://insecure.example.com/avatar.jpg',
      });

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({
          code: 'code-123',
          state: rawState,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.user.profile.avatarUrl).toBeNull();
    });

    it('authenticates an existing customer whose Google account is already linked', async () => {
      // Create user and OAuthAccount beforehand
      const existingUser = await prisma.user.create({
        data: {
          email: 'linked.customer@example.com',
          passwordHash: null,
          role: 'CUSTOMER',
          status: 'ACTIVE',
          emailVerified: true,
          profile: {
            create: {
              firstName: 'Existing',
              lastName: 'Linked',
            },
          },
          oauthAccounts: {
            create: {
              provider: 'GOOGLE',
              providerAccountId: 'google-sub-already-linked',
            },
          },
        },
      });

      const { rawState, stateCookieHeader, nonce } = await setupInitiatedOAuth('/orders');

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-already-linked',
        email: 'linked.customer@example.com',
        nonce,
      });

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({
          code: 'code-existing',
          state: rawState,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('AUTHENTICATED');
      expect(res.body.data.user.id).toBe(existingUser.id);
      expect(res.body.data.returnUrl).toBe('/orders');

      const cookies = extractCookies(res);
      expect(parseCookieValue(cookies, COOKIE_NAMES.ACCESS_TOKEN)).toBeDefined();
      expect(parseCookieValue(cookies, COOKIE_NAMES.REFRESH_TOKEN)).toBeDefined();
    });

    it('initiates conservative account link challenge when email matches existing password account', async () => {
      // Existing user with password
      const pwHash = await hashPassword('ExistingPassword123!');
      const existingUser = await prisma.user.create({
        data: {
          email: 'conflict.user@example.com',
          passwordHash: pwHash,
          role: 'CUSTOMER',
          status: 'ACTIVE',
          emailVerified: false,
          profile: {
            create: {
              firstName: 'Conflict',
              lastName: 'Candidate',
            },
          },
        },
      });

      const { rawState, stateCookieHeader, nonce } = await setupInitiatedOAuth('/checkout');

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-new-for-existing-email',
        email: 'conflict.user@example.com',
        nonce,
      });

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({
          code: 'code-conflict',
          state: rawState,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('LINK_REQUIRED');
      expect(res.body.data.challengePrefix).toHaveLength(16);
      expect(res.body.data.returnUrl).toBe('/checkout');
      // Email must NOT be in the response body
      expect(res.body.data.email).toBeUndefined();

      // Auth cookies must NOT be issued
      const cookies = extractCookies(res);
      expect(parseCookieValue(cookies, COOKIE_NAMES.ACCESS_TOKEN)).toBeNull();
      expect(parseCookieValue(cookies, COOKIE_NAMES.REFRESH_TOKEN)).toBeNull();

      // Link challenge cookie must be set
      const challengePrefix = res.body.data.challengePrefix;
      const linkCookieVal = parseCookieValue(cookies, `dd_link_${challengePrefix}`);
      expect(linkCookieVal).toBeDefined();

      // CSRF token rotated and provided
      expect(parseCookieValue(cookies, COOKIE_NAMES.CSRF_TOKEN)).toBeDefined();

      // Link challenge record committed in DB
      const challenge = await prisma.oAuthLinkChallenge.findFirst({
        where: { challengePrefix },
      });
      expect(challenge).not.toBeNull();
      expect(challenge!.userId).toBe(existingUser.id);
      expect(challenge!.providerAccountId).toBe('google-sub-new-for-existing-email');
      expect(challenge!.failedAttempts).toBe(0);
      expect(challenge!.consumedAt).toBeNull();
    });

    it('rejects with 409 when account is already linked to a different Google identity', async () => {
      await prisma.user.create({
        data: {
          email: 'already.bound@example.com',
          passwordHash: null,
          role: 'CUSTOMER',
          status: 'ACTIVE',
          oauthAccounts: {
            create: {
              provider: 'GOOGLE',
              providerAccountId: 'google-sub-original',
            },
          },
        },
      });

      const { rawState, stateCookieHeader, nonce } = await setupInitiatedOAuth();

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-DIFFERENT',
        email: 'already.bound@example.com',
        nonce,
      });

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({
          code: 'code-different-sub',
          state: rawState,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('OAUTH_PROVIDER_IDENTITY_CONFLICT');
    });

    it('rejects with 403 when user account is suspended', async () => {
      await prisma.user.create({
        data: {
          email: 'suspended.user@example.com',
          passwordHash: null,
          role: 'CUSTOMER',
          status: 'SUSPENDED',
          oauthAccounts: {
            create: {
              provider: 'GOOGLE',
              providerAccountId: 'google-sub-suspended',
            },
          },
        },
      });

      const { rawState, stateCookieHeader, nonce } = await setupInitiatedOAuth();

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-suspended',
        email: 'suspended.user@example.com',
        nonce,
      });

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({
          code: 'code-suspended',
          state: rawState,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('prevents transaction replay (single-use enforcement)', async () => {
      const { rawState, stateCookieHeader, nonce } = await setupInitiatedOAuth();

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-single-use',
        email: 'singleuse@example.com',
        nonce,
      });

      // First call succeeds
      const firstRes = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({ code: 'first-call', state: rawState });
      expect(firstRes.status).toBe(200);

      // Second call fails with 400
      const secondRes = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({ code: 'second-call', state: rawState });
      expect(secondRes.status).toBe(400);
    });

    it('rejects callback with 401 when state cookie is missing', async () => {
      const { rawState } = await setupInitiatedOAuth();

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .send({ code: 'code-no-cookie', state: rawState });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_OAUTH_STATE');
    });

    it('rejects callback with 401 when state cookie HMAC has been tampered with', async () => {
      const { rawState, statePrefix } = await setupInitiatedOAuth();

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', `dd_oauth_${statePrefix}=tampered-hmac-value-1234567890abcdef`)
        .send({ code: 'code-tampered', state: rawState });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_OAUTH_STATE');
    });

    it('rejects callback when Google email is unverified', async () => {
      const { rawState, stateCookieHeader, nonce } = await setupInitiatedOAuth();

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-unverified-email',
        email: 'unverified@example.com',
        email_verified: false,
        nonce,
      });

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({ code: 'code-unverified', state: rawState });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Google email must be verified');
    });

    it('rejects callback when ID token nonce does not match transaction nonce', async () => {
      const { rawState, stateCookieHeader } = await setupInitiatedOAuth();

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-wrong-nonce',
        email: 'wrong.nonce@example.com',
        nonce: 'different-mismatched-nonce-value',
      });

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({ code: 'code-wrong-nonce', state: rawState });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('nonce mismatch');
    });

    it('accepts multi-valued aud when azp matches client ID', async () => {
      const { rawState, stateCookieHeader, nonce } = await setupInitiatedOAuth();

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-multi-aud-valid',
        email: 'multiaud.valid@example.com',
        nonce,
        audience: [env.GOOGLE_CLIENT_ID, 'other-trusted-app-client-id'],
        azp: env.GOOGLE_CLIENT_ID,
      });

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({ code: 'code-multi-aud-valid', state: rawState });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('AUTHENTICATED');
      expect(res.body.data.user.email).toBe('multiaud.valid@example.com');
    });

    it('rejects multi-valued aud when azp claim is missing', async () => {
      const { rawState, stateCookieHeader, nonce } = await setupInitiatedOAuth();

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-multi-aud-no-azp',
        email: 'multiaud.noazp@example.com',
        nonce,
        audience: [env.GOOGLE_CLIENT_ID, 'other-trusted-app-client-id'],
      });

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({ code: 'code-multi-aud-no-azp', state: rawState });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('azp claim required');
    });

    it('rejects multi-valued aud when azp claim does not match client ID', async () => {
      const { rawState, stateCookieHeader, nonce } = await setupInitiatedOAuth();

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-multi-aud-bad-azp',
        email: 'multiaud.badazp@example.com',
        nonce,
        audience: [env.GOOGLE_CLIENT_ID, 'other-trusted-app-client-id'],
        azp: 'unauthorized-client-id',
      });

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({ code: 'code-multi-aud-bad-azp', state: rawState });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('azp claim required and must match client ID');
    });

    it('rejects string aud when azp exists but does not match client ID', async () => {
      const { rawState, stateCookieHeader, nonce } = await setupInitiatedOAuth();

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-str-aud-bad-azp',
        email: 'straud.badazp@example.com',
        nonce,
        audience: env.GOOGLE_CLIENT_ID,
        azp: 'mismatched-azp-client-id',
      });

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({ code: 'code-str-aud-bad-azp', state: rawState });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('azp claim does not match client ID');
    });

    it('rejects callback when iat claim is future-dated by more than 60 seconds', async () => {
      const { rawState, stateCookieHeader, nonce } = await setupInitiatedOAuth();

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-future-iat',
        email: 'future.iat@example.com',
        nonce,
        iat: Math.floor(Date.now() / 1000) + 120, // 2 minutes in future
      });

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({ code: 'code-future-iat', state: rawState });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('iat claim is invalid or future-dated');
    });

    it('maps concurrent User.email uniqueness collision to EMAIL_ALREADY_EXISTS outside aborted transaction', async () => {
      const { rawState, stateCookieHeader, nonce } = await setupInitiatedOAuth();

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-concurrent-email',
        email: 'race.email@example.com',
        nonce,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txSpy = vi
        .spyOn(prisma, '$transaction')
        .mockImplementationOnce(async (callback: any) => {
          const mockTx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            user: {
              create: vi.fn().mockRejectedValue(
                new Prisma.PrismaClientKnownRequestError(
                  'Unique constraint failed on the fields: (`email`)',
                  {
                    code: 'P2002',
                    clientVersion: '7.10.1',
                    meta: { target: ['email'], constraint: 'User_email_key' },
                  },
                ),
              ),
            },
            oAuthAccount: { create: vi.fn() },
          };
          return callback(mockTx);
        });

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({ code: 'code-race-email', state: rawState });

      txSpy.mockRestore();

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
      expect(res.body.error.message).toContain('already exists');
    });

    it('maps concurrent OAuthAccount provider identity collision to OAUTH_PROVIDER_IDENTITY_CONFLICT outside aborted transaction', async () => {
      const { rawState, stateCookieHeader, nonce } = await setupInitiatedOAuth();

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-concurrent-oauth',
        email: 'race.oauth@example.com',
        nonce,
      });

      const txSpy = vi
        .spyOn(prisma, '$transaction')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementationOnce(async (callback: any) => {
          const mockTx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            user: {
              create: vi.fn().mockResolvedValue({
                id: 'mock-user-id',
                email: 'race.oauth@example.com',
                profile: null,
              }),
            },
            oAuthAccount: {
              create: vi.fn().mockRejectedValue(
                new Prisma.PrismaClientKnownRequestError(
                  'Unique constraint failed on the fields: (`provider`, `providerAccountId`)',
                  {
                    code: 'P2002',
                    clientVersion: '7.10.1',
                    meta: {
                      target: ['provider', 'providerAccountId'],
                      constraint: 'unique_provider_account',
                    },
                  },
                ),
              ),
            },
          };
          return callback(mockTx);
        });

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({ code: 'code-race-oauth', state: rawState });

      txSpy.mockRestore();

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('OAUTH_PROVIDER_IDENTITY_CONFLICT');
      expect(res.body.error.message).toContain('already linked');
    });

    it('does not map unrelated P2002 errors and allows them to propagate', async () => {
      const { rawState, stateCookieHeader, nonce } = await setupInitiatedOAuth();

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-unrelated-p2002',
        email: 'unrelated.p2002@example.com',
        nonce,
      });

      const txSpy = vi
        .spyOn(prisma, '$transaction')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementationOnce(async (callback: any) => {
          const mockTx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            user: {
              create: vi.fn().mockRejectedValue(
                new Prisma.PrismaClientKnownRequestError(
                  'Unique constraint failed on unrelated field',
                  {
                    code: 'P2002',
                    clientVersion: '7.10.1',
                    meta: { target: ['unrelated_field'], constraint: 'unrelated_key' },
                  },
                ),
              ),
            },
            oAuthAccount: { create: vi.fn() },
          };
          return callback(mockTx);
        });

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', stateCookieHeader)
        .send({ code: 'code-unrelated-p2002', state: rawState });

      txSpy.mockRestore();

      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/v1/auth/oauth/google/confirm-link', () => {
    async function setupLinkChallenge() {
      const pwHash = await hashPassword('CorrectPassword123!');
      const user = await prisma.user.create({
        data: {
          email: 'confirm.link.test@example.com',
          passwordHash: pwHash,
          role: 'CUSTOMER',
          status: 'ACTIVE',
          emailVerified: false,
          profile: {
            create: {
              firstName: 'Confirm',
              lastName: 'Tester',
            },
          },
        },
      });

      // Trigger OAuth callback to get a real challenge
      const initRes = await request(app).get('/api/v1/auth/oauth/google?format=json');
      const authUrl = new URL(initRes.body.data.authUrl);
      const rawState = authUrl.searchParams.get('state')!;
      const statePrefix = initRes.body.data.statePrefix;
      const initCookies = extractCookies(initRes);
      const stateCookieVal = parseCookieValue(initCookies, `dd_oauth_${statePrefix}`)!;

      const tx = await prisma.oAuthTransaction.findFirst({ where: { statePrefix } });

      currentMockIdToken = await issueGoogleIdToken({
        sub: 'google-sub-to-confirm',
        email: 'confirm.link.test@example.com',
        nonce: tx!.nonce,
      });

      const callbackRes = await request(app)
        .post('/api/v1/auth/oauth/google/callback')
        .set('Cookie', `dd_oauth_${statePrefix}=${stateCookieVal}`)
        .send({ code: 'valid-code', state: rawState });

      expect(callbackRes.body.data.status).toBe('LINK_REQUIRED');
      const challengePrefix = callbackRes.body.data.challengePrefix;
      const callbackCookies = extractCookies(callbackRes);
      const linkCookieVal = parseCookieValue(callbackCookies, `dd_link_${challengePrefix}`)!;

      return {
        user,
        challengePrefix,
        linkCookieVal,
        linkCookieHeader: `dd_link_${challengePrefix}=${linkCookieVal}`,
      };
    }

    it('confirms account link on correct password, issues session, and marks email verified', async () => {
      const { user, challengePrefix, linkCookieHeader } = await setupLinkChallenge();
      const csrf = getCsrfHeaders();

      const res = await request(app)
        .post('/api/v1/auth/oauth/google/confirm-link')
        .set('Origin', csrf.Origin)
        .set('Cookie', `${csrf.Cookie}; ${linkCookieHeader}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          challengePrefix,
          password: 'CorrectPassword123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('AUTHENTICATED');
      expect(res.body.data.user.id).toBe(user.id);
      expect(res.body.data.user.emailVerified).toBe(true);

      const cookies = extractCookies(res);
      expect(parseCookieValue(cookies, COOKIE_NAMES.ACCESS_TOKEN)).toBeDefined();
      expect(parseCookieValue(cookies, COOKIE_NAMES.REFRESH_TOKEN)).toBeDefined();

      // Link challenge cookie cleared
      const linkCookie = cookies.find((c) => c.startsWith(`dd_link_${challengePrefix}=`));
      expect(linkCookie).toBeDefined();
      expect(linkCookie).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/);

      // Verify OAuthAccount created
      const oauthAccount = await prisma.oAuthAccount.findUnique({
        where: {
          unique_provider_account: {
            provider: 'GOOGLE',
            providerAccountId: 'google-sub-to-confirm',
          },
        },
      });
      expect(oauthAccount).not.toBeNull();
      expect(oauthAccount!.userId).toBe(user.id);

      // Verify challenge consumed in DB
      const challenge = await prisma.oAuthLinkChallenge.findFirst({
        where: { challengePrefix },
      });
      expect(challenge!.consumedAt).not.toBeNull();
    });

    it('increments failedAttempts and retains link cookie on attempts 1-4, then locks out on attempt 5', async () => {
      const { challengePrefix, linkCookieHeader } = await setupLinkChallenge();

      // Attempts 1 to 4: returns 401, cookie retained, failedAttempts incremented
      for (let attempt = 1; attempt <= 4; attempt++) {
        const csrf = getCsrfHeaders();
        const res = await request(app)
          .post('/api/v1/auth/oauth/google/confirm-link')
          .set('Origin', csrf.Origin)
          .set('Cookie', `${csrf.Cookie}; ${linkCookieHeader}`)
          .set('x-csrf-token', csrf['x-csrf-token'])
          .send({
            challengePrefix,
            password: 'WrongPassword!',
          });

        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
        expect(res.body.error.message).toContain(`${5 - attempt} attempts remaining`);

        // Crucial requirement: Cookie must NOT be cleared on attempts 1-4
        const cookies = extractCookies(res);
        const linkCookieCleared = cookies.some(
          (c) =>
            c.startsWith(`dd_link_${challengePrefix}=`) &&
            (c.includes('Max-Age=0') || c.includes('1970')),
        );
        expect(linkCookieCleared).toBe(false);

        // Verify failedAttempts committed to DB
        const inDb = await prisma.oAuthLinkChallenge.findFirst({ where: { challengePrefix } });
        expect(inDb!.failedAttempts).toBe(attempt);
        expect(inDb!.consumedAt).toBeNull();
      }

      // Attempt 5: Lockout! Returns 400, challenge consumed, cookie cleared
      const csrf5 = getCsrfHeaders();
      const res5 = await request(app)
        .post('/api/v1/auth/oauth/google/confirm-link')
        .set('Origin', csrf5.Origin)
        .set('Cookie', `${csrf5.Cookie}; ${linkCookieHeader}`)
        .set('x-csrf-token', csrf5['x-csrf-token'])
        .send({
          challengePrefix,
          password: 'WrongPassword!',
        });

      expect(res5.status).toBe(400);
      expect(res5.body.error.message).toContain('Too many failed password attempts');

      // Cookie must be cleared on 5th attempt
      const cookies5 = extractCookies(res5);
      const linkCookie5 = cookies5.find((c) => c.startsWith(`dd_link_${challengePrefix}=`));
      expect(linkCookie5).toBeDefined();
      expect(linkCookie5).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/);

      // Verify challenge consumed in DB
      const inDb5 = await prisma.oAuthLinkChallenge.findFirst({ where: { challengePrefix } });
      expect(inDb5!.failedAttempts).toBe(5);
      expect(inDb5!.consumedAt).not.toBeNull();

      // Subsequent attempt 6 fails as expired/invalid
      const csrf6 = getCsrfHeaders();
      const res6 = await request(app)
        .post('/api/v1/auth/oauth/google/confirm-link')
        .set('Origin', csrf6.Origin)
        .set('Cookie', `${csrf6.Cookie}; ${linkCookieHeader}`)
        .set('x-csrf-token', csrf6['x-csrf-token'])
        .send({
          challengePrefix,
          password: 'CorrectPassword123!',
        });
      expect(res6.status).toBe(400);
      expect(res6.body.error.message).toContain('expired or is invalid');
    });

    it('rejects when link cookie is missing with 401', async () => {
      const csrf = getCsrfHeaders();
      const res = await request(app)
        .post('/api/v1/auth/oauth/google/confirm-link')
        .set('Origin', csrf.Origin)
        .set('Cookie', csrf.Cookie)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          challengePrefix: 'abcdef1234567890',
          password: 'SomePassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_LINK_CHALLENGE');
    });

    it('enforces double-submit CSRF and Origin protection', async () => {
      const { challengePrefix, linkCookieHeader } = await setupLinkChallenge();

      // Missing x-csrf-token header
      const resNoHeader = await request(app)
        .post('/api/v1/auth/oauth/google/confirm-link')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', `${COOKIE_NAMES.CSRF_TOKEN}=some-token; ${linkCookieHeader}`)
        .send({
          challengePrefix,
          password: 'CorrectPassword123!',
        });
      expect(resNoHeader.status).toBe(403);

      // Invalid Origin
      const csrf = getCsrfHeaders();
      const resBadOrigin = await request(app)
        .post('/api/v1/auth/oauth/google/confirm-link')
        .set('Origin', 'https://attacker.com')
        .set('Cookie', `${csrf.Cookie}; ${linkCookieHeader}`)
        .set('x-csrf-token', csrf['x-csrf-token'])
        .send({
          challengePrefix,
          password: 'CorrectPassword123!',
        });
      expect(resBadOrigin.status).toBe(403);
    });
  });
});
