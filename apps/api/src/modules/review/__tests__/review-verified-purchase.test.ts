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
    quantity = 1,
  ) {
    let address = await prisma.address.findFirst({
      where: { userId },
    });

    if (!address) {
      address = await prisma.address.create({
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
    }

    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    });

    // Create cart
    await prisma.cart.upsert({
      where: { userId },
      create: {
        userId,
        items: {
          create: { variantId, quantity, unitPriceAtAdd: variant.price },
        },
      },
      update: {
        items: {
          create: { variantId, quantity, unitPriceAtAdd: variant.price },
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

    const fullOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });

    return fullOrder;
  }

  async function createReturnForOrder(params: {
    orderId: string;
    userId: string;
    orderItemId: string;
    quantity: number;
    status: 'REQUESTED' | 'APPROVED' | 'RECEIVED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
  }) {
    const returnNumber = `RET-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
    return await prisma.returnRequest.create({
      data: {
        returnNumber,
        orderId: params.orderId,
        userId: params.userId,
        status: params.status,
        customerReason: 'Defective item',
        estimatedRefundAmount: params.quantity * 50000,
        actualRefundAmount: params.status === 'COMPLETED' ? params.quantity * 50000 : null,
        items: {
          create: {
            orderItemId: params.orderItemId,
            quantity: params.quantity,
            reason: 'Defective item',
            condition:
              params.status === 'RECEIVED' || params.status === 'COMPLETED' ? 'GOOD' : null,
          },
        },
        statusHistory: {
          create: [
            { fromStatus: null, toStatus: 'REQUESTED', reason: 'Customer requested' },
            ...(params.status !== 'REQUESTED'
              ? [
                  {
                    fromStatus: 'REQUESTED' as const,
                    toStatus: params.status,
                    reason: 'Transitioned',
                  },
                ]
              : []),
          ],
        },
      },
      include: {
        items: true,
      },
    });
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

  // -------------------------------------------------------------------------
  // Phase 7E: Return & Refund Review Eligibility Integration Tests
  // -------------------------------------------------------------------------
  describe('Phase 7E: Return & Refund Review Eligibility Integration', () => {
    it('maintains isVerifiedPurchase: true when return is in progress (REQUESTED, APPROVED, or RECEIVED)', async () => {
      const { user, customerCookie } = await createCustomer('in-progress-return@example.com');
      const product = await createPublishedProduct();
      const order = await createOrderForCustomer(user.id, product.variants[0].id, 'DELIVERED', 2);
      const orderItem = order.items[0];

      // 1. Return in REQUESTED status
      const ret = await createReturnForOrder({
        orderId: order.id,
        userId: user.id,
        orderItemId: orderItem.id,
        quantity: 2,
        status: 'REQUESTED',
      });

      const resRequested = await request(app)
        .post(`/api/v1/products/${product.slug}/reviews`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({
          rating: 4,
          comment: 'Return is requested, but purchased unit was delivered.',
        });

      expect(resRequested.status).toBe(201);
      expect(resRequested.body.data.isVerifiedPurchase).toBe(true);

      // 2. Return transitions to APPROVED
      await prisma.returnRequest.update({
        where: { id: ret.id },
        data: { status: 'APPROVED' },
      });

      const resApproved = await request(app)
        .post(`/api/v1/products/${product.slug}/reviews`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({
          rating: 4,
          comment: 'Return is approved, updating feedback.',
        });

      expect(resApproved.status).toBe(201);
      expect(resApproved.body.data.isVerifiedPurchase).toBe(true);

      // 3. Return transitions to RECEIVED (inspected, but refund not finalized yet)
      await prisma.returnRequest.update({
        where: { id: ret.id },
        data: { status: 'RECEIVED' },
      });

      const resReceived = await request(app)
        .post(`/api/v1/products/${product.slug}/reviews`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({
          rating: 4,
          comment: 'Return is received at warehouse, still not completed.',
        });

      expect(resReceived.status).toBe(201);
      expect(resReceived.body.data.isVerifiedPurchase).toBe(true);
    });

    it('maintains isVerifiedPurchase: true when return was REJECTED or CANCELLED', async () => {
      const { user, customerCookie } = await createCustomer('disapproved-return@example.com');
      const product = await createPublishedProduct();
      const order = await createOrderForCustomer(user.id, product.variants[0].id, 'DELIVERED', 2);
      const orderItem = order.items[0];

      // Return was REJECTED
      await createReturnForOrder({
        orderId: order.id,
        userId: user.id,
        orderItemId: orderItem.id,
        quantity: 2,
        status: 'REJECTED',
      });

      const res = await request(app)
        .post(`/api/v1/products/${product.slug}/reviews`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({
          rating: 4,
          comment: 'Return was rejected, customer retained items.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.isVerifiedPurchase).toBe(true);
    });

    it('maintains isVerifiedPurchase: true when order item is partially returned (COMPLETED)', async () => {
      const { user, customerCookie } = await createCustomer('partial-return@example.com');
      const product = await createPublishedProduct();
      // Bought 3 units
      const order = await createOrderForCustomer(user.id, product.variants[0].id, 'DELIVERED', 3);
      const orderItem = order.items[0];

      // Completed return for 2 units (1 unit remains delivered and kept)
      await createReturnForOrder({
        orderId: order.id,
        userId: user.id,
        orderItemId: orderItem.id,
        quantity: 2,
        status: 'COMPLETED',
      });

      const res = await request(app)
        .post(`/api/v1/products/${product.slug}/reviews`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({
          rating: 5,
          comment: 'Returned 2 damaged units, kept 1 good unit. Still an authentic buyer!',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.isVerifiedPurchase).toBe(true);
    });

    it('sets isVerifiedPurchase: false when order item is fully returned (COMPLETED) without rejecting review submission', async () => {
      const { user, customerCookie } = await createCustomer('full-return@example.com');
      const product = await createPublishedProduct();
      // Bought 2 units
      const order = await createOrderForCustomer(user.id, product.variants[0].id, 'DELIVERED', 2);
      const orderItem = order.items[0];

      // Completed return for all 2 units
      await createReturnForOrder({
        orderId: order.id,
        userId: user.id,
        orderItemId: orderItem.id,
        quantity: 2,
        status: 'COMPLETED',
      });

      // Customer may still submit review, but it will be saved with isVerifiedPurchase = false
      const res = await request(app)
        .post(`/api/v1/products/${product.slug}/reviews`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({
          rating: 2,
          comment: 'Returned all items because it was not suitable. Still able to leave review.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.isVerifiedPurchase).toBe(false);

      const dbReview = await prisma.productReview.findUniqueOrThrow({
        where: {
          userId_productId: {
            userId: user.id,
            productId: product.id,
          },
        },
      });
      expect(dbReview.isVerifiedPurchase).toBe(false);
    });

    it('sets isVerifiedPurchase: false when multiple COMPLETED returns accumulate to full item quantity', async () => {
      const { user, customerCookie } = await createCustomer('multi-return@example.com');
      const product = await createPublishedProduct();
      // Bought 2 units
      const order = await createOrderForCustomer(user.id, product.variants[0].id, 'DELIVERED', 2);
      const orderItem = order.items[0];

      // Return 1: 1 unit COMPLETED
      await createReturnForOrder({
        orderId: order.id,
        userId: user.id,
        orderItemId: orderItem.id,
        quantity: 1,
        status: 'COMPLETED',
      });

      // Submit review after first partial return -> 1 unit remains -> isVerifiedPurchase: true
      const res1 = await request(app)
        .post(`/api/v1/products/${product.slug}/reviews`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({
          rating: 4,
          comment: 'Kept one unit, returned one.',
        });
      expect(res1.status).toBe(201);
      expect(res1.body.data.isVerifiedPurchase).toBe(true);

      // Return 2: second unit COMPLETED (net remaining = 0)
      await createReturnForOrder({
        orderId: order.id,
        userId: user.id,
        orderItemId: orderItem.id,
        quantity: 1,
        status: 'COMPLETED',
      });

      // Customer edits review after returning second unit -> isVerifiedPurchase becomes false
      const res2 = await request(app)
        .post(`/api/v1/products/${product.slug}/reviews`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({
          rating: 2,
          comment: 'Eventually returned the second unit as well.',
        });
      expect(res2.status).toBe(201);
      expect(res2.body.data.isVerifiedPurchase).toBe(false);
    });

    it('maintains isVerifiedPurchase: true across multiple orders when one is fully returned but another delivered order remains', async () => {
      const { user, customerCookie } = await createCustomer('multi-order-buyer@example.com');
      const product = await createPublishedProduct();

      // Order 1: 1 unit delivered, fully returned COMPLETED (net = 0)
      const order1 = await createOrderForCustomer(user.id, product.variants[0].id, 'DELIVERED', 1);
      await createReturnForOrder({
        orderId: order1.id,
        userId: user.id,
        orderItemId: order1.items[0].id,
        quantity: 1,
        status: 'COMPLETED',
      });

      // Order 2: 1 unit delivered, NOT returned (net = 1)
      await createOrderForCustomer(user.id, product.variants[0].id, 'DELIVERED', 1);

      const res = await request(app)
        .post(`/api/v1/products/${product.slug}/reviews`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({
          rating: 5,
          comment: 'First order was returned, but reordered and this one is fantastic!',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.isVerifiedPurchase).toBe(true);
    });

    it('preserves existing review verified status and moderation state upon return completion (no retroactive mutation)', async () => {
      const { user, customerCookie } = await createCustomer('retroactive-invariant@example.com');
      const product = await createPublishedProduct();
      const order = await createOrderForCustomer(user.id, product.variants[0].id, 'DELIVERED', 1);

      // Customer writes review while item is delivered and kept
      const reviewRes = await request(app)
        .post(`/api/v1/products/${product.slug}/reviews`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({
          rating: 5,
          comment: 'Loved it initially!',
        });
      expect(reviewRes.status).toBe(201);
      expect(reviewRes.body.data.isVerifiedPurchase).toBe(true);

      // Admin moderates review to APPROVED
      await prisma.productReview.update({
        where: { id: reviewRes.body.data.id },
        data: { status: 'APPROVED' },
      });

      // Now customer requests and completes full return
      await createReturnForOrder({
        orderId: order.id,
        userId: user.id,
        orderItemId: order.items[0].id,
        quantity: 1,
        status: 'COMPLETED',
      });

      // Verify that the existing review in database was NOT retroactively mutated
      const dbReview = await prisma.productReview.findUniqueOrThrow({
        where: { id: reviewRes.body.data.id },
      });
      expect(dbReview.isVerifiedPurchase).toBe(true);
      expect(dbReview.status).toBe('APPROVED');
    });

    it('updates isVerifiedPurchase to false and reverts status to PENDING when customer edits review after full return', async () => {
      const { user, customerCookie } = await createCustomer('edit-after-return@example.com');
      const product = await createPublishedProduct();
      const order = await createOrderForCustomer(user.id, product.variants[0].id, 'DELIVERED', 1);

      // Initial review while delivered
      await request(app)
        .post(`/api/v1/products/${product.slug}/reviews`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({
          rating: 5,
          comment: 'Loved it initially!',
        });

      // Full return completed
      await createReturnForOrder({
        orderId: order.id,
        userId: user.id,
        orderItemId: order.items[0].id,
        quantity: 1,
        status: 'COMPLETED',
      });

      // Customer edits review after return
      const editRes = await request(app)
        .post(`/api/v1/products/${product.slug}/reviews`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({
          rating: 2,
          comment: 'Broke after a week, returned for full refund.',
        });

      expect(editRes.status).toBe(201);
      expect(editRes.body.data.isVerifiedPurchase).toBe(false);
      expect(editRes.body.data.status).toBe('PENDING'); // Reverted to PENDING for moderation

      const dbReview = await prisma.productReview.findUniqueOrThrow({
        where: { id: editRes.body.data.id },
      });
      expect(dbReview.isVerifiedPurchase).toBe(false);
      expect(dbReview.status).toBe('PENDING');
    });
  });
});
