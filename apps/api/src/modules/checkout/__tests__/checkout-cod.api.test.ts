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

describe('Phase 6B: Cash on Delivery (COD) Checkout & Confirmation API', () => {
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

  async function createCustomer(email: string, emailVerified = true) {
    const passwordHash = await hashPassword('CustPass123!');
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified,
        profile: {
          create: {
            firstName: 'Tanvir',
            lastName: 'Ahmed',
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
    initialPrice?: number;
    initialStock?: number;
  }) {
    const suffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const category = await categoryService.create({
      name: `Category ${suffix}`,
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
      summary: 'Product for COD checkout test',
      categoryId: category.id,
      brandId,
      initialVariant: {
        sku: `SKU-${suffix}`,
        price: params?.initialPrice ?? 100000, // ৳1,000
        initialStock: params?.initialStock ?? 20,
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
    const variant = fullProduct.variants[0];

    return { product, variant, category };
  }

  async function createCustomerAddress(
    userId: string,
    params?: { districtId?: string; isDefault?: boolean },
  ) {
    return prisma.address.create({
      data: {
        userId,
        recipientName: 'Tanvir Ahmed',
        phone: '+8801700000001',
        divisionId: 'DHAKA',
        districtId: params?.districtId ?? 'DHAKA',
        upazila: 'Dhanmondi',
        streetAddress: 'House 12, Road 4',
        postalCode: '1205',
        isDefault: params?.isDefault ?? false,
      },
    });
  }

  describe('1. Authentication, Verification & CSRF Gates', () => {
    it('rejects unauthenticated requests with 401 AUTHENTICATION_REQUIRED', async () => {
      const res = await request(app)
        .post('/api/v1/checkout/cod')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ addressId: 'some-address' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects unverified customers with 403 EMAIL_NOT_VERIFIED', async () => {
      const { customerCookie } = await createCustomer('unverified-cod@example.com', false);

      const res = await request(app)
        .post('/api/v1/checkout/cod')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: 'some-address' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('rejects requests with missing or invalid CSRF token with 403', async () => {
      const { customerCookie } = await createCustomer('csrf-cod@example.com', true);

      // Missing CSRF token
      const resMissing = await request(app)
        .post('/api/v1/checkout/cod')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', customerCookie)
        .send({ addressId: 'some-address' });

      expect(resMissing.status).toBe(403);
      expect(resMissing.body.error.code).toBe('CSRF_TOKEN_MISSING');

      // Malformed CSRF token
      const resMalformed = await request(app)
        .post('/api/v1/checkout/cod')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', 'invalid-csrf-token')
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: 'some-address' });

      expect(resMalformed.status).toBe(403);
      expect(resMalformed.body.error.code).toBe('CSRF_TOKEN_MALFORMED');
    });
  });

  describe('2. Authoritative COD Order Placement', () => {
    it('successfully places a COD order: returns 201, commits inventory, consumes coupon, and empties cart', async () => {
      const { user, customerCookie } = await createCustomer('cod-success@example.com');
      const { variant } = await createPublishedProduct({ initialPrice: 150000, initialStock: 10 });
      const address = await createCustomerAddress(user.id, { districtId: 'DHAKA' });

      // Create coupon (৳200 discount)
      const now = new Date();
      const coupon = await prisma.coupon.create({
        data: {
          code: 'SAVE200',
          discountType: 'FIXED_AMOUNT',
          discountValue: 20000,
          startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          isActive: true,
        },
      });

      // Prepare user cart with 2 items and applied coupon
      const cart = await prisma.cart.create({
        data: {
          userId: user.id,
          couponId: coupon.id,
          items: {
            create: {
              variantId: variant.id,
              quantity: 2,
              unitPriceAtAdd: 150000,
            },
          },
        },
      });

      const res = await request(app)
        .post('/api/v1/checkout/cod')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({
          addressId: address.id,
          deliveryNotes: 'Call upon arrival',
          alternativePhone: '+8801812345678',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const orderData = res.body.data.order;
      expect(orderData.orderNumber).toMatch(/^DD-[0-9]{8}-[0-9A-Z]{8}$/);
      expect(orderData.status).toBe('CONFIRMED');
      expect(orderData.paymentStatus).toBe('PENDING');
      expect(orderData.paymentMethod).toBe('COD');

      // Financials: Subtotal = 300,000; Discount = 20,000; Shipping (Dhaka) = 6,000; Total = 286,000
      expect(orderData.merchandiseSubtotal).toBe(300000);
      expect(orderData.discountAmount).toBe(20000);
      expect(orderData.shippingFee).toBe(6000);
      expect(orderData.totalPayable).toBe(286000);

      // Address snapshot
      expect(orderData.shippingAddress.recipientName).toBe('Tanvir Ahmed');
      expect(orderData.shippingAddress.deliveryNotes).toBe('Call upon arrival');
      expect(orderData.shippingAddress.alternativePhone).toBe('+8801812345678');

      // Item snapshot
      expect(orderData.items).toHaveLength(1);
      expect(orderData.items[0].unitPrice).toBe(150000);
      expect(orderData.items[0].quantity).toBe(2);
      expect(orderData.items[0].lineTotal).toBe(300000);

      // Verify Database state
      const dbOrder = await prisma.order.findUniqueOrThrow({
        where: { id: orderData.id },
        include: { items: true, payments: true, statusHistory: true },
      });
      expect(dbOrder.paymentExpiresAt).toBeNull(); // No 30-min window for COD
      expect(dbOrder.payments).toHaveLength(1);
      expect(dbOrder.payments[0].status).toBe('PENDING');
      expect(dbOrder.payments[0].amount).toBe(286000);
      expect(dbOrder.statusHistory).toHaveLength(1);
      expect(dbOrder.statusHistory[0].toStatus).toBe('CONFIRMED');

      // Verify physical stock deduction & audit log
      const inventory = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(inventory.quantity).toBe(8); // 10 - 2
      expect(inventory.reservedQuantity).toBe(0);

      const adjustments = await prisma.inventoryAdjustment.findMany({
        where: { inventoryItemId: inventory.id },
        orderBy: { createdAt: 'desc' },
      });
      const fulfillmentAdjustment = adjustments.find((a) => a.type === 'ORDER_FULFILLMENT');
      expect(fulfillmentAdjustment).toBeDefined();
      expect(fulfillmentAdjustment?.quantityDelta).toBe(-2);
      expect(fulfillmentAdjustment?.adjustedByUserId).toBe(user.id);

      // Verify coupon usage
      const updatedCoupon = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
      expect(updatedCoupon.usageCount).toBe(1);

      const usage = await prisma.couponUsage.findFirst({ where: { orderId: dbOrder.id } });
      expect(usage).not.toBeNull();
      expect(usage?.userId).toBe(user.id);

      // Verify customer cart items cleared and coupon removed
      const cartItems = await prisma.cartItem.findMany({ where: { cartId: cart.id } });
      expect(cartItems).toHaveLength(0);

      const freshCart = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(freshCart.couponId).toBeNull();
    });
  });

  describe('3. Business Rule Guards & Failures', () => {
    it('rejects empty cart with 400 EMPTY_CART', async () => {
      const { user, customerCookie } = await createCustomer('empty-cod@example.com');
      const address = await createCustomerAddress(user.id);

      const res = await request(app)
        .post('/api/v1/checkout/cod')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: address.id });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EMPTY_CART');
    });

    it('rejects an addressId belonging to another customer with 400 INVALID_ADDRESS', async () => {
      const { user, customerCookie } = await createCustomer('victim-cod@example.com');
      const { user: stranger } = await createCustomer('stranger-cod@example.com');
      const strangerAddress = await createCustomerAddress(stranger.id);

      const { variant } = await createPublishedProduct();
      await prisma.cart.create({
        data: {
          userId: user.id,
          items: {
            create: { variantId: variant.id, quantity: 1, unitPriceAtAdd: 100000 },
          },
        },
      });

      const res = await request(app)
        .post('/api/v1/checkout/cod')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: strangerAddress.id });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ADDRESS');
    });

    it('rejects price change without acknowledgement, succeeds when acknowledged', async () => {
      const { user, customerCookie } = await createCustomer('price-change-cod@example.com');
      const { variant } = await createPublishedProduct({ initialPrice: 100000 });
      const address = await createCustomerAddress(user.id);

      await prisma.cart.create({
        data: {
          userId: user.id,
          items: {
            create: { variantId: variant.id, quantity: 1, unitPriceAtAdd: 100000 },
          },
        },
      });

      // Price changed live in catalogue
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { price: 130000 },
      });

      // Without acknowledgement
      const unackRes = await request(app)
        .post('/api/v1/checkout/cod')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: address.id, acknowledgedLivePrices: false });

      expect(unackRes.status).toBe(400);
      expect(unackRes.body.error.code).toBe('PRICE_CHANGE_ACKNOWLEDGEMENT_REQUIRED');

      // With acknowledgement
      const ackRes = await request(app)
        .post('/api/v1/checkout/cod')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: address.id, acknowledgedLivePrices: true });

      expect(ackRes.status).toBe(201);
      expect(ackRes.body.data.order.items[0].unitPrice).toBe(130000);
      expect(ackRes.body.data.order.merchandiseSubtotal).toBe(130000);
    });

    it('rejects out of stock item with 400 INSUFFICIENT_STOCK', async () => {
      const { user, customerCookie } = await createCustomer('oos-cod@example.com');
      const { variant } = await createPublishedProduct({ initialStock: 1 });
      const address = await createCustomerAddress(user.id);

      await prisma.cart.create({
        data: {
          userId: user.id,
          items: {
            create: { variantId: variant.id, quantity: 5, unitPriceAtAdd: 100000 },
          },
        },
      });

      const res = await request(app)
        .post('/api/v1/checkout/cod')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: address.id });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    });
  });

  describe('4. Concurrency & Duplicate Submission Protection (Clarification 1)', () => {
    it('serializes concurrent checkout requests: exactly one succeeds, second fails with EMPTY_CART', async () => {
      const { user, customerCookie } = await createCustomer('concurrent-cod@example.com');
      const { variant } = await createPublishedProduct({ initialPrice: 100000, initialStock: 5 });
      const address = await createCustomerAddress(user.id);

      await prisma.cart.create({
        data: {
          userId: user.id,
          items: {
            create: { variantId: variant.id, quantity: 2, unitPriceAtAdd: 100000 },
          },
        },
      });

      // Fire two concurrent checkout submissions from the same user
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/checkout/cod')
          .set('Origin', env.FRONTEND_URL)
          .set('x-csrf-token', csrfToken)
          .set('Cookie', `${csrfCookie}; ${customerCookie}`)
          .send({ addressId: address.id }),
        request(app)
          .post('/api/v1/checkout/cod')
          .set('Origin', env.FRONTEND_URL)
          .set('x-csrf-token', csrfToken)
          .set('Cookie', `${csrfCookie}; ${customerCookie}`)
          .send({ addressId: address.id }),
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(201);
      expect(statuses).toContain(400);

      const failedRes = res1.status === 400 ? res1 : res2;
      expect(failedRes.body.error.code).toBe('EMPTY_CART');

      // Verify only ONE order was created
      const orders = await prisma.order.findMany({ where: { userId: user.id } });
      expect(orders).toHaveLength(1);

      // Verify stock was decremented exactly once (5 - 2 = 3)
      const inventory = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(inventory.quantity).toBe(3);
    });
  });

  describe('5. Order Confirmation Endpoint (Clarification 2)', () => {
    it('returns confirmed order details for the owner', async () => {
      const { user, customerCookie } = await createCustomer('owner-confirm@example.com');
      const { variant } = await createPublishedProduct();
      const address = await createCustomerAddress(user.id);

      await prisma.cart.create({
        data: {
          userId: user.id,
          items: {
            create: { variantId: variant.id, quantity: 1, unitPriceAtAdd: 100000 },
          },
        },
      });

      const placeRes = await request(app)
        .post('/api/v1/checkout/cod')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: address.id });

      const orderNumber = placeRes.body.data.order.orderNumber;

      const confirmRes = await request(app)
        .get(`/api/v1/checkout/orders/${orderNumber}/confirmation`)
        .set('Cookie', customerCookie);

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.success).toBe(true);
      expect(confirmRes.body.data.order.orderNumber).toBe(orderNumber);
      expect(confirmRes.body.data.order.status).toBe('CONFIRMED');
      expect(confirmRes.body.data.order.paymentMethod).toBe('COD');
      expect(confirmRes.body.data.order.items).toHaveLength(1);
    });

    it('returns 404 ORDER_NOT_FOUND when order does not exist', async () => {
      const { customerCookie } = await createCustomer('nonexist-confirm@example.com');

      const res = await request(app)
        .get('/api/v1/checkout/orders/DD-20261111-NONEXIST/confirmation')
        .set('Cookie', customerCookie);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    });

    it('returns 404 ORDER_NOT_FOUND when requesting another customer order', async () => {
      const { user: owner, customerCookie: ownerCookie } =
        await createCustomer('owner2@example.com');
      const { customerCookie: strangerCookie } = await createCustomer('stranger2@example.com');

      const { variant } = await createPublishedProduct();
      const address = await createCustomerAddress(owner.id);

      await prisma.cart.create({
        data: {
          userId: owner.id,
          items: {
            create: { variantId: variant.id, quantity: 1, unitPriceAtAdd: 100000 },
          },
        },
      });

      const placeRes = await request(app)
        .post('/api/v1/checkout/cod')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${ownerCookie}`)
        .send({ addressId: address.id });

      const orderNumber = placeRes.body.data.order.orderNumber;

      // Stranger tries to view owner's order
      const strangerRes = await request(app)
        .get(`/api/v1/checkout/orders/${orderNumber}/confirmation`)
        .set('Cookie', strangerCookie);

      expect(strangerRes.status).toBe(404);
      expect(strangerRes.body.error.code).toBe('ORDER_NOT_FOUND');
    });
  });
});
