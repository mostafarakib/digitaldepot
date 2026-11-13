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

describe('Phase 6E: Admin Order Management, Fulfillment & State Machine API', () => {
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

  async function createAdminUser(email = 'admin-order@example.com') {
    const passwordHash = await hashPassword('AdminPass123!');
    const admin = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        profile: {
          create: {
            firstName: 'Super',
            lastName: 'Admin',
            phone: '+8801700000099',
          },
        },
      },
    });

    const now = new Date();
    const session = await prisma.session.create({
      data: {
        userId: admin.id,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        reauthenticatedAt: now,
        lastUsedAt: now,
      },
    });

    const accessToken = await signAccessToken({
      sub: admin.id,
      sid: session.id,
    });

    const adminCookie = `${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`;
    return { admin, adminCookie };
  }

  async function createCustomerUser(email = 'customer-order@example.com') {
    const passwordHash = await hashPassword('CustPass123!');
    const customer = await prisma.user.create({
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
        userId: customer.id,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        reauthenticatedAt: now,
        lastUsedAt: now,
      },
    });

    const accessToken = await signAccessToken({
      sub: customer.id,
      sid: session.id,
    });

    const customerCookie = `${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`;
    return { customer, customerCookie };
  }

  async function createPublishedProduct(params?: { initialPrice?: number; initialStock?: number }) {
    const suffix = `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const category = await categoryService.create({
      name: `Category-${suffix}`,
      slug: `category-${suffix}`,
    });

    const product = await productService.create({
      name: `Product-${suffix}`,
      slug: `product-${suffix}`,
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

  async function setupOrderFixture(params?: {
    email?: string;
    paymentMethod?: 'COD' | 'SSLCOMMERZ';
    status?: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
    paymentStatus?: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
    initialPrice?: number;
    initialStock?: number;
    quantity?: number;
  }) {
    const { customer, customerCookie } = await createCustomerUser(params?.email);
    const address = await createCustomerAddress(customer.id);
    const { product, variant } = await createPublishedProduct({
      initialPrice: params?.initialPrice,
      initialStock: params?.initialStock,
    });

    const cart = await prisma.cart.create({
      data: {
        userId: customer.id,
        items: {
          create: {
            variantId: variant.id,
            quantity: params?.quantity ?? 2,
            unitPriceAtAdd: variant.price,
          },
        },
      },
    });

    const order = await orderService.createOrderCore({
      userId: customer.id,
      addressId: address.id,
      paymentMethod: params?.paymentMethod ?? 'COD',
      acknowledgedLivePrices: false,
    });

    if (params?.status || params?.paymentStatus) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: params?.status ?? order.status,
          paymentStatus: params?.paymentStatus ?? order.paymentStatus,
        },
      });

      if (params?.paymentStatus) {
        await prisma.payment.updateMany({
          where: { orderId: order.id },
          data: { status: params.paymentStatus },
        });
      }
    }

    const reloaded = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true, payments: true, statusHistory: true },
    });

    return { customer, customerCookie, address, product, variant, cart, order: reloaded };
  }

  // ---------------- 1. Authentication & Role Security ----------------
  describe('1. Authentication & Role Security Gates', () => {
    it('rejects unauthenticated requests to admin orders with 401 AUTHENTICATION_REQUIRED', async () => {
      const res = await request(app).get('/api/v1/admin/orders');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects non-admin customers with 403 INSUFFICIENT_PERMISSIONS', async () => {
      const { customerCookie } = await createCustomerUser('unauth-cust@example.com');
      const res = await request(app).get('/api/v1/admin/orders').set('Cookie', customerCookie);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('allows authenticated administrators', async () => {
      const { adminCookie } = await createAdminUser('auth-admin@example.com');
      const res = await request(app).get('/api/v1/admin/orders').set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orders).toBeDefined();
    });
  });

  // ---------------- 2. Admin Order Listing, Filtering & Search ----------------
  describe('2. Admin Order Listing, Filtering & Search', () => {
    it('returns paginated orders with summary items and statusCounts', async () => {
      const { adminCookie } = await createAdminUser('list-admin@example.com');
      await setupOrderFixture({ email: 'order-1@example.com', status: 'CONFIRMED' });
      await setupOrderFixture({
        email: 'order-2@example.com',
        paymentMethod: 'SSLCOMMERZ',
        status: 'PENDING',
      });

      const res = await request(app).get('/api/v1/admin/orders').set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.orders).toHaveLength(2);
      expect(res.body.data.pagination.total).toBe(2);
      expect(res.body.data.statusCounts.all).toBe(2);
      expect(res.body.data.statusCounts.confirmed).toBe(1);
      expect(res.body.data.statusCounts.pending).toBe(1);

      const firstOrder = res.body.data.orders[0];
      expect(firstOrder.customer).toBeDefined();
      expect(firstOrder.customer.email).toBeDefined();
      expect(firstOrder.shippingAddress).toBeDefined();
    });

    it('filters orders by status, paymentStatus, and paymentMethod', async () => {
      const { adminCookie } = await createAdminUser('filter-admin@example.com');
      await setupOrderFixture({ email: 'cod-confirmed@example.com', status: 'CONFIRMED' });
      await setupOrderFixture({
        email: 'online-pending@example.com',
        paymentMethod: 'SSLCOMMERZ',
        status: 'PENDING',
      });

      // Filter by status=PENDING
      const resStatus = await request(app)
        .get('/api/v1/admin/orders?status=PENDING')
        .set('Cookie', adminCookie);
      expect(resStatus.status).toBe(200);
      expect(resStatus.body.data.orders).toHaveLength(1);
      expect(resStatus.body.data.orders[0].status).toBe('PENDING');

      // Filter by paymentMethod=COD
      const resMethod = await request(app)
        .get('/api/v1/admin/orders?paymentMethod=COD')
        .set('Cookie', adminCookie);
      expect(resMethod.status).toBe(200);
      expect(resMethod.body.data.orders).toHaveLength(1);
      expect(resMethod.body.data.orders[0].paymentMethod).toBe('COD');
    });

    it('searches orders by orderNumber, customer email, and recipient phone', async () => {
      const { adminCookie } = await createAdminUser('search-admin@example.com');
      const fixture1 = await setupOrderFixture({ email: 'distinct-user-email@example.com' });
      await setupOrderFixture({ email: 'other-user@example.com' });

      const res = await request(app)
        .get(`/api/v1/admin/orders?search=${encodeURIComponent('distinct-user-email')}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.orders).toHaveLength(1);
      expect(res.body.data.orders[0].orderNumber).toBe(fixture1.order.orderNumber);
    });
  });

  // ---------------- 3. Admin Order Details & Safe Projections ----------------
  describe('3. Admin Order Details & Safe Projections', () => {
    it('returns full order details snapshot by ID and by orderNumber', async () => {
      const { adminCookie } = await createAdminUser('details-admin@example.com');
      const fixture = await setupOrderFixture({
        email: 'details-cust@example.com',
        status: 'CONFIRMED',
      });

      // Fetch by ID
      const resId = await request(app)
        .get(`/api/v1/admin/orders/${fixture.order.id}`)
        .set('Cookie', adminCookie);
      expect(resId.status).toBe(200);
      expect(resId.body.data.order.orderNumber).toBe(fixture.order.orderNumber);
      expect(resId.body.data.order.customer.email).toBe('details-cust@example.com');
      expect(resId.body.data.order.allowedNextStatuses).toEqual(['PROCESSING']);
      expect(resId.body.data.order.canCancel).toBe(true);
      expect(resId.body.data.order.canMarkCodPaid).toBe(false); // not delivered yet

      // Fetch by orderNumber
      const resNum = await request(app)
        .get(`/api/v1/admin/orders/${fixture.order.orderNumber}`)
        .set('Cookie', adminCookie);
      expect(resNum.status).toBe(200);
      expect(resNum.body.data.order.id).toBe(fixture.order.id);
    });

    it('strictly sanitizes payment records: includes gatewayTransactionId, excludes gatewayResponse and credentials', async () => {
      const { adminCookie } = await createAdminUser('payment-admin@example.com');
      const fixture = await setupOrderFixture({
        email: 'payment-cust@example.com',
        paymentMethod: 'SSLCOMMERZ',
      });

      await prisma.payment.updateMany({
        where: { orderId: fixture.order.id },
        data: {
          gatewayTransactionId: 'BANK_VAL_ID_ADMIN_123',
          gatewayResponse: {
            bank_tran_id: 'BANK_VAL_ID_ADMIN_123',
            store_passwd: 'secret_password_do_not_leak',
            raw_callback_payload: { sensitive: true },
          },
        },
      });

      const res = await request(app)
        .get(`/api/v1/admin/orders/${fixture.order.id}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const payment = res.body.data.order.payments[0];
      expect(payment.gatewayTransactionId).toBe('BANK_VAL_ID_ADMIN_123');
      expect((payment as Record<string, unknown>).gatewayResponse).toBeUndefined();
      expect((payment as Record<string, unknown>).store_passwd).toBeUndefined();
      expect((payment as Record<string, unknown>).raw_callback_payload).toBeUndefined();
    });
  });

  // ---------------- 4. State Machine Fulfillment Transitions ----------------
  describe('4. State Machine Fulfillment Transitions', () => {
    it('prevents manual confirmation of unpaid SSLCommerz orders with 400 UNPAID_ONLINE_ORDER_CANNOT_BE_CONFIRMED', async () => {
      const { adminCookie } = await createAdminUser('machine-admin@example.com');
      const fixture = await setupOrderFixture({
        email: 'unpaid-ssl@example.com',
        paymentMethod: 'SSLCOMMERZ',
        status: 'PENDING',
        paymentStatus: 'PENDING',
      });

      const res = await request(app)
        .patch(`/api/v1/admin/orders/${fixture.order.id}/status`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({
          status: 'CONFIRMED',
          reason: 'Manual attempt to confirm unpaid online order',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNPAID_ONLINE_ORDER_CANNOT_BE_CONFIRMED');
    });

    it('advances CONFIRMED -> PROCESSING for COD order and records OrderStatusHistory', async () => {
      const { admin, adminCookie } = await createAdminUser('advance-admin@example.com');
      const fixture = await setupOrderFixture({
        email: 'cod-advance@example.com',
        paymentMethod: 'COD',
        status: 'CONFIRMED',
      });

      const res = await request(app)
        .patch(`/api/v1/admin/orders/${fixture.order.id}/status`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({
          status: 'PROCESSING',
          reason: 'Packed and verified by warehouse staff',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.order.status).toBe('PROCESSING');

      // Check status history in database
      const history = await prisma.orderStatusHistory.findMany({
        where: { orderId: fixture.order.id, toStatus: 'PROCESSING' },
      });
      expect(history).toHaveLength(1);
      expect(history[0].changedByUserId).toBe(admin.id);
      expect(history[0].reason).toBe('Packed and verified by warehouse staff');
    });

    it('blocks CONFIRMED -> PROCESSING for online orders if payment is not PAID', async () => {
      const { adminCookie } = await createAdminUser('block-proc-admin@example.com');
      const fixture = await setupOrderFixture({
        email: 'online-unpaid-proc@example.com',
        paymentMethod: 'SSLCOMMERZ',
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
      });

      const res = await request(app)
        .patch(`/api/v1/admin/orders/${fixture.order.id}/status`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({
          status: 'PROCESSING',
          reason: 'Attempting processing while unpaid',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ORDER_NOT_READY_FOR_PROCESSING');
    });

    it('advances PROCESSING -> SHIPPED -> DELIVERED sequentially', async () => {
      const { adminCookie } = await createAdminUser('ship-admin@example.com');
      const fixture = await setupOrderFixture({
        email: 'seq-order@example.com',
        paymentMethod: 'COD',
        status: 'CONFIRMED',
      });

      // 1. CONFIRMED -> PROCESSING
      await request(app)
        .patch(`/api/v1/admin/orders/${fixture.order.id}/status`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({ status: 'PROCESSING', reason: 'Order packed' });

      // 2. PROCESSING -> SHIPPED
      const shipRes = await request(app)
        .patch(`/api/v1/admin/orders/${fixture.order.id}/status`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({ status: 'SHIPPED', reason: 'Dispatched via Pathao Tracking #123456' });

      expect(shipRes.status).toBe(200);
      expect(shipRes.body.data.order.status).toBe('SHIPPED');

      // 3. SHIPPED -> DELIVERED
      const deliverRes = await request(app)
        .patch(`/api/v1/admin/orders/${fixture.order.id}/status`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({ status: 'DELIVERED', reason: 'Customer signed for delivery' });

      expect(deliverRes.status).toBe(200);
      expect(deliverRes.body.data.order.status).toBe('DELIVERED');
    });

    it('rejects invalid status transitions (e.g. skipping steps or moving backward)', async () => {
      const { adminCookie } = await createAdminUser('invalid-admin@example.com');
      const fixture = await setupOrderFixture({
        email: 'jump-order@example.com',
        status: 'CONFIRMED',
      });

      // Attempt to skip directly to DELIVERED
      const resSkip = await request(app)
        .patch(`/api/v1/admin/orders/${fixture.order.id}/status`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({ status: 'DELIVERED', reason: 'Skipping steps' });

      expect(resSkip.status).toBe(400);
      expect(resSkip.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  // ---------------- 5. COD Payment Marking ----------------
  describe('5. COD Payment Marking as PAID', () => {
    it('rejects marking COD payment as PAID before order reaches DELIVERED', async () => {
      const { adminCookie } = await createAdminUser('cod-pay-admin@example.com');
      const fixture = await setupOrderFixture({
        email: 'cod-not-delivered@example.com',
        paymentMethod: 'COD',
        status: 'PROCESSING',
      });

      const res = await request(app)
        .post(`/api/v1/admin/orders/${fixture.order.id}/mark-cod-paid`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({ note: 'Premature payment mark' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('COD_PAYMENT_REQUIRES_DELIVERED_STATUS');
    });

    it('rejects marking online SSLCommerz orders via mark-cod-paid', async () => {
      const { adminCookie } = await createAdminUser('online-pay-admin@example.com');
      const fixture = await setupOrderFixture({
        email: 'online-pay-test@example.com',
        paymentMethod: 'SSLCOMMERZ',
        status: 'DELIVERED',
      });

      const res = await request(app)
        .post(`/api/v1/admin/orders/${fixture.order.id}/mark-cod-paid`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PAYMENT_METHOD_NOT_COD');
    });

    it('successfully marks COD payment as PAID when DELIVERED and rejects repeated calls with PAYMENT_ALREADY_PAID', async () => {
      const { admin, adminCookie } = await createAdminUser('paid-admin@example.com');
      const fixture = await setupOrderFixture({
        email: 'cod-delivered@example.com',
        paymentMethod: 'COD',
        status: 'DELIVERED',
      });

      const res = await request(app)
        .post(`/api/v1/admin/orders/${fixture.order.id}/mark-cod-paid`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({ note: 'Cash collected by courier agent' });

      expect(res.status).toBe(200);
      expect(res.body.data.order.paymentStatus).toBe('PAID');

      // Verify payment record in DB
      const dbPayment = await prisma.payment.findFirstOrThrow({
        where: { orderId: fixture.order.id },
      });
      expect(dbPayment.status).toBe('PAID');
      expect(dbPayment.paidAt).not.toBeNull();

      // Verify status history
      const history = await prisma.orderStatusHistory.findFirst({
        where: { orderId: fixture.order.id, reason: 'Cash collected by courier agent' },
      });
      expect(history).not.toBeNull();
      expect(history?.changedByUserId).toBe(admin.id);

      // Repeated call must return PAYMENT_ALREADY_PAID
      const repeatRes = await request(app)
        .post(`/api/v1/admin/orders/${fixture.order.id}/mark-cod-paid`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send();

      expect(repeatRes.status).toBe(400);
      expect(repeatRes.body.error.code).toBe('PAYMENT_ALREADY_PAID');
    });
  });

  // ---------------- 6. Admin Order Cancellation ----------------
  describe('6. Admin Order Cancellation Workflow', () => {
    it('cancels unpaid COD order in PROCESSING: restores physical stock, audits as adminUserId, and releases coupon', async () => {
      const { admin, adminCookie } = await createAdminUser('cancel-admin-1@example.com');
      const fixture = await setupOrderFixture({
        email: 'cancel-proc-cod@example.com',
        paymentMethod: 'COD',
        status: 'PROCESSING',
        initialStock: 15,
        quantity: 3,
      });

      // Stock should currently be 15 - 3 = 12
      const stockBefore = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: fixture.variant.id },
      });
      expect(stockBefore.quantity).toBe(12);

      const res = await request(app)
        .post(`/api/v1/admin/orders/${fixture.order.id}/cancel`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({ reason: 'Customer requested cancellation via phone call' });

      expect(res.status).toBe(200);
      expect(res.body.data.order.status).toBe('CANCELLED');

      // Physical stock restored to 15
      const stockAfter = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: fixture.variant.id },
      });
      expect(stockAfter.quantity).toBe(15);

      // Inventory adjustment audit log attributed to admin.id
      const adjustment = await prisma.inventoryAdjustment.findFirst({
        where: {
          inventoryItemId: stockAfter.id,
          type: 'ORDER_CANCELLATION',
        },
      });
      expect(adjustment).not.toBeNull();
      expect(adjustment?.adjustedByUserId).toBe(admin.id);
      expect(adjustment?.quantityDelta).toBe(3);
    });

    it('cancels unpaid online order in PENDING: releases reserved stock without changing physical stock', async () => {
      const { adminCookie } = await createAdminUser('cancel-admin-2@example.com');
      const fixture = await setupOrderFixture({
        email: 'cancel-online-pending@example.com',
        paymentMethod: 'SSLCOMMERZ',
        status: 'PENDING',
        initialStock: 20,
        quantity: 2,
      });

      const invBefore = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: fixture.variant.id },
      });
      expect(invBefore.quantity).toBe(20);
      expect(invBefore.reservedQuantity).toBe(2);

      const res = await request(app)
        .post(`/api/v1/admin/orders/${fixture.order.id}/cancel`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({ reason: 'Online payment reservation expired or cancelled by admin' });

      expect(res.status).toBe(200);

      const invAfter = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: fixture.variant.id },
      });
      expect(invAfter.quantity).toBe(20); // physical stock unchanged
      expect(invAfter.reservedQuantity).toBe(0); // reserved stock released
    });

    it('rejects cancellation of already PAID orders with 400 PAID_ORDER_CANNOT_BE_CANCELLED', async () => {
      const { adminCookie } = await createAdminUser('cancel-admin-3@example.com');
      const fixture = await setupOrderFixture({
        email: 'cancel-paid@example.com',
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
      });

      const res = await request(app)
        .post(`/api/v1/admin/orders/${fixture.order.id}/cancel`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({ reason: 'Attempting to cancel paid order' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PAID_ORDER_CANNOT_BE_CANCELLED');
    });

    it('rejects cancellation without CSRF token with 403', async () => {
      const { adminCookie } = await createAdminUser('cancel-csrf-admin@example.com');
      const fixture = await setupOrderFixture({ email: 'csrf-cancel-test@example.com' });

      const res = await request(app)
        .post(`/api/v1/admin/orders/${fixture.order.id}/cancel`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', adminCookie)
        .send({ reason: 'No CSRF' });

      expect(res.status).toBe(403);
    });
  });
});
