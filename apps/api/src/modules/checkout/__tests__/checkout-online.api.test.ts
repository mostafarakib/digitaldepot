import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase } from '../../../test/setup.js';
import { env } from '../../../config/env.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { signAccessToken } from '../../../lib/crypto.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { productService } from '../../catalogue/product.service.js';
import { categoryService } from '../../catalogue/category.service.js';
import { brandService } from '../../catalogue/brand.service.js';
import { sslcommerzService } from '../../payment/sslcommerz.service.js';

describe('Phase 6C: SSLCommerz Sandbox Online Checkout API', () => {
  let csrfToken: string;
  let csrfCookie: string;

  beforeEach(async () => {
    await cleanDatabase();
    csrfToken = generateCsrfToken();
    csrfCookie = `${COOKIE_NAMES.CSRF_TOKEN}=${csrfToken}`;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createCustomer(email = 'online-checkout-user@example.com', emailVerified = true) {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'argon2id$mockpasswordhash',
        role: 'CUSTOMER',
        emailVerified,
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
      summary: 'Product for online checkout test',
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
        .post('/api/v1/checkout/online')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ addressId: 'some-address' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects unverified customers with 403 EMAIL_NOT_VERIFIED', async () => {
      const { customerCookie } = await createCustomer('unverified-online@example.com', false);

      const res = await request(app)
        .post('/api/v1/checkout/online')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: 'some-address' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('rejects requests with missing or invalid CSRF token with 403', async () => {
      const { customerCookie } = await createCustomer('csrf-online@example.com', true);

      // Missing CSRF
      const resMissing = await request(app)
        .post('/api/v1/checkout/online')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', customerCookie)
        .send({ addressId: 'some-address' });

      expect(resMissing.status).toBe(403);
      expect(resMissing.body.error.code).toBe('CSRF_TOKEN_MISSING');

      // Malformed CSRF
      const resMalformed = await request(app)
        .post('/api/v1/checkout/online')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', 'malformed-token')
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: 'some-address' });

      expect(resMalformed.status).toBe(403);
      expect(resMalformed.body.error.code).toBe('CSRF_TOKEN_MALFORMED');
    });
  });

  describe('2. Online Order Placement & 30-Minute Reservation', () => {
    it('creates online order, reserves stock for 30m, and returns gateway redirect URL', async () => {
      const { user, customerCookie } = await createCustomer('online-success@example.com');
      const { variant } = await createPublishedProduct({ initialPrice: 150000, initialStock: 10 });
      const address = await createCustomerAddress(user.id, { districtId: 'DHAKA' });

      // Create coupon
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

      // Prepare user cart with 2 items and coupon
      await prisma.cart.create({
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

      // Mock SSLCommerz session initiation
      const initiateSpy = vi.spyOn(sslcommerzService, 'initiateSession').mockResolvedValue({
        status: 'SUCCESS',
        gatewayUrl: 'https://sandbox.sslcommerz.com/EasyCheckOut/mock-session-123',
        sessionKey: 'mock-session-key',
      });

      const res = await request(app)
        .post('/api/v1/checkout/online')
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
      expect(res.body.data.gatewayUrl).toBe(
        'https://sandbox.sslcommerz.com/EasyCheckOut/mock-session-123',
      );
      expect(res.headers['x-csrf-token']).toBeDefined();

      const orderData = res.body.data.order;
      expect(orderData.status).toBe('PENDING');
      expect(orderData.paymentStatus).toBe('PENDING');
      expect(orderData.paymentMethod).toBe('SSLCOMMERZ');
      expect(orderData.totalPayable).toBe(286000); // 300,000 subtotal - 20,000 coupon + 6,000 shipping

      // Verify SSLCommerz initiation was called with correct parameters outside transaction
      expect(initiateSpy).toHaveBeenCalledTimes(1);
      const callArg = initiateSpy.mock.calls[0][0];
      expect(callArg.order.orderNumber).toBe(orderData.orderNumber);
      expect(callArg.customerEmail).toBe('online-success@example.com');

      // Verify Database: Stock was RESERVED (not physically deducted)
      const inventory = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(inventory.quantity).toBe(10); // Physical stock NOT decremented yet!
      expect(inventory.reservedQuantity).toBe(2); // Reserved for 30 minutes!

      // Verify order payment expiration window
      const dbOrder = await prisma.order.findUniqueOrThrow({
        where: { id: orderData.id },
        include: { payments: true, statusHistory: true },
      });
      expect(dbOrder.paymentExpiresAt).not.toBeNull();
      const expiresAt = new Date(dbOrder.paymentExpiresAt!).getTime();
      const thirtyMinutesFromNow = Date.now() + 30 * 60 * 1000;
      expect(Math.abs(expiresAt - thirtyMinutesFromNow)).toBeLessThan(10000); // within 10s

      // Verify Cart was emptied
      const userCart = await prisma.cart.findUnique({
        where: { userId: user.id },
        include: { items: true },
      });
      expect(userCart?.items).toHaveLength(0);
      expect(userCart?.couponId).toBeNull();
    });
  });

  describe('3. Business Rule Guards & Price Acknowledgement', () => {
    it('rejects empty cart with 400 EMPTY_CART', async () => {
      const { user, customerCookie } = await createCustomer('empty-online@example.com');
      const address = await createCustomerAddress(user.id);

      const res = await request(app)
        .post('/api/v1/checkout/online')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: address.id });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EMPTY_CART');
    });

    it('rejects an addressId belonging to another customer with 400 INVALID_ADDRESS', async () => {
      const { user, customerCookie } = await createCustomer('address-online@example.com');
      const { user: stranger } = await createCustomer('stranger-online@example.com');
      const foreignAddress = await createCustomerAddress(stranger.id);
      const { variant } = await createPublishedProduct({ initialPrice: 100000, initialStock: 5 });

      await prisma.cart.create({
        data: {
          userId: user.id,
          items: { create: { variantId: variant.id, quantity: 1, unitPriceAtAdd: 100000 } },
        },
      });

      const res = await request(app)
        .post('/api/v1/checkout/online')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: foreignAddress.id });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ADDRESS');
    });

    it('rejects price change without acknowledgement, succeeds when acknowledged', async () => {
      const { user, customerCookie } = await createCustomer('price-online@example.com');
      const { variant } = await createPublishedProduct({ initialPrice: 100000, initialStock: 5 });
      const address = await createCustomerAddress(user.id);

      await prisma.cart.create({
        data: {
          userId: user.id,
          items: { create: { variantId: variant.id, quantity: 1, unitPriceAtAdd: 100000 } },
        },
      });

      // Price increases from ৳1,000 to ৳1,200
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { price: 120000 },
      });

      // 1. Submit without acknowledgement -> 400 PRICE_CHANGE_ACKNOWLEDGEMENT_REQUIRED
      const resWithoutAck = await request(app)
        .post('/api/v1/checkout/online')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: address.id, acknowledgedLivePrices: false });

      expect(resWithoutAck.status).toBe(400);
      expect(resWithoutAck.body.error.code).toBe('PRICE_CHANGE_ACKNOWLEDGEMENT_REQUIRED');

      // 2. Submit with acknowledgement -> 201 Created
      vi.spyOn(sslcommerzService, 'initiateSession').mockResolvedValue({
        status: 'SUCCESS',
        gatewayUrl: 'https://sandbox.sslcommerz.com/mock-gw',
        sessionKey: 'key',
      });

      const resWithAck = await request(app)
        .post('/api/v1/checkout/online')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: address.id, acknowledgedLivePrices: true });

      expect(resWithAck.status).toBe(201);
      expect(resWithAck.body.data.order.merchandiseSubtotal).toBe(120000);
    });
  });

  describe('4. Gateway Session Initiation Failure & Compensation (Clarification 3)', () => {
    it('compensates and cancels order when SSLCommerz session initiation fails', async () => {
      const { user, customerCookie } = await createCustomer('compensation-user@example.com');
      const { variant } = await createPublishedProduct({ initialPrice: 100000, initialStock: 5 });
      const address = await createCustomerAddress(user.id);

      // Create coupon
      const now = new Date();
      const coupon = await prisma.coupon.create({
        data: {
          code: 'COMP50',
          discountType: 'FIXED_AMOUNT',
          discountValue: 5000,
          startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          isActive: true,
        },
      });

      await prisma.cart.create({
        data: {
          userId: user.id,
          couponId: coupon.id,
          items: { create: { variantId: variant.id, quantity: 2, unitPriceAtAdd: 100000 } },
        },
      });

      // Mock SSLCommerz gateway initiation failure
      vi.spyOn(sslcommerzService, 'initiateSession').mockRejectedValue(
        new Error('SSLCommerz gateway timeout'),
      );

      const res = await request(app)
        .post('/api/v1/checkout/online')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: address.id });

      // Returns 502 Bad Gateway
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('PAYMENT_INITIATION_FAILED');

      // Verify Compensation: Order is CANCELLED, Payment is FAILED
      const createdOrder = await prisma.order.findFirst({
        where: { userId: user.id },
        include: { payments: true, statusHistory: true },
      });
      expect(createdOrder).not.toBeNull();
      expect(createdOrder?.status).toBe('CANCELLED');
      expect(createdOrder?.paymentStatus).toBe('FAILED');
      expect(createdOrder?.payments[0].status).toBe('FAILED');

      // Verify Reserved Stock was RELEASED (0 reserved)
      const inventory = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(inventory.reservedQuantity).toBe(0);
      expect(inventory.quantity).toBe(5);

      // Verify Coupon was RELEASED idempotently
      const couponUsage = await prisma.couponUsage.count({
        where: { couponId: coupon.id, userId: user.id },
      });
      expect(couponUsage).toBe(0);
    });
  });
});
