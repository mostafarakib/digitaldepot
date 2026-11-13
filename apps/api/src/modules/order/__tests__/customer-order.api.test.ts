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
import { productService } from '../../catalogue/product.service.js';
import { orderService } from '../order.service.js';

describe('Phase 6D: Customer Order History, Order Details & Cancellation API', () => {
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

  async function createPublishedProduct(params?: { initialPrice?: number; initialStock?: number }) {
    const suffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const category = await categoryService.create({
      name: `Category ${suffix}`,
      slug: `cat-${suffix}`,
      isActive: true,
    });

    const product = await productService.create({
      name: `Product ${suffix}`,
      summary: 'Product for order test',
      categoryId: category.id,
      initialVariant: {
        sku: `SKU-${suffix}`,
        price: params?.initialPrice ?? 50000,
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

    return { product: fullProduct, variant, category };
  }

  async function createCustomerAddress(userId: string) {
    return prisma.address.create({
      data: {
        userId,
        recipientName: 'Tanvir Ahmed',
        phone: '+8801700000001',
        divisionId: 'DHAKA',
        districtId: 'DHAKA',
        upazila: 'Dhanmondi',
        streetAddress: 'House 12, Road 5',
        postalCode: '1205',
        isDefault: true,
      },
    });
  }

  async function setupCustomerWithOrder(params?: {
    email?: string;
    paymentMethod?: 'COD' | 'SSLCOMMERZ';
    status?: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
    paymentStatus?: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
    initialPrice?: number;
    initialStock?: number;
    quantity?: number;
  }) {
    const { user, customerCookie } = await createCustomer(params?.email || 'customer@example.com');
    const address = await createCustomerAddress(user.id);
    const { product, variant } = await createPublishedProduct({
      initialPrice: params?.initialPrice,
      initialStock: params?.initialStock,
    });

    // Create cart
    const cart = await prisma.cart.create({
      data: {
        userId: user.id,
        items: {
          create: {
            variantId: variant.id,
            quantity: params?.quantity ?? 2,
            unitPriceAtAdd: variant.price,
          },
        },
      },
    });

    // Create order using createOrderCore
    const order = await orderService.createOrderCore({
      userId: user.id,
      addressId: address.id,
      paymentMethod: params?.paymentMethod ?? 'COD',
      acknowledgedLivePrices: false,
    });

    // Optionally update status/paymentStatus to simulate progression
    if (params?.status || params?.paymentStatus) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          ...(params.status ? { status: params.status } : {}),
          ...(params.paymentStatus ? { paymentStatus: params.paymentStatus } : {}),
        },
      });
    }

    const freshOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true, payments: true, statusHistory: true },
    });

    return {
      user,
      customerCookie,
      address,
      product,
      variant,
      cart,
      order: freshOrder,
    };
  }

  describe('1. Authentication & Ownership Security Gates', () => {
    it('rejects unauthenticated requests to list orders with 401 AUTHENTICATION_REQUIRED', async () => {
      const res = await request(app).get('/api/v1/orders');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects unverified customers with 403 EMAIL_NOT_VERIFIED', async () => {
      const { customerCookie } = await createCustomer('unverified@example.com', false);

      const res = await request(app).get('/api/v1/orders').set('Cookie', customerCookie);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('returns 404 ORDER_NOT_FOUND when customer requests an order belonging to another customer', async () => {
      const customerA = await setupCustomerWithOrder({ email: 'user-a@example.com' });
      const customerB = await createCustomer('user-b@example.com');

      const res = await request(app)
        .get(`/api/v1/orders/${customerA.order.orderNumber}`)
        .set('Cookie', customerB.customerCookie);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    });

    it('never leaks other customers orders in the order listing', async () => {
      const customerA = await setupCustomerWithOrder({ email: 'owner-a@example.com' });
      const customerB = await setupCustomerWithOrder({ email: 'owner-b@example.com' });

      const res = await request(app).get('/api/v1/orders').set('Cookie', customerA.customerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.orders).toHaveLength(1);
      expect(res.body.data.orders[0].orderNumber).toBe(customerA.order.orderNumber);
      expect(res.body.data.orders[0].id).not.toBe(customerB.order.id);
    });
  });

  describe('2. Customer Order Listing & Pagination', () => {
    it('returns paginated orders sorted newest first with item previews and counts', async () => {
      const { user, customerCookie, address } = await setupCustomerWithOrder({
        email: 'multi-order@example.com',
      });

      // Create a second product and order for user
      const { product: prod2, variant: var2 } = await createPublishedProduct({
        initialPrice: 30000,
      });

      const userCart = await prisma.cart.findUniqueOrThrow({ where: { userId: user.id } });
      await prisma.cartItem.create({
        data: {
          cartId: userCart.id,
          variantId: var2.id,
          quantity: 1,
          unitPriceAtAdd: var2.price,
        },
      });

      const order2 = await orderService.createOrderCore({
        userId: user.id,
        addressId: address.id,
        paymentMethod: 'COD',
      });

      const res = await request(app)
        .get('/api/v1/orders?page=1&limit=10')
        .set('Cookie', customerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.orders).toHaveLength(2);
      expect(res.body.data.pagination.total).toBe(2);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.totalPages).toBe(1);

      // Verify newest order first
      expect(res.body.data.orders[0].orderNumber).toBe(order2.orderNumber);
      expect(res.body.data.orders[0].items).toHaveLength(1);
      expect(res.body.data.orders[0].itemCount).toBe(1);
      expect(res.body.data.orders[0].items[0].productName).toBe(prod2.name);
    });

    it('filters customer orders by status', async () => {
      const { customerCookie } = await setupCustomerWithOrder({
        email: 'filter-test@example.com',
        status: 'DELIVERED',
      });

      // Query for DELIVERED
      const resDelivered = await request(app)
        .get('/api/v1/orders?status=DELIVERED')
        .set('Cookie', customerCookie);

      expect(resDelivered.status).toBe(200);
      expect(resDelivered.body.data.orders).toHaveLength(1);
      expect(resDelivered.body.data.orders[0].status).toBe('DELIVERED');

      // Query for CANCELLED (should be 0)
      const resCancelled = await request(app)
        .get('/api/v1/orders?status=CANCELLED')
        .set('Cookie', customerCookie);

      expect(resCancelled.status).toBe(200);
      expect(resCancelled.body.data.orders).toHaveLength(0);
      expect(resCancelled.body.data.pagination.total).toBe(0);
    });
  });

  describe('3. Customer Order Details & Snapshots', () => {
    it('returns complete immutable order snapshot with address, items, financials, and timeline', async () => {
      const { customerCookie, order, product } = await setupCustomerWithOrder({
        email: 'details-tester@example.com',
        status: 'CONFIRMED',
      });

      const res = await request(app)
        .get(`/api/v1/orders/${order.orderNumber}`)
        .set('Cookie', customerCookie);

      expect(res.status).toBe(200);
      const detail = res.body.data.order;

      expect(detail.orderNumber).toBe(order.orderNumber);
      expect(detail.status).toBe('CONFIRMED');
      expect(detail.paymentStatus).toBe('PENDING');
      expect(detail.paymentMethod).toBe('COD');
      expect(detail.canCancel).toBe(true);

      // Shipping address snapshot
      expect(detail.shippingAddress.recipientName).toBe('Tanvir Ahmed');
      expect(detail.shippingAddress.phone).toBe('+8801700000001');
      expect(detail.shippingAddress.districtId).toBe('DHAKA');

      // Items snapshot
      expect(detail.items).toHaveLength(1);
      expect(detail.items[0].productName).toBe(product.name);
      expect(detail.items[0].productSlug).toBe(product.slug);
      expect(detail.items[0].quantity).toBe(2);
      expect(detail.items[0].isReviewable).toBe(false); // only DELIVERED is reviewable

      // Financials
      expect(detail.merchandiseSubtotal).toBe(100000);
      expect(detail.shippingFee).toBe(6000);
      expect(detail.totalPayable).toBe(106000);

      // Status history
      expect(detail.statusHistory.length).toBeGreaterThanOrEqual(1);
      expect(detail.statusHistory[0].toStatus).toBe('CONFIRMED');
    });

    it('marks items as isReviewable: true when order status is DELIVERED', async () => {
      const { customerCookie, order } = await setupCustomerWithOrder({
        email: 'delivered-reviewable@example.com',
        status: 'DELIVERED',
      });

      const res = await request(app)
        .get(`/api/v1/orders/${order.orderNumber}`)
        .set('Cookie', customerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.order.canCancel).toBe(false);
      expect(res.body.data.order.items[0].isReviewable).toBe(true);
    });

    it('strictly excludes internal gatewayResponse, gatewayTransactionId, and raw credentials from customer payment details', async () => {
      const { customerCookie, order } = await setupCustomerWithOrder({
        email: 'payment-audit@example.com',
        paymentMethod: 'SSLCOMMERZ',
        status: 'CONFIRMED',
      });

      // Update the Payment record with sensitive internal gateway data
      await prisma.payment.updateMany({
        where: { orderId: order.id },
        data: {
          gatewayTransactionId: 'BANK_VAL_ID_SECRET_123',
          gatewayResponse: {
            bank_tran_id: 'BANK_VAL_ID_SECRET_123',
            card_issuer: 'City Bank',
            store_passwd: 'internal_secret_credential',
            raw_callback_payload: { ipn_hash: 'abc123secret' },
          },
        },
      });

      const res = await request(app)
        .get(`/api/v1/orders/${order.orderNumber}`)
        .set('Cookie', customerCookie);

      expect(res.status).toBe(200);
      const detail = res.body.data.order;
      expect(detail.payments).toHaveLength(1);

      const p = detail.payments[0];
      // Only approved customer-facing fields are present
      expect(p.id).toBeDefined();
      expect(p.transactionId).toBeDefined();
      expect(p.method).toBe('SSLCOMMERZ');
      expect(p.status).toBe('PENDING');
      expect(p.amount).toBe(order.totalPayable);
      expect(p.createdAt).toBeDefined();

      // Ensure sensitive internal fields are completely excluded
      expect(p.gatewayResponse).toBeUndefined();
      expect(p.gatewayTransactionId).toBeUndefined();
      expect(p.store_passwd).toBeUndefined();
      expect(p.raw_callback_payload).toBeUndefined();
    });
  });

  describe('4. Customer Order Cancellation Workflow', () => {
    it('cancels unpaid COD order: restores physical stock, creates audit log, and marks order CANCELLED', async () => {
      const { customerCookie, order, variant } = await setupCustomerWithOrder({
        email: 'cancel-cod@example.com',
        paymentMethod: 'COD',
        initialStock: 20,
        quantity: 3,
      });

      // Stock before cancel: 20 - 3 = 17
      const invBefore = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(invBefore.quantity).toBe(17);

      const res = await request(app)
        .post(`/api/v1/orders/${order.orderNumber}/cancel`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ reason: 'Found a better price' });

      expect(res.status).toBe(200);
      expect(res.body.data.order.status).toBe('CANCELLED');
      expect(res.body.data.order.paymentStatus).toBe('CANCELLED');
      expect(res.body.data.order.cancellationReason).toBe('Found a better price');

      // Physical stock restored: 17 + 3 = 20
      const invAfter = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(invAfter.quantity).toBe(20);

      // ORDER_CANCELLATION adjustment record created
      const adjustment = await prisma.inventoryAdjustment.findFirst({
        where: {
          inventoryItemId: invAfter.id,
          type: 'ORDER_CANCELLATION',
        },
      });
      expect(adjustment).not.toBeNull();
      expect(adjustment?.quantityDelta).toBe(3);
    });

    it('cancels unpaid online order: releases reservation without modifying physical stock', async () => {
      const { customerCookie, order, variant } = await setupCustomerWithOrder({
        email: 'cancel-online@example.com',
        paymentMethod: 'SSLCOMMERZ',
        initialStock: 15,
        quantity: 2,
      });

      // Stock before cancel: quantity = 15, reservedQuantity = 2
      const invBefore = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(invBefore.quantity).toBe(15);
      expect(invBefore.reservedQuantity).toBe(2);

      const res = await request(app)
        .post(`/api/v1/orders/${order.orderNumber}/cancel`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ reason: 'Decided not to purchase' });

      expect(res.status).toBe(200);
      expect(res.body.data.order.status).toBe('CANCELLED');

      // Reserved stock released from 2 to 0, physical stock remains 15
      const invAfter = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(invAfter.quantity).toBe(15);
      expect(invAfter.reservedQuantity).toBe(0);
    });

    it('releases applied coupon usage idempotently upon customer cancellation', async () => {
      const { user, customerCookie, address } = await setupCustomerWithOrder({
        email: 'coupon-cancel@example.com',
      });

      // Create coupon
      const coupon = await prisma.coupon.create({
        data: {
          code: 'DISCOUNT20',
          discountType: 'PERCENTAGE',
          discountValue: 2000,
          perCustomerLimit: 1,
          usageLimit: 10,
          minOrderAmount: 1000,
          startDate: new Date(Date.now() - 3600000),
          endDate: new Date(Date.now() + 86400000),
          isActive: true,
        },
      });

      // Cart with coupon
      const cart = await prisma.cart.findUniqueOrThrow({ where: { userId: user.id } });
      await prisma.cart.update({
        where: { id: cart.id },
        data: { couponId: coupon.id },
      });

      const { variant: var2 } = await createPublishedProduct({ initialPrice: 20000 });

      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          variantId: var2.id,
          quantity: 1,
          unitPriceAtAdd: var2.price,
        },
      });

      const order = await orderService.createOrderCore({
        userId: user.id,
        addressId: address.id,
        paymentMethod: 'COD',
      });

      // Verify coupon was consumed: usageCount = 1
      const couponUsed = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
      expect(couponUsed.usageCount).toBe(1);

      // Cancel order
      const res = await request(app)
        .post(`/api/v1/orders/${order.orderNumber}/cancel`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ reason: 'Cancellation with coupon' });

      expect(res.status).toBe(200);

      // Verify coupon usage released: usageCount = 0
      const couponRestored = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
      expect(couponRestored.usageCount).toBe(0);

      const usageRecord = await prisma.couponUsage.findFirst({
        where: { orderId: order.id },
      });
      expect(usageRecord).toBeNull();
    });

    it('rejects cancellation of already PAID orders with 400 PAID_ORDER_CANNOT_BE_CANCELLED', async () => {
      const { customerCookie, order } = await setupCustomerWithOrder({
        email: 'paid-cancel@example.com',
        paymentStatus: 'PAID',
      });

      const res = await request(app)
        .post(`/api/v1/orders/${order.orderNumber}/cancel`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ reason: 'Refund requested' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PAID_ORDER_CANNOT_BE_CANCELLED');
    });

    it('rejects cancellation of already CANCELLED orders with 400 ORDER_ALREADY_CANCELLED', async () => {
      const { customerCookie, order } = await setupCustomerWithOrder({
        email: 'double-cancel@example.com',
        status: 'CANCELLED',
      });

      const res = await request(app)
        .post(`/api/v1/orders/${order.orderNumber}/cancel`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ reason: 'Cancel again' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ORDER_ALREADY_CANCELLED');
    });

    it('rejects cancellation of DELIVERED orders with 400 ORDER_CANNOT_BE_CANCELLED', async () => {
      const { customerCookie, order } = await setupCustomerWithOrder({
        email: 'delivered-cancel@example.com',
        status: 'DELIVERED',
      });

      const res = await request(app)
        .post(`/api/v1/orders/${order.orderNumber}/cancel`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ reason: 'Want to return' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ORDER_CANNOT_BE_CANCELLED');
    });

    it('rejects cancellation requests without CSRF token with 403', async () => {
      const { customerCookie, order } = await setupCustomerWithOrder({
        email: 'csrf-cancel@example.com',
      });

      const res = await request(app)
        .post(`/api/v1/orders/${order.orderNumber}/cancel`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', customerCookie)
        .send({ reason: 'No CSRF' });

      expect(res.status).toBe(403);
    });
  });
});
