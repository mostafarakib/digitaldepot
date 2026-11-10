import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool, extractCookies } from '../../../test/setup.js';
import { env } from '../../../config/env.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { hashPassword } from '../../../lib/crypto.js';

describe('Admin Inventory API Integration Tests (Phase 4C)', () => {
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
    role: 'CUSTOMER' | 'ADMIN' = 'ADMIN',
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
            firstName: 'Admin',
            lastName: 'Inventory',
            phone: '+8801700000000',
          },
        },
      },
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
    const csrfHeader = (res.headers['x-csrf-token'] as string) || csrfCookieVal.split('=')[1];

    return {
      cookieHeader: `${accessTokenVal}; ${refreshCookieVal}; ${csrfCookieVal}`,
      csrfHeader,
      Origin: env.FRONTEND_URL,
    };
  }

  async function setupCategoryProductAndVariant() {
    const category = await prisma.category.create({
      data: {
        name: 'Monitors',
        slug: 'monitors',
      },
    });

    const product = await prisma.product.create({
      data: {
        name: '4K Gaming Monitor',
        slug: '4k-gaming-monitor',
        categoryId: category.id,
        status: 'DRAFT',
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: 'MON-4K-144HZ',
        name: '27-inch / 144Hz',
        price: 4500000,
        isDefault: true,
        isActive: true,
      },
    });

    const inventoryItem = await prisma.inventoryItem.create({
      data: {
        variantId: variant.id,
        quantity: 20,
        reservedQuantity: 0,
        lowStockThreshold: 5,
      },
    });

    return { category, product, variant, inventoryItem };
  }

  describe('Authorization and Security Protections', () => {
    it('rejects unauthenticated requests to inventory endpoints with 401', async () => {
      const res = await request(app).get('/api/v1/admin/inventory');
      expect(res.status).toBe(401);
    });

    it('rejects CUSTOMER role with 403 Forbidden', async () => {
      await createTestUser('customer@example.com', 'Password123!', 'CUSTOMER');
      const auth = await loginAndGetCookies('customer@example.com');

      const res = await request(app)
        .get('/api/v1/admin/inventory')
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader);

      expect(res.status).toBe(403);
    });

    it('rejects inventory adjustment without CSRF token with 403', async () => {
      await createTestUser('admin-csrf@example.com', 'Password123!', 'ADMIN');
      const auth = await loginAndGetCookies('admin-csrf@example.com');
      const { variant } = await setupCategoryProductAndVariant();

      const res = await request(app)
        .post('/api/v1/admin/inventory/adjust')
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader)
        // Omit x-csrf-token header
        .send({
          variantId: variant.id,
          type: 'RECEIVE',
          quantityDelta: 10,
          reason: 'Test missing CSRF',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('Validation & Adjustment Type Rules (Requirement 2)', () => {
    it('rejects adjustment with zero quantity delta', async () => {
      await createTestUser('admin-val@example.com', 'Password123!', 'ADMIN');
      const auth = await loginAndGetCookies('admin-val@example.com');
      const { variant } = await setupCategoryProductAndVariant();

      const res = await request(app)
        .post('/api/v1/admin/inventory/adjust')
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          variantId: variant.id,
          type: 'RECEIVE',
          quantityDelta: 0,
          reason: 'Zero delta test',
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.details?.quantityDelta?.[0]).toContain('delta cannot be zero');
    });

    it('rejects negative delta for RECEIVE type', async () => {
      await createTestUser('admin-val2@example.com', 'Password123!', 'ADMIN');
      const auth = await loginAndGetCookies('admin-val2@example.com');
      const { variant } = await setupCategoryProductAndVariant();

      const res = await request(app)
        .post('/api/v1/admin/inventory/adjust')
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          variantId: variant.id,
          type: 'RECEIVE',
          quantityDelta: -5,
          reason: 'Negative receive test',
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.details?.quantityDelta?.[0]).toContain(
        'RECEIVE adjustments require a positive quantity delta',
      );
    });

    it('rejects positive delta for DAMAGE type', async () => {
      await createTestUser('admin-val3@example.com', 'Password123!', 'ADMIN');
      const auth = await loginAndGetCookies('admin-val3@example.com');
      const { variant } = await setupCategoryProductAndVariant();

      const res = await request(app)
        .post('/api/v1/admin/inventory/adjust')
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          variantId: variant.id,
          type: 'DAMAGE',
          quantityDelta: 5,
          reason: 'Positive damage test',
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.details?.quantityDelta?.[0]).toContain(
        'DAMAGE adjustments require a negative quantity delta',
      );
    });

    it('rejects missing or short reason', async () => {
      await createTestUser('admin-val4@example.com', 'Password123!', 'ADMIN');
      const auth = await loginAndGetCookies('admin-val4@example.com');
      const { variant } = await setupCategoryProductAndVariant();

      const res = await request(app)
        .post('/api/v1/admin/inventory/adjust')
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          variantId: variant.id,
          type: 'RECEIVE',
          quantityDelta: 5,
          reason: '  ',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Admin Inventory Endpoints & Lifecycle Flow', () => {
    it('executes adjustment, updates stock, and records audit trail with user attribution', async () => {
      const admin = await createTestUser('admin-flow@example.com', 'Password123!', 'ADMIN');
      const auth = await loginAndGetCookies('admin-flow@example.com');
      const { variant } = await setupCategoryProductAndVariant();

      // 1. Fetch inventory overview
      const listRes = await request(app)
        .get('/api/v1/admin/inventory')
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.items).toHaveLength(1);
      expect(listRes.body.data.items[0].quantity).toBe(20);
      expect(listRes.body.data.summary.totalOnHandUnits).toBe(20);

      // 2. Adjust stock (+15 RECEIVE)
      const adjustRes = await request(app)
        .post('/api/v1/admin/inventory/adjust')
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          variantId: variant.id,
          type: 'RECEIVE',
          quantityDelta: 15,
          reason: 'Received shipment from supplier',
        });

      expect(adjustRes.status).toBe(200);
      expect(adjustRes.body.data.item.quantity).toBe(35);
      expect(adjustRes.body.data.adjustment.oldQuantity).toBe(20);
      expect(adjustRes.body.data.adjustment.newQuantity).toBe(35);
      expect(adjustRes.body.data.adjustment.adjustedByUser.email).toBe(admin.email);

      // 3. Fetch variant adjustment history
      const historyRes = await request(app)
        .get(`/api/v1/admin/inventory/variant/${variant.id}/history`)
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader);

      expect(historyRes.status).toBe(200);
      expect(historyRes.body.data.adjustments).toHaveLength(1);
      expect(historyRes.body.data.adjustments[0].type).toBe('RECEIVE');
      expect(historyRes.body.data.adjustments[0].quantityDelta).toBe(15);
      expect(historyRes.body.data.adjustments[0].adjustedByUser.email).toBe(admin.email);

      // 4. Update threshold
      const thresholdRes = await request(app)
        .patch(`/api/v1/admin/inventory/variant/${variant.id}/threshold`)
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ lowStockThreshold: 12 });

      expect(thresholdRes.status).toBe(200);
      expect(thresholdRes.body.data.lowStockThreshold).toBe(12);

      // 5. Fetch single variant stock
      const getRes = await request(app)
        .get(`/api/v1/admin/inventory/variant/${variant.id}`)
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.quantity).toBe(35);
      expect(getRes.body.data.lowStockThreshold).toBe(12);
    });
  });
});
