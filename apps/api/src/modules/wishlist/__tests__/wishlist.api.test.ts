import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool } from '../../../test/setup.js';
import { env } from '../../../config/env.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { hashPassword, signAccessToken } from '../../../lib/crypto.js';
import { categoryService } from '../../catalogue/category.service.js';
import { brandService } from '../../catalogue/brand.service.js';
import { productService } from '../../catalogue/product.service.js';
import { imageService } from '../../catalogue/image.service.js';

describe('Phase 5D: Customer Wishlist API', () => {
  let csrfToken: string;
  let csrfCookie: string;

  beforeEach(async () => {
    await cleanDatabase();
    csrfToken = generateCsrfToken();
    csrfCookie = `${COOKIE_NAMES.CSRF_TOKEN}=${csrfToken}`;
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPool.end();
  });

  async function createCustomer(email: string) {
    const passwordHash = await hashPassword('CustPass123!');
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
        profile: {
          create: {
            firstName: 'Test',
            lastName: 'Customer',
            phone: '+8801700000001',
          },
        },
      },
    });

    const now = new Date();
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        reauthenticatedAt: now,
        lastUsedAt: now,
      },
    });

    const accessToken = await signAccessToken({
      sub: user.id,
      sid: session.id,
    });

    const customerCookie = `${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`;
    return { user, customerCookie };
  }

  async function createPublishedProduct(params?: {
    categoryActive?: boolean;
    brandActive?: boolean;
    status?: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
  }) {
    const suffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const category = await categoryService.create({
      name: `Cat ${suffix}`,
      slug: `cat-${suffix}`,
      isActive: params?.categoryActive ?? true,
    });

    let brandId: string | undefined;
    if (params?.brandActive !== undefined) {
      const brand = await brandService.create({
        name: `Brand ${suffix}`,
        slug: `brand-${suffix}`,
        isActive: params.brandActive,
      });
      brandId = brand.id;
    }

    const product = await productService.create({
      name: `Product ${suffix}`,
      summary: 'Product summary',
      categoryId: category.id,
      brandId,
      initialVariant: {
        sku: `SKU-${suffix}`,
        price: 500000,
        initialStock: 10,
      },
    });

    await imageService.add(product.id, {
      url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      altText: 'Sample Image',
      isPrimary: true,
    });

    if (params?.status === 'DRAFT') {
      // already draft
    } else if (params?.status === 'ARCHIVED') {
      await productService.publish(product.id);
      await productService.archive(product.id);
    } else {
      // default PUBLISHED
      if (params?.categoryActive !== false && params?.brandActive !== false) {
        await productService.publish(product.id);
      }
    }

    return { product, category };
  }

  describe('1. Wishlist Retrieval & Addition', () => {
    it('returns empty wishlist when customer has not added any products', async () => {
      const { customerCookie } = await createCustomer('cust1@example.com');

      const res = await request(app)
        .get('/api/v1/wishlist')
        .set('Cookie', `${csrfCookie}; ${customerCookie}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.productIds).toEqual([]);
      expect(res.body.data.itemCount).toBe(0);
    });

    it('adds a published product to wishlist with populated metadata', async () => {
      const { customerCookie } = await createCustomer('cust2@example.com');
      const { product } = await createPublishedProduct();

      const addRes = await request(app)
        .post('/api/v1/wishlist')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ productId: product.id });

      expect(addRes.status).toBe(201);
      expect(addRes.body.success).toBe(true);
      expect(addRes.body.data.productId).toBe(product.id);

      const getRes = await request(app)
        .get('/api/v1/wishlist')
        .set('Cookie', `${csrfCookie}; ${customerCookie}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.itemCount).toBe(1);
      expect(getRes.body.data.productIds).toEqual([product.id]);
      expect(getRes.body.data.items[0].product.id).toBe(product.id);
      expect(getRes.body.data.items[0].product.name).toBe(product.name);
      expect(getRes.body.data.items[0].product.isStorefrontVisible).toBe(true);
      expect(getRes.body.data.items[0].product.minPrice).toBe(500000);
    });

    it('prevents duplicate entries via idempotent upsert', async () => {
      const { customerCookie } = await createCustomer('cust3@example.com');
      const { product } = await createPublishedProduct();

      // Add once
      const add1 = await request(app)
        .post('/api/v1/wishlist')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ productId: product.id });
      expect(add1.status).toBe(201);

      // Add second time (idempotent)
      const add2 = await request(app)
        .post('/api/v1/wishlist')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ productId: product.id });
      expect(add2.status).toBe(201);

      // Verify only 1 row exists
      const getRes = await request(app)
        .get('/api/v1/wishlist')
        .set('Cookie', `${csrfCookie}; ${customerCookie}`);

      expect(getRes.body.data.itemCount).toBe(1);
      expect(getRes.body.data.items).toHaveLength(1);
    });
  });

  describe('2. Storefront Publication Visibility Enforcement (Clarification #1)', () => {
    it('rejects adding a DRAFT product with 404 PRODUCT_NOT_FOUND', async () => {
      const { customerCookie } = await createCustomer('cust-draft@example.com');
      const { product } = await createPublishedProduct({ status: 'DRAFT' });

      const res = await request(app)
        .post('/api/v1/wishlist')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ productId: product.id });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('rejects adding a product whose category is inactive with 404 PRODUCT_NOT_FOUND', async () => {
      const { customerCookie } = await createCustomer('cust-cat-inactive@example.com');
      const { product } = await createPublishedProduct({ categoryActive: false });

      const res = await request(app)
        .post('/api/v1/wishlist')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ productId: product.id });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('rejects adding a product whose brand is inactive with 404 PRODUCT_NOT_FOUND', async () => {
      const { customerCookie } = await createCustomer('cust-brand-inactive@example.com');
      const { product } = await createPublishedProduct({ brandActive: true });

      // Deactivate brand after publication
      await brandService.update(product.brandId!, { isActive: false });

      const res = await request(app)
        .post('/api/v1/wishlist')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ productId: product.id });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('rejects adding a product with zero active variants with 404 PRODUCT_NOT_FOUND', async () => {
      const { customerCookie } = await createCustomer('cust-no-variant@example.com');
      const { product } = await createPublishedProduct();

      // Deactivate all variants directly in database
      await prisma.productVariant.updateMany({
        where: { productId: product.id },
        data: { isActive: false },
      });

      const res = await request(app)
        .post('/api/v1/wishlist')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ productId: product.id });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });
  });

  describe('3. Customer Isolation & Deletion', () => {
    it('isolates wishlists between different customers', async () => {
      const { customerCookie: cookieA } = await createCustomer('custA@example.com');
      const { customerCookie: cookieB } = await createCustomer('custB@example.com');
      const { product } = await createPublishedProduct();

      await request(app)
        .post('/api/v1/wishlist')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${cookieA}`)
        .send({ productId: product.id });

      // Customer B's wishlist must remain empty
      const resB = await request(app)
        .get('/api/v1/wishlist')
        .set('Cookie', `${csrfCookie}; ${cookieB}`);

      expect(resB.body.data.itemCount).toBe(0);
      expect(resB.body.data.productIds).toEqual([]);
    });

    it('removes product from customer wishlist', async () => {
      const { customerCookie } = await createCustomer('cust-del@example.com');
      const { product } = await createPublishedProduct();

      await request(app)
        .post('/api/v1/wishlist')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ productId: product.id });

      const delRes = await request(app)
        .delete(`/api/v1/wishlist/${product.id}`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      const getRes = await request(app)
        .get('/api/v1/wishlist')
        .set('Cookie', `${csrfCookie}; ${customerCookie}`);

      expect(getRes.body.data.itemCount).toBe(0);
    });

    it('allows removal of a wishlisted product even if it later became inactive', async () => {
      const { customerCookie } = await createCustomer('cust-inactive-del@example.com');
      const { product, category } = await createPublishedProduct();

      // Added while active
      await request(app)
        .post('/api/v1/wishlist')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ productId: product.id });

      // Later, category is deactivated
      await categoryService.update(category.id, { isActive: false });

      // Customer should still be able to remove it cleanly
      const delRes = await request(app)
        .delete(`/api/v1/wishlist/${product.id}`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
    });
  });

  describe('4. Security & Authentication Enforcements', () => {
    it('rejects unauthenticated requests with 401 AUTHENTICATION_REQUIRED', async () => {
      const getRes = await request(app).get('/api/v1/wishlist');
      expect(getRes.status).toBe(401);
      expect(getRes.body.error.code).toBe('AUTHENTICATION_REQUIRED');

      const postRes = await request(app)
        .post('/api/v1/wishlist')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ productId: 'clsample12345678901234567' });

      expect(postRes.status).toBe(401);
    });

    it('enforces CSRF protection on POST and DELETE operations', async () => {
      const { customerCookie } = await createCustomer('cust-csrf@example.com');
      const { product } = await createPublishedProduct();

      // Missing CSRF token
      const resWithoutCsrf = await request(app)
        .post('/api/v1/wishlist')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ productId: product.id });

      expect(resWithoutCsrf.status).toBe(403);
    });
  });
});
