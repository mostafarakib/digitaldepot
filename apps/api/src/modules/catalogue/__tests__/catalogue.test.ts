import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool, extractCookies } from '../../../test/setup.js';
import { env } from '../../../config/env.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { hashPassword } from '../../../lib/crypto.js';

describe('Catalogue Foundation & Backend API Integration Tests (Phase 4A)', () => {
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
    const csrfHeader = res.headers['x-csrf-token'] || csrfCookieVal.split('=')[1];

    return {
      cookieHeader: `${accessTokenVal}; ${refreshCookieVal}; ${csrfCookieVal}`,
      csrfHeader,
      Origin: env.FRONTEND_URL,
    };
  }

  describe('1. Role-Based Access Control and Authorization', () => {
    it('rejects unauthenticated requests to admin category endpoints with 401', async () => {
      const res = await request(app).get('/api/v1/admin/categories');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects customer role requests to admin category endpoints with 403', async () => {
      await createTestUser('customer@example.com', 'Password123!', 'CUSTOMER');
      const auth = await loginAndGetCookies('customer@example.com');

      const res = await request(app)
        .get('/api/v1/admin/categories')
        .set('Cookie', auth.cookieHeader);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('permits admin role requests to admin category endpoints', async () => {
      await createTestUser('admin@example.com', 'Password123!', 'ADMIN');
      const auth = await loginAndGetCookies('admin@example.com');

      const res = await request(app)
        .get('/api/v1/admin/categories')
        .set('Cookie', auth.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('enforces CSRF protection on state-changing admin category mutations', async () => {
      await createTestUser('admin@example.com', 'Password123!', 'ADMIN');
      const auth = await loginAndGetCookies('admin@example.com');

      // POST without x-csrf-token
      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Cookie', auth.cookieHeader)
        .set('Origin', env.FRONTEND_URL)
        .send({ name: 'Smartphones' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_MISSING');
    });
  });

  describe('2. Category Admin CRUD and Hierarchy Endpoints', () => {
    it('creates a root category and a subcategory with auto-generated slugs', async () => {
      await createTestUser('admin@example.com', 'Password123!', 'ADMIN');
      const auth = await loginAndGetCookies('admin@example.com');

      // Create root
      const rootRes = await request(app)
        .post('/api/v1/admin/categories')
        .set('Cookie', auth.cookieHeader)
        .set('Origin', auth.Origin)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          name: 'Computers & Laptops',
          description: 'Desktops, laptops, and accessories',
          displayOrder: 1,
        });

      expect(rootRes.status).toBe(201);
      expect(rootRes.body.data.name).toBe('Computers & Laptops');
      expect(rootRes.body.data.slug).toBe('computers-laptops');
      expect(rootRes.body.data.parentId).toBeNull();

      const rootId = rootRes.body.data.id;

      // Create subcategory
      const childRes = await request(app)
        .post('/api/v1/admin/categories')
        .set('Cookie', auth.cookieHeader)
        .set('Origin', auth.Origin)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          name: 'Gaming Laptops',
          parentId: rootId,
          displayOrder: 0,
        });

      expect(childRes.status).toBe(201);
      expect(childRes.body.data.name).toBe('Gaming Laptops');
      expect(childRes.body.data.parentId).toBe(rootId);
      expect(childRes.body.data.parent.name).toBe('Computers & Laptops');
    });

    it('rejects self-parenting and descendant cycles with 400 CATEGORY_CYCLE_DETECTED', async () => {
      await createTestUser('admin@example.com', 'Password123!', 'ADMIN');
      const auth = await loginAndGetCookies('admin@example.com');

      const c1Res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Cookie', auth.cookieHeader)
        .set('Origin', auth.Origin)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ name: 'Node A', slug: 'node-a' });

      const c1Id = c1Res.body.data.id;

      const c2Res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Cookie', auth.cookieHeader)
        .set('Origin', auth.Origin)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ name: 'Node B', slug: 'node-b', parentId: c1Id });

      const c2Id = c2Res.body.data.id;

      // 1. Self-parenting
      const selfRes = await request(app)
        .patch(`/api/v1/admin/categories/${c1Id}`)
        .set('Cookie', auth.cookieHeader)
        .set('Origin', auth.Origin)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ parentId: c1Id });

      expect(selfRes.status).toBe(400);
      expect(selfRes.body.error.code).toBe('CATEGORY_CYCLE_DETECTED');

      // 2. Descendant cycle: assign Node B as parent of Node A
      const cycleRes = await request(app)
        .patch(`/api/v1/admin/categories/${c1Id}`)
        .set('Cookie', auth.cookieHeader)
        .set('Origin', auth.Origin)
        .set('x-csrf-token', auth.csrfHeader)
        .send({ parentId: c2Id });

      expect(cycleRes.status).toBe(400);
      expect(cycleRes.body.error.code).toBe('CATEGORY_CYCLE_DETECTED');
    });

    it('reorders categories in bulk transactionally', async () => {
      await createTestUser('admin@example.com', 'Password123!', 'ADMIN');
      const auth = await loginAndGetCookies('admin@example.com');

      const c1 = await prisma.category.create({
        data: { name: 'Cat A', slug: 'cat-a', displayOrder: 0 },
      });
      const c2 = await prisma.category.create({
        data: { name: 'Cat B', slug: 'cat-b', displayOrder: 1 },
      });

      const reorderRes = await request(app)
        .patch('/api/v1/admin/categories/reorder')
        .set('Cookie', auth.cookieHeader)
        .set('Origin', auth.Origin)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          items: [
            { id: c1.id, displayOrder: 10 },
            { id: c2.id, displayOrder: 20 },
          ],
        });

      expect(reorderRes.status).toBe(200);
      expect(reorderRes.body.data.count).toBe(2);

      const checkC1 = await prisma.category.findUnique({ where: { id: c1.id } });
      expect(checkC1?.displayOrder).toBe(10);
    });

    it('prevents deletion of category that contains subcategories with 409', async () => {
      await createTestUser('admin@example.com', 'Password123!', 'ADMIN');
      const auth = await loginAndGetCookies('admin@example.com');

      const parent = await prisma.category.create({ data: { name: 'Parent', slug: 'parent' } });
      await prisma.category.create({ data: { name: 'Child', slug: 'child', parentId: parent.id } });

      const deleteRes = await request(app)
        .delete(`/api/v1/admin/categories/${parent.id}`)
        .set('Cookie', auth.cookieHeader)
        .set('Origin', auth.Origin)
        .set('x-csrf-token', auth.csrfHeader);

      expect(deleteRes.status).toBe(409);
      expect(deleteRes.body.error.code).toBe('CATEGORY_HAS_CHILDREN');
    });
  });

  describe('3. Public Storefront Catalogue Endpoints', () => {
    it('GET /api/v1/categories/tree returns active categories in tree structure without auth', async () => {
      const activeParent = await prisma.category.create({
        data: { name: 'Active Parent', slug: 'active-parent', isActive: true, displayOrder: 0 },
      });
      await prisma.category.create({
        data: {
          name: 'Active Child',
          slug: 'active-child',
          parentId: activeParent.id,
          isActive: true,
          displayOrder: 0,
        },
      });
      await prisma.category.create({
        data: { name: 'Inactive Category', slug: 'inactive-cat', isActive: false, displayOrder: 1 },
      });

      const res = await request(app).get('/api/v1/categories/tree');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].slug).toBe('active-parent');
      expect(res.body.data[0].children).toHaveLength(1);
      expect(res.body.data[0].children[0].slug).toBe('active-child');
    });

    it('GET /api/v1/categories/:slug returns category detail by slug and 404 for inactive', async () => {
      await prisma.category.create({
        data: { name: 'Smartphones', slug: 'smartphones', isActive: true },
      });
      await prisma.category.create({
        data: { name: 'Secret Category', slug: 'secret', isActive: false },
      });

      const activeRes = await request(app).get('/api/v1/categories/smartphones');
      expect(activeRes.status).toBe(200);
      expect(activeRes.body.data.name).toBe('Smartphones');

      const inactiveRes = await request(app).get('/api/v1/categories/secret');
      expect(inactiveRes.status).toBe(404);
    });
  });

  describe('4. Brand Admin and Public Endpoints', () => {
    it('manages Brand lifecycle via Admin API', async () => {
      await createTestUser('admin@example.com', 'Password123!', 'ADMIN');
      const auth = await loginAndGetCookies('admin@example.com');

      // Create brand
      const createRes = await request(app)
        .post('/api/v1/admin/brands')
        .set('Cookie', auth.cookieHeader)
        .set('Origin', auth.Origin)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          name: 'Apple Inc',
          slug: 'apple',
          websiteUrl: 'https://www.apple.com',
          isActive: true,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.slug).toBe('apple');
      const brandId = createRes.body.data.id;

      // Update brand
      const updateRes = await request(app)
        .patch(`/api/v1/admin/brands/${brandId}`)
        .set('Cookie', auth.cookieHeader)
        .set('Origin', auth.Origin)
        .set('x-csrf-token', auth.csrfHeader)
        .send({
          name: 'Apple',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.name).toBe('Apple');

      // Public active list
      const publicListRes = await request(app).get('/api/v1/brands');
      expect(publicListRes.status).toBe(200);
      expect(publicListRes.body.data.some((b: { slug: string }) => b.slug === 'apple')).toBe(true);

      // Public get by slug
      const publicSlugRes = await request(app).get('/api/v1/brands/apple');
      expect(publicSlugRes.status).toBe(200);
      expect(publicSlugRes.body.data.name).toBe('Apple');

      // Delete brand
      const deleteRes = await request(app)
        .delete(`/api/v1/admin/brands/${brandId}`)
        .set('Cookie', auth.cookieHeader)
        .set('Origin', auth.Origin)
        .set('x-csrf-token', auth.csrfHeader);

      expect(deleteRes.status).toBe(200);
    });
  });
});
