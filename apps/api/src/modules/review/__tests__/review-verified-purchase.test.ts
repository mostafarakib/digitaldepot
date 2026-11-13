import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool } from '../../../test/setup.js';
import { env } from '../../../config/env.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { hashPassword, signAccessToken } from '../../../lib/crypto.js';
import { categoryService } from '../../catalogue/category.service.js';
import { productService } from '../../catalogue/product.service.js';
import { orderService } from '../../order/order.service.js';

describe('Phase 6D: Verified-Purchase Review Integration API', () => {
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
            firstName: 'Rahim',
            lastName: 'Chowdhury',
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

  async function createPublishedProduct() {
    const suffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const category = await categoryService.create({
      name: `Category ${suffix}`,
      slug: `cat-${suffix}`,
      isActive: true,
    });

    const product = await productService.create({
      name: `Product ${suffix}`,
      summary: 'Test product summary',
      categoryId: category.id,
      initialVariant: {
        sku: `SKU-${suffix}`,
        price: 50000,
        initialStock: 20,
      },
    });

    await prisma.product.update({
      where: { id: product.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });

    const fullProduct = await productService.getById(product.id);
    return fullProduct;
  }

  async function createOrderForCustomer(
    userId: string,
    variantId: string,
    status: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED',
  ) {
    const address = await prisma.address.create({
      data: {
        userId,
        recipientName: 'Rahim Chowdhury',
        phone: '+8801700000001',
        divisionId: 'DHAKA',
        districtId: 'DHAKA',
        upazila: 'Dhanmondi',
        streetAddress: 'House 1, Road 2',
        postalCode: '1205',
        isDefault: true,
      },
    });

    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    });

    // Create cart
    await prisma.cart.upsert({
      where: { userId },
      create: {
        userId,
        items: {
          create: { variantId, quantity: 1, unitPriceAtAdd: variant.price },
        },
      },
      update: {
        items: {
          create: { variantId, quantity: 1, unitPriceAtAdd: variant.price },
        },
      },
    });

    const order = await orderService.createOrderCore({
      userId,
      addressId: address.id,
      paymentMethod: 'COD',
    });

    // Update to requested status
    if (status !== 'CONFIRMED') {
      await prisma.order.update({
        where: { id: order.id },
        data: { status },
      });
    }

    return order;
  }

  it('marks review as isVerifiedPurchase: true when customer has an eligible DELIVERED order for the product', async () => {
    const { user, customerCookie } = await createCustomer('delivered-buyer@example.com');
    const product = await createPublishedProduct();

    await createOrderForCustomer(user.id, product.variants[0].id, 'DELIVERED');

    const res = await request(app)
      .post(`/api/v1/products/${product.slug}/reviews`)
      .set('Origin', env.FRONTEND_URL)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', `${csrfCookie}; ${customerCookie}`)
      .send({
        rating: 5,
        title: 'Authentic buyer review',
        comment: 'Received the item and it is wonderful!',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.isVerifiedPurchase).toBe(true);

    // Verify stored in DB
    const dbReview = await prisma.productReview.findUniqueOrThrow({
      where: {
        userId_productId: {
          userId: user.id,
          productId: product.id,
        },
      },
    });
    expect(dbReview.isVerifiedPurchase).toBe(true);
  });

  it('marks review as isVerifiedPurchase: false when order is undelivered (e.g. CONFIRMED, SHIPPED, or CANCELLED)', async () => {
    const { user, customerCookie } = await createCustomer('undelivered-buyer@example.com');
    const product = await createPublishedProduct();

    // Order is only SHIPPED, not DELIVERED
    await createOrderForCustomer(user.id, product.variants[0].id, 'SHIPPED');

    const res = await request(app)
      .post(`/api/v1/products/${product.slug}/reviews`)
      .set('Origin', env.FRONTEND_URL)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', `${csrfCookie}; ${customerCookie}`)
      .send({
        rating: 4,
        comment: 'Still waiting on delivery, but looking forward to it.',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.isVerifiedPurchase).toBe(false);
  });

  it('marks review as isVerifiedPurchase: false when customer never purchased the product', async () => {
    const { customerCookie } = await createCustomer('non-buyer@example.com');
    const product = await createPublishedProduct();

    const res = await request(app)
      .post(`/api/v1/products/${product.slug}/reviews`)
      .set('Origin', env.FRONTEND_URL)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', `${csrfCookie}; ${customerCookie}`)
      .send({
        rating: 3,
        comment: 'Saw this at a friend place. Pretty decent.',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.isVerifiedPurchase).toBe(false);
  });

  it('updates an unverified review to isVerifiedPurchase: true if updated after receiving delivery', async () => {
    const { user, customerCookie } = await createCustomer('evolving-buyer@example.com');
    const product = await createPublishedProduct();

    // First: submit review before delivery
    const initialRes = await request(app)
      .post(`/api/v1/products/${product.slug}/reviews`)
      .set('Origin', env.FRONTEND_URL)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', `${csrfCookie}; ${customerCookie}`)
      .send({
        rating: 3,
        comment: 'Ordered it, eagerly waiting!',
      });
    expect(initialRes.body.data.isVerifiedPurchase).toBe(false);

    // Second: order arrives and transitions to DELIVERED
    await createOrderForCustomer(user.id, product.variants[0].id, 'DELIVERED');

    // Third: customer edits their review
    const updatedRes = await request(app)
      .post(`/api/v1/products/${product.slug}/reviews`)
      .set('Origin', env.FRONTEND_URL)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', `${csrfCookie}; ${customerCookie}`)
      .send({
        rating: 5,
        title: 'Arrived safely!',
        comment: 'Now delivered, absolutely top quality and works as described.',
      });

    expect(updatedRes.status).toBe(201);
    expect(updatedRes.body.data.isVerifiedPurchase).toBe(true);

    const dbReview = await prisma.productReview.findUniqueOrThrow({
      where: {
        userId_productId: {
          userId: user.id,
          productId: product.id,
        },
      },
    });
    expect(dbReview.isVerifiedPurchase).toBe(true);
  });

  it('includes isVerifiedPurchase flag in getProductReviews currentUserReview object', async () => {
    const { user, customerCookie } = await createCustomer('query-reviewer@example.com');
    const product = await createPublishedProduct();

    await createOrderForCustomer(user.id, product.variants[0].id, 'DELIVERED');

    await request(app)
      .post(`/api/v1/products/${product.slug}/reviews`)
      .set('Origin', env.FRONTEND_URL)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', `${csrfCookie}; ${customerCookie}`)
      .send({
        rating: 5,
        comment: 'Verified purchase feedback.',
      });

    const reviewsRes = await request(app)
      .get(`/api/v1/products/${product.slug}/reviews`)
      .set('Cookie', customerCookie);

    expect(reviewsRes.status).toBe(200);
    expect(reviewsRes.body.data.currentUserReview).not.toBeNull();
    expect(reviewsRes.body.data.currentUserReview.isVerifiedPurchase).toBe(true);
  });

  it('executes eligibility verification and review write within the same database transaction', async () => {
    const { user, customerCookie } = await createCustomer('tx-reviewer@example.com');
    const product = await createPublishedProduct();

    await createOrderForCustomer(user.id, product.variants[0].id, 'DELIVERED');

    const txSpy = vi.spyOn(prisma, '$transaction');

    const res = await request(app)
      .post(`/api/v1/products/${product.slug}/reviews`)
      .set('Origin', env.FRONTEND_URL)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', `${csrfCookie}; ${customerCookie}`)
      .send({
        rating: 5,
        comment: 'Transaction integrity test comment.',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.isVerifiedPurchase).toBe(true);
    expect(txSpy).toHaveBeenCalled();

    txSpy.mockRestore();
  });
});
