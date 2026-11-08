import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool, extractCookies } from '../../../test/setup.js';
import { env } from '../../../config/env.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { hashPassword } from '../../../lib/crypto.js';
import {
  BANGLADESH_DIVISIONS,
  isValidDivision,
  isValidDistrict,
  isDistrictInDivision,
} from '../data/bangladesh-geo.js';

describe('Delivery Address Foundation & Backend API Integration Tests (Phase 3D-2)', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPool.end();
  });

  function getUnauthenticatedCsrf() {
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
            firstName: 'Test',
            lastName: 'Customer',
            phone: '+8801712345678',
          },
        },
      },
      include: { profile: true },
    });
  }

  async function loginAndGetCookies(email: string, password = 'Password123!') {
    const csrf = getUnauthenticatedCsrf();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', csrf.Origin)
      .set('Cookie', csrf.Cookie)
      .set('x-csrf-token', csrf['x-csrf-token'])
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

  function getValidAddressPayload(overrides?: Record<string, unknown>) {
    return {
      recipientName: 'Rahim Chowdhury',
      phone: '01712345678',
      divisionId: 'DHAKA',
      districtId: 'DHAKA',
      upazila: 'Dhanmondi',
      streetAddress: 'House 45, Road 27, Apt 4B',
      postalCode: '1209',
      label: 'Home',
      isDefault: false,
      ...overrides,
    };
  }

  describe('1. Test Database Isolation & Safety Architecture (Requirement 3)', () => {
    it('verifies integration tests execute strictly in test environment against digitaldepot_test', async () => {
      expect(env.NODE_ENV).toBe('test');

      const testDbUrl = process.env.TEST_DATABASE_URL;
      expect(testDbUrl).toBeDefined();

      const parsed = new URL(testDbUrl!);
      const dbName = parsed.pathname.replace(/^\//, '');
      expect(dbName).toBe('digitaldepot_test');

      // Verify the active Prisma client connection queries the test database
      const dbCheck = await prisma.$queryRaw<Array<{ current_database: string }>>`
        SELECT current_database();
      `;
      expect(dbCheck[0]?.current_database).toBe('digitaldepot_test');
    });
  });

  describe('2. Geographic Dataset Integrity & Validation Helpers (Requirement 2)', () => {
    it('contains exactly 8 divisions and exactly 64 districts', () => {
      expect(BANGLADESH_DIVISIONS).toHaveLength(8);

      let totalDistricts = 0;
      for (const division of BANGLADESH_DIVISIONS) {
        totalDistricts += division.districts.length;
      }
      expect(totalDistricts).toBe(64);
    });

    it('ensures every division ID and district ID is unique and non-empty', () => {
      const divisionIds = new Set<string>();
      const districtIds = new Set<string>();

      for (const division of BANGLADESH_DIVISIONS) {
        expect(division.id.trim().length).toBeGreaterThan(0);
        expect(divisionIds.has(division.id)).toBe(false);
        divisionIds.add(division.id);

        for (const district of division.districts) {
          expect(district.id.trim().length).toBeGreaterThan(0);
          expect(districtIds.has(district.id)).toBe(false);
          districtIds.add(district.id);
        }
      }

      expect(divisionIds.size).toBe(8);
      expect(districtIds.size).toBe(64);
    });

    it('ensures every district belongs to exactly one valid division', () => {
      for (const division of BANGLADESH_DIVISIONS) {
        for (const district of division.districts) {
          expect(isValidDivision(division.id)).toBe(true);
          expect(isValidDistrict(district.id)).toBe(true);
          expect(isDistrictInDivision(division.id, district.id)).toBe(true);
        }
      }
    });

    it('validates and rejects invalid division and district combinations', () => {
      expect(isValidDivision('DHAKA')).toBe(true);
      expect(isValidDivision('UNKNOWN_DIV')).toBe(false);

      expect(isValidDistrict('DHAKA')).toBe(true);
      expect(isValidDistrict('UNKNOWN_DIST')).toBe(false);

      // Valid pairing
      expect(isDistrictInDivision('DHAKA', 'GAZIPUR')).toBe(true);
      expect(isDistrictInDivision('CHATTOGRAM', 'COXS_BAZAR')).toBe(true);

      // Invalid pairing: Gazipur belongs to Dhaka, not Chattogram
      expect(isDistrictInDivision('CHATTOGRAM', 'GAZIPUR')).toBe(false);
      expect(isDistrictInDivision('DHAKA', 'COXS_BAZAR')).toBe(false);
    });
  });

  describe('3. Route Ordering & Authorization Enforcement', () => {
    it('serves static /addresses/divisions route before dynamic /:id route', async () => {
      const user = await createTestUser('geo-user@example.com');
      const auth = await loginAndGetCookies(user.email);

      const res = await request(app)
        .get('/api/v1/account/addresses/divisions')
        .set('Cookie', auth.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.divisions).toHaveLength(8);
    });

    it('rejects unauthenticated requests to address endpoints with 401', async () => {
      const resGet = await request(app).get('/api/v1/account/addresses');
      expect(resGet.status).toBe(401);

      const resPost = await request(app).post('/api/v1/account/addresses').send({});
      expect(resPost.status).toBe(401);
    });

    it('rejects ADMIN user with 403 INSUFFICIENT_PERMISSIONS', async () => {
      const admin = await createTestUser('admin@example.com', 'AdminPass123!', 'ADMIN');
      const auth = await loginAndGetCookies(admin.email, 'AdminPass123!');

      const resGet = await request(app)
        .get('/api/v1/account/addresses')
        .set('Cookie', auth.cookieHeader);
      expect(resGet.status).toBe(403);
      expect(resGet.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');

      const resPost = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload());
      expect(resPost.status).toBe(403);
      expect(resPost.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('rejects address mutations without valid CSRF header with 403', async () => {
      const user = await createTestUser('csrf-user@example.com');
      const auth = await loginAndGetCookies(user.email);

      const resPost = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        // missing x-csrf-token header
        .send(getValidAddressPayload());

      expect(resPost.status).toBe(403);
    });
  });

  describe('4. Address Creation & Field Validation (POST /addresses)', () => {
    it('creates first address and automatically forces isDefault = true', async () => {
      const user = await createTestUser('first-addr@example.com');
      const auth = await loginAndGetCookies(user.email);

      // Submit isDefault: false explicitly; invariant dictates first address must be default
      const payload = getValidAddressPayload({ isDefault: false });

      const res = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.address.isDefault).toBe(true);
      expect(res.body.data.address.phone).toBe('+8801712345678');
      expect(res.body.data.address.divisionNameEn).toBe('Dhaka');
      expect(res.body.data.address.districtNameEn).toBe('Dhaka');

      const count = await prisma.address.count({ where: { userId: user.id } });
      expect(count).toBe(1);
    });

    it('creates subsequent address with isDefault = false preserving existing default', async () => {
      const user = await createTestUser('subsequent-addr@example.com');
      const auth = await loginAndGetCookies(user.email);

      // First address
      const res1 = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ streetAddress: 'First Address' }));
      expect(res1.status).toBe(201);
      expect(res1.body.data.address.isDefault).toBe(true);

      // Second address with isDefault: false
      const res2 = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ streetAddress: 'Second Address', isDefault: false }));
      expect(res2.status).toBe(201);
      expect(res2.body.data.address.isDefault).toBe(false);

      // Verify DB default invariants
      const defaults = await prisma.address.findMany({
        where: { userId: user.id, isDefault: true },
      });
      expect(defaults).toHaveLength(1);
      expect(defaults[0]?.id).toBe(res1.body.data.address.id);
    });

    it('creates subsequent address with isDefault = true atomically demoting previous default', async () => {
      const user = await createTestUser('demote-addr@example.com');
      const auth = await loginAndGetCookies(user.email);

      const res1 = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ streetAddress: 'Old Default' }));
      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ streetAddress: 'New Default', isDefault: true }));
      expect(res2.status).toBe(201);
      expect(res2.body.data.address.isDefault).toBe(true);

      const oldAddr = await prisma.address.findUniqueOrThrow({
        where: { id: res1.body.data.address.id },
      });
      expect(oldAddr.isDefault).toBe(false);

      const defaults = await prisma.address.findMany({
        where: { userId: user.id, isDefault: true },
      });
      expect(defaults).toHaveLength(1);
      expect(defaults[0]?.id).toBe(res2.body.data.address.id);
    });

    it('validates and normalizes all 3 accepted Bangladesh phone formats', async () => {
      const user = await createTestUser('phone-formats@example.com');
      const auth = await loginAndGetCookies(user.email);

      // Format 1: 018XXXXXXXX
      const res1 = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ phone: '01812345678' }));
      expect(res1.status).toBe(201);
      expect(res1.body.data.address.phone).toBe('+8801812345678');

      // Format 2: +88019XXXXXXXX
      const res2 = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ phone: '+8801912345678' }));
      expect(res2.status).toBe(201);
      expect(res2.body.data.address.phone).toBe('+8801912345678');

      // Format 3: 88017XXXXXXXX
      const res3 = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ phone: '8801712345678' }));
      expect(res3.status).toBe(201);
      expect(res3.body.data.address.phone).toBe('+8801712345678');
    });

    it('rejects invalid Bangladesh phone number formats with 400', async () => {
      const user = await createTestUser('invalid-phone-user@example.com');
      const auth = await loginAndGetCookies(user.email);

      const invalidPhones = ['12345', '01212345678', '02712345678', '+14155552671', '0171234567'];
      for (const phone of invalidPhones) {
        const res = await request(app)
          .post('/api/v1/account/addresses')
          .set('Origin', env.FRONTEND_URL)
          .set('Cookie', auth.cookieHeader)
          .set('x-csrf-token', auth.csrfHeader)
          .send(getValidAddressPayload({ phone }));
        expect(res.status).toBe(400);
      }
    });

    it('rejects mismatched division and district on creation with 400 INVALID_GEOGRAPHY', async () => {
      const user = await createTestUser('mismatch-geo@example.com');
      const auth = await loginAndGetCookies(user.email);

      // Gazipur belongs to Dhaka, not Chattogram
      const res = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ divisionId: 'CHATTOGRAM', districtId: 'GAZIPUR' }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('trims custom label and normalizes empty or whitespace label to null', async () => {
      const user = await createTestUser('label-user@example.com');
      const auth = await loginAndGetCookies(user.email);

      // Custom trimmed label
      const res1 = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ label: '  Headquarters Office  ' }));
      expect(res1.status).toBe(201);
      expect(res1.body.data.address.label).toBe('Headquarters Office');

      // Empty whitespace label normalized to null
      const res2 = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ label: '   ' }));
      expect(res2.status).toBe(201);
      expect(res2.body.data.address.label).toBeNull();
    });

    it('validates 4-digit postal code and permits null/omitted postal code', async () => {
      const user = await createTestUser('postal-user@example.com');
      const auth = await loginAndGetCookies(user.email);

      // Valid 4-digit code
      const resValid = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ postalCode: '1216' }));
      expect(resValid.status).toBe(201);
      expect(resValid.body.data.address.postalCode).toBe('1216');

      // Invalid postal code (5 digits or letters)
      const resInvalid = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ postalCode: '12345' }));
      expect(resInvalid.status).toBe(400);

      // Omitted / null postal code
      const resNull = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ postalCode: null }));
      expect(resNull.status).toBe(201);
      expect(resNull.body.data.address.postalCode).toBeNull();
    });
  });

  describe('5. Ownership Isolation (Requirement 3 & 4)', () => {
    it('prevents customer from viewing, modifying, or deleting another customer address', async () => {
      const userA = await createTestUser('user-a@example.com');
      const userB = await createTestUser('user-b@example.com');

      const authA = await loginAndGetCookies(userA.email);
      const authB = await loginAndGetCookies(userB.email);

      // User A creates an address
      const resCreate = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', authA.cookieHeader)
        .set('x-csrf-token', authA.csrfHeader)
        .send(getValidAddressPayload());
      expect(resCreate.status).toBe(201);
      const addressAId = resCreate.body.data.address.id;

      // User B attempts GET
      const resGet = await request(app)
        .get(`/api/v1/account/addresses/${addressAId}`)
        .set('Cookie', authB.cookieHeader);
      expect(resGet.status).toBe(404);
      expect(resGet.body.error.code).toBe('ADDRESS_NOT_FOUND');

      // User B attempts PATCH
      const resPatch = await request(app)
        .patch(`/api/v1/account/addresses/${addressAId}`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', authB.cookieHeader)
        .set('x-csrf-token', authB.csrfHeader)
        .send({ recipientName: 'Malicious Change' });
      expect(resPatch.status).toBe(404);

      // User B attempts PATCH default
      const resDefault = await request(app)
        .patch(`/api/v1/account/addresses/${addressAId}/default`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', authB.cookieHeader)
        .set('x-csrf-token', authB.csrfHeader)
        .send({});
      expect(resDefault.status).toBe(404);

      // User B attempts DELETE
      const resDelete = await request(app)
        .delete(`/api/v1/account/addresses/${addressAId}`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', authB.cookieHeader)
        .set('x-csrf-token', authB.csrfHeader);
      expect(resDelete.status).toBe(404);

      // Confirm User A's address is untouched
      const stillExists = await prisma.address.findUnique({ where: { id: addressAId } });
      expect(stillExists).not.toBeNull();
      expect(stillExists?.recipientName).toBe('Rahim Chowdhury');
    });
  });

  describe('6. Complete Geographical Validation on PATCH (Requirement 1)', () => {
    it('validates resulting division/district pair when updating districtId alone, divisionId alone, or both', async () => {
      const user = await createTestUser('patch-geo@example.com');
      const auth = await loginAndGetCookies(user.email);

      // Create address with DHAKA / DHAKA
      const resCreate = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ divisionId: 'DHAKA', districtId: 'DHAKA' }));
      const addressId = resCreate.body.data.address.id;

      // Case A: Update districtId alone to a valid district for DHAKA (GAZIPUR) -> Succeeds
      const resValidDistrict = await request(app)
        .patch(`/api/v1/account/addresses/${addressId}`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ districtId: 'GAZIPUR' });
      expect(resValidDistrict.status).toBe(200);
      expect(resValidDistrict.body.data.address.districtId).toBe('GAZIPUR');
      expect(resValidDistrict.body.data.address.divisionId).toBe('DHAKA');

      // Case B: Update districtId alone to a district not in DHAKA (COXS_BAZAR) -> 400 INVALID_GEOGRAPHY
      const resInvalidDistrict = await request(app)
        .patch(`/api/v1/account/addresses/${addressId}`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ districtId: 'COXS_BAZAR' });
      expect(resInvalidDistrict.status).toBe(400);
      expect(resInvalidDistrict.body.error.code).toBe('INVALID_GEOGRAPHY');

      // Case C: Update divisionId alone to CHATTOGRAM while stored district is GAZIPUR -> 400 INVALID_GEOGRAPHY
      const resInvalidDivision = await request(app)
        .patch(`/api/v1/account/addresses/${addressId}`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ divisionId: 'CHATTOGRAM' });
      expect(resInvalidDivision.status).toBe(400);
      expect(resInvalidDivision.body.error.code).toBe('INVALID_GEOGRAPHY');

      // Case D: Update both divisionId and districtId simultaneously to matching pair (CHATTOGRAM + COXS_BAZAR) -> Succeeds
      const resValidBoth = await request(app)
        .patch(`/api/v1/account/addresses/${addressId}`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ divisionId: 'CHATTOGRAM', districtId: 'COXS_BAZAR' });
      expect(resValidBoth.status).toBe(200);
      expect(resValidBoth.body.data.address.divisionId).toBe('CHATTOGRAM');
      expect(resValidBoth.body.data.address.districtId).toBe('COXS_BAZAR');
    });
  });

  describe('7. Default Invariants, Promotion & Deterministic Deletion Reallocation', () => {
    it('prohibits unsetting isDefault = false on the current default address via PATCH', async () => {
      const user = await createTestUser('unset-default@example.com');
      const auth = await loginAndGetCookies(user.email);

      const resCreate = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload());
      const addressId = resCreate.body.data.address.id;
      expect(resCreate.body.data.address.isDefault).toBe(true);

      const resUnset = await request(app)
        .patch(`/api/v1/account/addresses/${addressId}`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ isDefault: false });

      expect(resUnset.status).toBe(400);
      expect(resUnset.body.error.code).toBe('CANNOT_UNSET_DEFAULT');
    });

    it('explicit default endpoint promotes target address and demotes previous default', async () => {
      const user = await createTestUser('explicit-default@example.com');
      const auth = await loginAndGetCookies(user.email);

      const addr1 = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ streetAddress: 'First' }));

      const addr2 = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ streetAddress: 'Second', isDefault: false }));

      expect(addr1.body.data.address.isDefault).toBe(true);
      expect(addr2.body.data.address.isDefault).toBe(false);

      // Explicitly promote addr2
      const resPromote = await request(app)
        .patch(`/api/v1/account/addresses/${addr2.body.data.address.id}/default`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({});

      expect(resPromote.status).toBe(200);
      expect(resPromote.body.data.address.isDefault).toBe(true);

      const updated1 = await prisma.address.findUniqueOrThrow({
        where: { id: addr1.body.data.address.id },
      });
      const updated2 = await prisma.address.findUniqueOrThrow({
        where: { id: addr2.body.data.address.id },
      });
      expect(updated1.isDefault).toBe(false);
      expect(updated2.isDefault).toBe(true);
    });

    it('deleting default address reallocates default deterministically: updatedAt DESC, createdAt DESC, id ASC', async () => {
      const user = await createTestUser('deterministic-del@example.com');
      const auth = await loginAndGetCookies(user.email);

      // Create 3 addresses
      const res1 = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ streetAddress: 'Address 1 (Default)' }));

      const res2 = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ streetAddress: 'Address 2' }));

      const res3 = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ streetAddress: 'Address 3' }));

      const id1 = res1.body.data.address.id;
      const id2 = res2.body.data.address.id;
      const id3 = res3.body.data.address.id;

      // Update address 2 so its updatedAt is the most recent among remaining
      await new Promise((r) => setTimeout(r, 50));
      await request(app)
        .patch(`/api/v1/account/addresses/${id2}`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ recipientName: 'Updated Address 2' });

      // Delete default address 1
      const resDel = await request(app)
        .delete(`/api/v1/account/addresses/${id1}`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader);

      expect(resDel.status).toBe(200);
      expect(resDel.body.data.reallocatedDefaultId).toBe(id2);

      const dbAddr2 = await prisma.address.findUniqueOrThrow({ where: { id: id2 } });
      const dbAddr3 = await prisma.address.findUniqueOrThrow({ where: { id: id3 } });
      expect(dbAddr2.isDefault).toBe(true);
      expect(dbAddr3.isDefault).toBe(false);

      // Exactly 1 default in DB
      const defaults = await prisma.address.findMany({
        where: { userId: user.id, isDefault: true },
      });
      expect(defaults).toHaveLength(1);
    });

    it('deleting the sole address leaves user with 0 addresses cleanly', async () => {
      const user = await createTestUser('sole-del@example.com');
      const auth = await loginAndGetCookies(user.email);

      const resCreate = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload());
      const id = resCreate.body.data.address.id;

      const resDel = await request(app)
        .delete(`/api/v1/account/addresses/${id}`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader);

      expect(resDel.status).toBe(200);
      expect(resDel.body.data.reallocatedDefaultId).toBeNull();

      const remaining = await prisma.address.count({ where: { userId: user.id } });
      expect(remaining).toBe(0);
    });
  });

  describe('8. Maximum 10-Address Quota & Boundary Concurrency Races', () => {
    it('enforces maximum 10-address quota sequentially', async () => {
      const user = await createTestUser('quota-user@example.com');
      const auth = await loginAndGetCookies(user.email);

      // Create 10 addresses
      for (let i = 1; i <= 10; i++) {
        const res = await request(app)
          .post('/api/v1/account/addresses')
          .set('Origin', env.FRONTEND_URL)
          .set('Cookie', auth.cookieHeader)
          .set('x-csrf-token', auth.csrfHeader)
          .send(getValidAddressPayload({ streetAddress: `Road ${i}, House ${i}` }));
        expect(res.status).toBe(201);
      }

      const count = await prisma.address.count({ where: { userId: user.id } });
      expect(count).toBe(10);

      // Attempt 11th address
      const res11 = await request(app)
        .post('/api/v1/account/addresses')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send(getValidAddressPayload({ streetAddress: '11th Address' }));

      expect(res11.status).toBe(400);
      expect(res11.body.error.code).toBe('ADDRESS_LIMIT_REACHED');

      const countAfter = await prisma.address.count({ where: { userId: user.id } });
      expect(countAfter).toBe(10);
    });

    it('prevents quota breach during concurrent creation requests at the boundary (count = 9)', async () => {
      const user = await createTestUser('quota-race@example.com');
      const auth = await loginAndGetCookies(user.email);

      // Pre-populate exactly 9 addresses
      for (let i = 1; i <= 9; i++) {
        const resPre = await request(app)
          .post('/api/v1/account/addresses')
          .set('Origin', env.FRONTEND_URL)
          .set('Cookie', auth.cookieHeader)
          .set('x-csrf-token', auth.csrfHeader)
          .send(getValidAddressPayload({ streetAddress: `Pre-populate ${i}` }));
        expect(resPre.status).toBe(201);
      }
      expect(await prisma.address.count({ where: { userId: user.id } })).toBe(9);

      // Issue 5 simultaneous concurrent requests
      const concurrentRequests = Array.from({ length: 5 }, (_, idx) =>
        request(app)
          .post('/api/v1/account/addresses')
          .set('Origin', env.FRONTEND_URL)
          .set('Cookie', auth.cookieHeader)
          .set('x-csrf-token', auth.csrfHeader)
          .send(getValidAddressPayload({ streetAddress: `Concurrent Candidate ${idx + 1}` })),
      );

      const results = await Promise.allSettled(concurrentRequests);

      let successCount = 0;
      let limitReachedCount = 0;

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.status === 201) successCount++;
          if (
            result.value.status === 400 &&
            result.value.body.error?.code === 'ADDRESS_LIMIT_REACHED'
          ) {
            limitReachedCount++;
          }
        }
      }

      // Exactly 1 request must have succeeded to bring count to 10
      expect(successCount).toBe(1);
      expect(limitReachedCount).toBe(4);

      // Verify DB total count is strictly 10
      const finalCount = await prisma.address.count({ where: { userId: user.id } });
      expect(finalCount).toBe(10);
    });

    it('serializes concurrent default promotion requests without violating partial unique index', async () => {
      const user = await createTestUser('concurrent-default@example.com');
      const auth = await loginAndGetCookies(user.email);

      // Create 5 addresses
      const addressIds: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const res = await request(app)
          .post('/api/v1/account/addresses')
          .set('Origin', env.FRONTEND_URL)
          .set('Cookie', auth.cookieHeader)
          .set('x-csrf-token', auth.csrfHeader)
          .send(getValidAddressPayload({ streetAddress: `Address ${i}` }));
        expect(res.status).toBe(201);
        addressIds.push(res.body.data.address.id);
      }

      // Simultaneously promote each of the 5 addresses in parallel
      const promoteRequests = addressIds.map((id) =>
        request(app)
          .patch(`/api/v1/account/addresses/${id}/default`)
          .set('Origin', env.FRONTEND_URL)
          .set('Cookie', auth.cookieHeader)
          .set('x-csrf-token', auth.csrfHeader)
          .send({}),
      );

      const results = await Promise.allSettled(promoteRequests);

      // All 5 should resolve with 200 without throwing 500 or unique constraint errors
      for (const result of results) {
        expect(result.status).toBe('fulfilled');
        if (result.status === 'fulfilled') {
          expect(result.value.status).toBe(200);
        }
      }

      // Final DB check: exactly one address has isDefault = true
      const defaults = await prisma.address.findMany({
        where: { userId: user.id, isDefault: true },
      });
      expect(defaults).toHaveLength(1);
    });
  });
});
