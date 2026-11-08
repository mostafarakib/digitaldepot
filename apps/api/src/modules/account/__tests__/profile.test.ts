import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool, extractCookies } from '../../../test/setup.js';
import { env } from '../../../config/env.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { hashPassword } from '../../../lib/crypto.js';

describe('Customer Profile Management Integration Tests (Phase 3D-1)', () => {
  beforeEach(async () => {
    await cleanDatabase();
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

  async function createTestUser(
    email: string,
    password = 'Password123!',
    role: 'CUSTOMER' | 'ADMIN' = 'CUSTOMER',
    profileData?: { firstName?: string; lastName?: string; phone?: string | null },
  ) {
    const passwordHash = await hashPassword(password);
    return await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            firstName: profileData?.firstName ?? 'InitialFirst',
            lastName: profileData?.lastName ?? 'InitialLast',
            phone: profileData?.phone ?? null,
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

  describe('GET /api/v1/account/profile', () => {
    it('returns customer profile, email, and verification status for authenticated customer', async () => {
      const user = await createTestUser('customer@example.com', 'Password123!', 'CUSTOMER', {
        firstName: 'Tanvir',
        lastName: 'Ahmed',
        phone: '+8801712345678',
      });
      const auth = await loginAndGetCookies(user.email);

      const res = await request(app)
        .get('/api/v1/account/profile')
        .set('Cookie', auth.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('customer@example.com');
      expect(res.body.data.emailVerified).toBe(true);
      expect(res.body.data.profile).toEqual({
        firstName: 'Tanvir',
        lastName: 'Ahmed',
        phone: '+8801712345678',
        avatarUrl: null,
      });
    });

    it('rejects unauthenticated request with 401 AUTHENTICATION_REQUIRED', async () => {
      const res = await request(app).get('/api/v1/account/profile');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects ADMIN user with 403 INSUFFICIENT_PERMISSIONS', async () => {
      const admin = await createTestUser('admin@example.com', 'Password123!', 'ADMIN');
      const auth = await loginAndGetCookies(admin.email);

      const res = await request(app)
        .get('/api/v1/account/profile')
        .set('Cookie', auth.cookieHeader);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(res.body.error.message).toContain('customer role');
    });
  });

  describe('PATCH /api/v1/account/profile', () => {
    it('rejects unauthenticated request with 401', async () => {
      const csrfHeaders = getCsrfHeaders();
      const res = await request(app)
        .patch('/api/v1/account/profile')
        .set('Origin', csrfHeaders.Origin)
        .set('Cookie', csrfHeaders.Cookie)
        .set('x-csrf-token', csrfHeaders['x-csrf-token'])
        .send({ firstName: 'NewName' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects ADMIN user with 403 INSUFFICIENT_PERMISSIONS', async () => {
      const admin = await createTestUser('admin-patch@example.com', 'Password123!', 'ADMIN');
      const auth = await loginAndGetCookies(admin.email);

      const res = await request(app)
        .patch('/api/v1/account/profile')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ firstName: 'AdminName' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('rejects request without valid CSRF header with 403', async () => {
      const user = await createTestUser('csrf-test@example.com');
      const auth = await loginAndGetCookies(user.email);

      const res = await request(app)
        .patch('/api/v1/account/profile')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        // Missing x-csrf-token header
        .send({ firstName: 'NoCsrf' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_MISSING');
    });

    it('trims and updates firstName and lastName', async () => {
      const user = await createTestUser('trim-test@example.com');
      const auth = await loginAndGetCookies(user.email);

      const res = await request(app)
        .patch('/api/v1/account/profile')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          firstName: '   Rahim   ',
          lastName: '   Chowdhury   ',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Profile updated successfully');
      expect(res.body.data.profile.firstName).toBe('Rahim');
      expect(res.body.data.profile.lastName).toBe('Chowdhury');

      // Verify in DB
      const dbProfile = await prisma.customerProfile.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(dbProfile.firstName).toBe('Rahim');
      expect(dbProfile.lastName).toBe('Chowdhury');
    });

    it('rejects empty or whitespace-only names with 400', async () => {
      const user = await createTestUser('invalid-name@example.com');
      const auth = await loginAndGetCookies(user.email);

      const res1 = await request(app)
        .patch('/api/v1/account/profile')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ firstName: '   ' });

      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .patch('/api/v1/account/profile')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ lastName: '' });

      expect(res2.status).toBe(400);
    });

    it('rejects names exceeding 50 characters with 400', async () => {
      const user = await createTestUser('long-name@example.com');
      const auth = await loginAndGetCookies(user.email);

      const res = await request(app)
        .patch('/api/v1/account/profile')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ firstName: 'A'.repeat(51) });

      expect(res.status).toBe(400);
    });

    it('normalizes Bangladesh mobile phone: format 01XXXXXXXXX -> +8801XXXXXXXXX', async () => {
      const user = await createTestUser('phone1@example.com');
      const auth = await loginAndGetCookies(user.email);

      const res = await request(app)
        .patch('/api/v1/account/profile')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ phone: '01712345678' });

      expect(res.status).toBe(200);
      expect(res.body.data.profile.phone).toBe('+8801712345678');

      const dbProfile = await prisma.customerProfile.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(dbProfile.phone).toBe('+8801712345678');
    });

    it('normalizes Bangladesh mobile phone: format +8801XXXXXXXXX -> +8801XXXXXXXXX', async () => {
      const user = await createTestUser('phone2@example.com');
      const auth = await loginAndGetCookies(user.email);

      const res = await request(app)
        .patch('/api/v1/account/profile')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ phone: '+8801812345678' });

      expect(res.status).toBe(200);
      expect(res.body.data.profile.phone).toBe('+8801812345678');

      const dbProfile = await prisma.customerProfile.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(dbProfile.phone).toBe('+8801812345678');
    });

    it('normalizes Bangladesh mobile phone: format 8801XXXXXXXXX -> +8801XXXXXXXXX', async () => {
      const user = await createTestUser('phone3@example.com');
      const auth = await loginAndGetCookies(user.email);

      const res = await request(app)
        .patch('/api/v1/account/profile')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ phone: '8801912345678' });

      expect(res.status).toBe(200);
      expect(res.body.data.profile.phone).toBe('+8801912345678');

      const dbProfile = await prisma.customerProfile.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(dbProfile.phone).toBe('+8801912345678');
    });

    it('rejects invalid Bangladesh phone numbers with 400', async () => {
      const user = await createTestUser('invalid-phone@example.com');
      const auth = await loginAndGetCookies(user.email);

      const invalidNumbers = [
        '12345',
        '01212345678', // Invalid operator 012
        '01112345678', // Discontinued operator 011
        '+880212345678', // Dhaka landline
        '0171234567', // 10 digits
        '017123456789', // 12 digits
        'abcd1234567',
        '+14155552671', // US number
      ];

      for (const phone of invalidNumbers) {
        const res = await request(app)
          .patch('/api/v1/account/profile')
          .set('Origin', env.FRONTEND_URL)
          .set('Cookie', auth.cookieHeader)
          .set('x-csrf-token', auth.csrfHeader)
          .send({ phone });

        expect(res.status).toBe(400);
      }
    });

    it('omitted phone preserves existing phone number', async () => {
      const user = await createTestUser('preserve-phone@example.com', 'Password123!', 'CUSTOMER', {
        firstName: 'OldFirst',
        lastName: 'OldLast',
        phone: '+8801799999999',
      });
      const auth = await loginAndGetCookies(user.email);

      // Submit only firstName, phone is omitted
      const res = await request(app)
        .patch('/api/v1/account/profile')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ firstName: 'NewFirst' });

      expect(res.status).toBe(200);
      expect(res.body.data.profile.firstName).toBe('NewFirst');
      expect(res.body.data.profile.phone).toBe('+8801799999999');

      const dbProfile = await prisma.customerProfile.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(dbProfile.phone).toBe('+8801799999999');
    });

    it('explicit null clears existing phone number', async () => {
      const user = await createTestUser('clear-phone@example.com', 'Password123!', 'CUSTOMER', {
        firstName: 'HasPhone',
        lastName: 'User',
        phone: '+8801799999999',
      });
      const auth = await loginAndGetCookies(user.email);

      // Submit phone: null
      const res = await request(app)
        .patch('/api/v1/account/profile')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ phone: null });

      expect(res.status).toBe(200);
      expect(res.body.data.profile.phone).toBeNull();

      const dbProfile = await prisma.customerProfile.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(dbProfile.phone).toBeNull();
    });

    it('ignores email in payload (email is read-only and immutable via profile)', async () => {
      const user = await createTestUser('immutable-email@example.com');
      const auth = await loginAndGetCookies(user.email);

      const res = await request(app)
        .patch('/api/v1/account/profile')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          firstName: 'NewName',
          email: 'malicious-change@example.com',
        });

      expect(res.status).toBe(200);

      // User email must be untouched
      const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(dbUser.email).toBe('immutable-email@example.com');
    });
  });
});
