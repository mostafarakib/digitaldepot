import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool, extractCookies } from '../../../test/setup.js';
import { env } from '../../../config/env.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { hashPassword } from '../../../lib/crypto.js';

describe('Admin Product & Variant API Integration Tests (Phase 4B)', () => {
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
            lastName: 'User',
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

  async function setupCategory() {
    return await prisma.category.create({
      data: {
        name: 'Computing',
        slug: 'computing',
        isActive: true,
      },
    });
  }

  describe('Authorization and Security Protections', () => {
    it('rejects unauthenticated requests to admin product endpoints with 401', async () => {
      const res = await request(app).get('/api/v1/admin/products');
      expect(res.status).toBe(401);
    });

    it('rejects CUSTOMER role with 403 Forbidden', async () => {
      await createTestUser('customer@example.com', 'Password123!', 'CUSTOMER');
      const auth = await loginAndGetCookies('customer@example.com');

      const res = await request(app)
        .get('/api/v1/admin/products')
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader);

      expect(res.status).toBe(403);
    });

    it('rejects mutations missing CSRF token with 403 Forbidden', async () => {
      await createTestUser('admin@example.com', 'Password123!', 'ADMIN');
      const auth = await loginAndGetCookies('admin@example.com');
      const category = await setupCategory();

      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader)
        // Omit x-csrf-token
        .send({
          name: 'No CSRF Laptop',
          categoryId: category.id,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('Admin Product Endpoints & Flow', () => {
    it('creates, retrieves, updates, and publishes a product with variants and images', async () => {
      await createTestUser('admin@example.com', 'Password123!', 'ADMIN');
      const auth = await loginAndGetCookies('admin@example.com');
      const category = await setupCategory();

      // 1. Create product with initial variant in poisha
      const createRes = await request(app)
        .post('/api/v1/admin/products')
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          name: 'MacBook Pro 14',
          categoryId: category.id,
          summary: 'M3 Pro laptop',
          featured: true,
          initialVariant: {
            sku: 'mbp-14-m3',
            price: 24999900, // ৳249,999 in poisha
          },
        });

      expect(createRes.status).toBe(201);
      const product = createRes.body.data;
      expect(product.name).toBe('MacBook Pro 14');
      expect(product.slug).toBe('macbook-pro-14');
      expect(product.status).toBe('DRAFT');
      expect(product.variants).toHaveLength(1);
      expect(product.variants[0].sku).toBe('MBP-14-M3');

      // 2. Add an image
      const imgRes = await request(app)
        .post(`/api/v1/admin/products/${product.id}/images`)
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          url: 'https://res.cloudinary.com/demo/image/upload/v1/mbp.jpg',
          altText: 'MacBook Pro 14 front view',
          isPrimary: true,
        });

      expect(imgRes.status).toBe(201);
      expect(imgRes.body.data.isPrimary).toBe(true);

      // 3. Check publication gate
      const checkRes = await request(app)
        .get(`/api/v1/admin/products/${product.id}/check-publish`)
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader);

      expect(checkRes.status).toBe(200);
      expect(checkRes.body.data.canPublish).toBe(true);

      // 4. Publish the product
      const pubRes = await request(app)
        .post(`/api/v1/admin/products/${product.id}/publish`)
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader);

      expect(pubRes.status).toBe(200);
      expect(pubRes.body.data.status).toBe('PUBLISHED');

      // 5. Update variant price and verify price history endpoint
      const variantId = product.variants[0].id;
      const patchVarRes = await request(app)
        .patch(`/api/v1/admin/variants/${variantId}`)
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          price: 23999900, // ৳239,999 in poisha
          reason: 'Holiday markdown',
        });

      expect(patchVarRes.status).toBe(200);
      expect(patchVarRes.body.data.price).toBe(23999900);

      const historyRes = await request(app)
        .get(`/api/v1/admin/variants/${variantId}/price-history`)
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader);

      expect(historyRes.status).toBe(200);
      expect(historyRes.body.data).toHaveLength(2);
      expect(historyRes.body.data[0].newPrice).toBe(23999900);
      expect(historyRes.body.data[0].reason).toBe('Holiday markdown');

      // 6. Attempt deleting variant with price history: must return 409 Conflict
      const deleteVarRes = await request(app)
        .delete(`/api/v1/admin/variants/${variantId}`)
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader);

      expect(deleteVarRes.status).toBe(409);
      expect(deleteVarRes.body.error.code).toBe('VARIANT_HAS_PRICE_HISTORY');

      // 7. Archive the product
      const archiveRes = await request(app)
        .post(`/api/v1/admin/products/${product.id}/archive`)
        .set('Origin', auth.Origin)
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfHeader);

      expect(archiveRes.status).toBe(200);
      expect(archiveRes.body.data.status).toBe('ARCHIVED');
    });
  });
});
