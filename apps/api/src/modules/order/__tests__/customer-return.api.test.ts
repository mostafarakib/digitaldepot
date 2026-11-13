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
import { generateOrderNumber } from '../order.utils.js';

describe('Phase 7B: Customer Return Requests & History API', () => {
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

  async function createDeliveredOrder(params: {
    userId: string;
    deliveredAt?: Date;
    orderStatus?: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED';
    paymentStatus?: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
    couponDiscount?: number;
    items?: Array<{ price: number; quantity: number }>;
  }) {
    const suffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const category = await categoryService.create({
      name: `Category ${suffix}`,
      slug: `cat-${suffix}`,
      isActive: true,
    });

    const product = await productService.create({
      name: `Product ${suffix}`,
      summary: 'Product for return test',
      categoryId: category.id,
      initialVariant: {
        sku: `SKU-${suffix}`,
        price: 100000,
        initialStock: 50,
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

    const orderNumber = generateOrderNumber();
    const orderItemsConfig = params.items || [{ price: 100000, quantity: 2 }];

    let merchandiseSubtotal = 0;
    const orderItemsData = orderItemsConfig.map((cfg) => {
      const lineTotal = cfg.price * cfg.quantity;
      merchandiseSubtotal += lineTotal;
      return {
        productId: product.id,
        variantId: variant.id,
        productName: product.name,
        variantTitle: variant.name,
        sku: variant.sku,
        unitPrice: cfg.price,
        quantity: cfg.quantity,
        lineTotal,
      };
    });

    const discountAmount = params.couponDiscount || 0;
    const shippingFee = 6000;
    const totalPayable = merchandiseSubtotal - discountAmount + shippingFee;

    const deliveredDate = params.deliveredAt || new Date();

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: params.userId,
        status: params.orderStatus || 'DELIVERED',
        paymentStatus: params.paymentStatus || 'PAID',
        paymentMethod: 'COD',
        merchandiseSubtotal,
        discountAmount,
        shippingFee,
        totalPayable,
        shippingRecipientName: 'Tanvir Ahmed',
        shippingPhone: '+8801700000001',
        shippingDivisionId: 'DHAKA',
        shippingDistrictId: 'DHAKA',
        shippingUpazila: 'Gulshan',
        shippingStreetAddress: 'Road 11, House 25',
        couponDiscountAmount: discountAmount,
        items: {
          create: orderItemsData,
        },
        statusHistory: {
          create: [
            {
              fromStatus: null,
              toStatus: 'PENDING',
              reason: 'Order created',
              createdAt: new Date(deliveredDate.getTime() - 48 * 3600 * 1000),
            },
            {
              fromStatus: 'PENDING',
              toStatus: 'CONFIRMED',
              reason: 'Order confirmed',
              createdAt: new Date(deliveredDate.getTime() - 36 * 3600 * 1000),
            },
            {
              fromStatus: 'CONFIRMED',
              toStatus: 'PROCESSING',
              reason: 'Order processing',
              createdAt: new Date(deliveredDate.getTime() - 24 * 3600 * 1000),
            },
            {
              fromStatus: 'PROCESSING',
              toStatus: 'SHIPPED',
              reason: 'Order shipped',
              createdAt: new Date(deliveredDate.getTime() - 12 * 3600 * 1000),
            },
            {
              fromStatus: 'SHIPPED',
              toStatus: 'DELIVERED',
              reason: 'Order delivered to recipient',
              createdAt: deliveredDate,
            },
          ],
        },
        payments: {
          create: {
            transactionId: `TXN-COD-${orderNumber}`,
            method: 'COD',
            status: params.paymentStatus || 'PAID',
            amount: totalPayable,
            paidAt: deliveredDate,
          },
        },
      },
      include: {
        items: true,
      },
    });

    return { order, product, variant };
  }

  // -------------------------------------------------------------------------
  // 1. Return Eligibility Tests
  // -------------------------------------------------------------------------
  describe('GET /api/v1/orders/:orderNumber/return-eligibility', () => {
    it('returns eligibility details with remaining days and returnable quantities for delivered paid order', async () => {
      const { user, customerCookie } = await createCustomer('owner1@test.com');
      const { order } = await createDeliveredOrder({
        userId: user.id,
        deliveredAt: new Date(Date.now() - 2 * 24 * 3600 * 1000), // Delivered 2 days ago
      });

      const res = await request(app)
        .get(`/api/v1/orders/${order.orderNumber}/return-eligibility`)
        .set('Cookie', customerCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isEligible).toBe(true);
      expect(res.body.data.orderNumber).toBe(order.orderNumber);
      expect(res.body.data.calendarDaysPassed).toBe(2);
      expect(res.body.data.daysRemaining).toBe(5);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].returnableQuantity).toBe(2);
      expect(res.body.data.items[0].isReturnable).toBe(true);
    });

    it('returns 404 when non-owner customer queries return eligibility', async () => {
      const { user: owner } = await createCustomer('owner2@test.com');
      const { customerCookie: attackerCookie } = await createCustomer('attacker2@test.com');
      const { order } = await createDeliveredOrder({ userId: owner.id });

      const res = await request(app)
        .get(`/api/v1/orders/${order.orderNumber}/return-eligibility`)
        .set('Cookie', attackerCookie);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    });

    it('returns 401 for unauthenticated request', async () => {
      const { user: owner } = await createCustomer('owner3@test.com');
      const { order } = await createDeliveredOrder({ userId: owner.id });

      const res = await request(app).get(`/api/v1/orders/${order.orderNumber}/return-eligibility`);

      expect(res.status).toBe(401);
    });

    it('returns isEligible false when order is not DELIVERED', async () => {
      const { user, customerCookie } = await createCustomer('owner4@test.com');
      const { order } = await createDeliveredOrder({
        userId: user.id,
        orderStatus: 'SHIPPED',
      });

      const res = await request(app)
        .get(`/api/v1/orders/${order.orderNumber}/return-eligibility`)
        .set('Cookie', customerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.isEligible).toBe(false);
      expect(res.body.data.reason).toBe('ORDER_NOT_DELIVERED');
    });

    it('returns isEligible false when order is not PAID', async () => {
      const { user, customerCookie } = await createCustomer('owner5@test.com');
      const { order } = await createDeliveredOrder({
        userId: user.id,
        paymentStatus: 'PENDING',
      });

      const res = await request(app)
        .get(`/api/v1/orders/${order.orderNumber}/return-eligibility`)
        .set('Cookie', customerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.isEligible).toBe(false);
      expect(res.body.data.reason).toBe('ORDER_NOT_PAID');
    });

    it('returns isEligible false when delivery was more than 7 days ago in Asia/Dhaka', async () => {
      const { user, customerCookie } = await createCustomer('owner6@test.com');
      const { order } = await createDeliveredOrder({
        userId: user.id,
        deliveredAt: new Date(Date.now() - 9 * 24 * 3600 * 1000), // Delivered 9 days ago
      });

      const res = await request(app)
        .get(`/api/v1/orders/${order.orderNumber}/return-eligibility`)
        .set('Cookie', customerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.isEligible).toBe(false);
      expect(res.body.data.reason).toBe('RETURN_WINDOW_EXPIRED');
      expect(res.body.data.daysRemaining).toBe(0);
    });

    it('deducts quantities in active return requests from returnable quantity while ignoring cancelled returns', async () => {
      const { user, customerCookie } = await createCustomer('owner7@test.com');
      const { order } = await createDeliveredOrder({
        userId: user.id,
        items: [{ price: 50000, quantity: 4 }],
      });

      const orderItem = order.items[0];

      // Create an active REQUESTED return for 1 unit
      await prisma.returnRequest.create({
        data: {
          returnNumber: 'RET-ACTIVE-1',
          orderId: order.id,
          userId: user.id,
          status: 'REQUESTED',
          customerReason: 'DEFECTIVE_ITEM',
          estimatedRefundAmount: 50000,
          items: {
            create: {
              orderItemId: orderItem.id,
              quantity: 1,
              reason: 'Defective item',
            },
          },
        },
      });

      // Create a CANCELLED return for 1 unit (must NOT reduce returnable quantity)
      await prisma.returnRequest.create({
        data: {
          returnNumber: 'RET-CANCELLED-1',
          orderId: order.id,
          userId: user.id,
          status: 'CANCELLED',
          customerReason: 'CHANGED_MIND',
          estimatedRefundAmount: 50000,
          items: {
            create: {
              orderItemId: orderItem.id,
              quantity: 1,
              reason: 'Cancelled request',
            },
          },
        },
      });

      // Total delivered = 4. Active committed = 1. Cancelled = 1 (ignored). Returnable = 3.
      const res = await request(app)
        .get(`/api/v1/orders/${order.orderNumber}/return-eligibility`)
        .set('Cookie', customerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.items[0].orderedQuantity).toBe(4);
      expect(res.body.data.items[0].returnableQuantity).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Return Request Creation Tests
  // -------------------------------------------------------------------------
  describe('POST /api/v1/orders/:orderNumber/returns', () => {
    it('creates a return request atomically with estimated refund calculation', async () => {
      const { user, customerCookie } = await createCustomer('create1@test.com');
      // Subtotal 200,000, coupon discount 20,000 (10% discount). Net price per unit = 90,000
      const { order } = await createDeliveredOrder({
        userId: user.id,
        items: [{ price: 100000, quantity: 2 }],
        couponDiscount: 20000,
      });

      const orderItem = order.items[0];

      const res = await request(app)
        .post(`/api/v1/orders/${order.orderNumber}/returns`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', [customerCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          customerReason: 'DEFECTIVE_ITEM',
          customerNotes: 'Device does not turn on.',
          items: [
            {
              orderItemId: orderItem.id,
              quantity: 1,
              reason: 'Defective item',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const ret = res.body.data.return;
      expect(ret.returnNumber).toMatch(/^RET-\d{8}-[A-Z0-9]{8}$/);
      expect(ret.status).toBe('REQUESTED');
      expect(ret.customerReason).toBe('DEFECTIVE_ITEM');
      expect(ret.customerNotes).toBe('Device does not turn on.');
      // 1 unit at net 90,000 poisha
      expect(ret.estimatedRefundAmount).toBe(90000);
      expect(ret.items).toHaveLength(1);
      expect(ret.items[0].quantity).toBe(1);
      expect(ret.statusHistory).toHaveLength(1);
      expect(ret.statusHistory[0].toStatus).toBe('REQUESTED');

      // Verify database state
      const dbReturn = await prisma.returnRequest.findUnique({
        where: { returnNumber: ret.returnNumber },
        include: { items: true, statusHistory: true },
      });
      expect(dbReturn).not.toBeNull();
      expect(dbReturn?.status).toBe('REQUESTED');
      expect(dbReturn?.items[0].orderItemId).toBe(orderItem.id);
    });

    it('rejects return creation when requested quantity exceeds returnable quantity', async () => {
      const { user, customerCookie } = await createCustomer('create2@test.com');
      const { order } = await createDeliveredOrder({
        userId: user.id,
        items: [{ price: 50000, quantity: 1 }],
      });

      const orderItem = order.items[0];

      const res = await request(app)
        .post(`/api/v1/orders/${order.orderNumber}/returns`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', [customerCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          customerReason: 'WRONG_ITEM_SENT',
          items: [
            {
              orderItemId: orderItem.id,
              quantity: 2, // Only 1 delivered!
              reason: 'Wrong item',
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('RETURN_QUANTITY_EXCEEDED');
    });

    it('rejects return creation when order does not belong to customer', async () => {
      const { user: owner } = await createCustomer('owner_cr@test.com');
      const { customerCookie: attackerCookie } = await createCustomer('attacker_cr@test.com');
      const { order } = await createDeliveredOrder({ userId: owner.id });

      const res = await request(app)
        .post(`/api/v1/orders/${order.orderNumber}/returns`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', [attackerCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          customerReason: 'DEFECTIVE_ITEM',
          items: [{ orderItemId: order.items[0].id, quantity: 1 }],
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    });

    it('rejects return creation without valid CSRF token', async () => {
      const { user, customerCookie } = await createCustomer('csrf_cr@test.com');
      const { order } = await createDeliveredOrder({ userId: user.id });

      const res = await request(app)
        .post(`/api/v1/orders/${order.orderNumber}/returns`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', customerCookie)
        .send({
          customerReason: 'DEFECTIVE_ITEM',
          items: [{ orderItemId: order.items[0].id, quantity: 1 }],
        });

      expect(res.status).toBe(403);
    });

    it('serializes concurrent return requests on the same order so quantity cannot be exceeded', async () => {
      const { user, customerCookie } = await createCustomer('concurrency@test.com');
      const { order } = await createDeliveredOrder({
        userId: user.id,
        items: [{ price: 50000, quantity: 1 }], // Only 1 unit returnable!
      });

      const orderItem = order.items[0];

      // Fire two parallel return requests for the single available unit
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/v1/orders/${order.orderNumber}/returns`)
          .set('Origin', env.FRONTEND_URL)
          .set('Cookie', [customerCookie, csrfCookie])
          .set('x-csrf-token', csrfToken)
          .send({
            customerReason: 'DEFECTIVE_ITEM',
            items: [{ orderItemId: orderItem.id, quantity: 1 }],
          }),
        request(app)
          .post(`/api/v1/orders/${order.orderNumber}/returns`)
          .set('Origin', env.FRONTEND_URL)
          .set('Cookie', [customerCookie, csrfCookie])
          .set('x-csrf-token', csrfToken)
          .send({
            customerReason: 'DEFECTIVE_ITEM',
            items: [{ orderItemId: orderItem.id, quantity: 1 }],
          }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 400]);

      const failedRes = res1.status === 400 ? res1 : res2;
      expect(failedRes.body.error.code).toBe('RETURN_QUANTITY_EXCEEDED');

      // Exactly 1 return request must exist in DB
      const dbReturns = await prisma.returnRequest.findMany({ where: { orderId: order.id } });
      expect(dbReturns).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Return Listing & Details Tests
  // -------------------------------------------------------------------------
  describe('GET /api/v1/customer/returns and GET /api/v1/customer/returns/:returnNumber', () => {
    it('lists only customer returns with pagination and status filtering', async () => {
      const { user, customerCookie } = await createCustomer('list_user@test.com');
      const { user: otherUser } = await createCustomer('other_user@test.com');

      const { order: myOrder } = await createDeliveredOrder({ userId: user.id });
      const { order: otherOrder } = await createDeliveredOrder({ userId: otherUser.id });

      // Create 2 returns for myOrder (1 REQUESTED, 1 CANCELLED)
      await prisma.returnRequest.create({
        data: {
          returnNumber: 'RET-MY-1',
          orderId: myOrder.id,
          userId: user.id,
          status: 'REQUESTED',
          customerReason: 'DEFECTIVE_ITEM',
          estimatedRefundAmount: 50000,
          items: {
            create: { orderItemId: myOrder.items[0].id, quantity: 1, reason: 'Defective' },
          },
        },
      });

      await prisma.returnRequest.create({
        data: {
          returnNumber: 'RET-MY-2',
          orderId: myOrder.id,
          userId: user.id,
          status: 'CANCELLED',
          customerReason: 'CHANGED_MIND',
          estimatedRefundAmount: 50000,
          items: {
            create: { orderItemId: myOrder.items[0].id, quantity: 1, reason: 'Mind changed' },
          },
        },
      });

      // Create 1 return for other user
      await prisma.returnRequest.create({
        data: {
          returnNumber: 'RET-OTHER-1',
          orderId: otherOrder.id,
          userId: otherUser.id,
          status: 'REQUESTED',
          customerReason: 'DEFECTIVE_ITEM',
          estimatedRefundAmount: 50000,
          items: {
            create: { orderItemId: otherOrder.items[0].id, quantity: 1, reason: 'Defective' },
          },
        },
      });

      // 1. List all returns for user
      const listRes = await request(app)
        .get('/api/v1/customer/returns')
        .set('Cookie', customerCookie);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.returns).toHaveLength(2);
      expect(listRes.body.data.pagination.total).toBe(2);

      // 2. Filter by status=REQUESTED
      const filterRes = await request(app)
        .get('/api/v1/customer/returns?status=REQUESTED')
        .set('Cookie', customerCookie);

      expect(filterRes.status).toBe(200);
      expect(filterRes.body.data.returns).toHaveLength(1);
      expect(filterRes.body.data.returns[0].returnNumber).toBe('RET-MY-1');
    });

    it('returns single return detail with customer-safe projection', async () => {
      const { user, customerCookie } = await createCustomer('detail_user@test.com');
      const { order } = await createDeliveredOrder({ userId: user.id });

      const created = await prisma.returnRequest.create({
        data: {
          returnNumber: 'RET-DETAIL-1',
          orderId: order.id,
          userId: user.id,
          status: 'REQUESTED',
          customerReason: 'DEFECTIVE_ITEM',
          customerNotes: 'Internal admin notes must not leak',
          estimatedRefundAmount: 100000,
          items: {
            create: {
              orderItemId: order.items[0].id,
              quantity: 1,
              reason: 'Defective',
            },
          },
          statusHistory: {
            create: {
              toStatus: 'REQUESTED',
              reason: 'Customer initiated',
              changedByUserId: user.id,
            },
          },
        },
      });

      const res = await request(app)
        .get(`/api/v1/customer/returns/${created.returnNumber}`)
        .set('Cookie', customerCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const ret = res.body.data.return;
      expect(ret.returnNumber).toBe('RET-DETAIL-1');
      expect(ret.items).toHaveLength(1);
      expect(ret.items[0].productName).toBe(order.items[0].productName);
      expect(ret.statusHistory).toHaveLength(1);
      // Ensure admin-internal fields (like staff user IDs) are redacted
      expect(ret.statusHistory[0].changedByUserId).toBeUndefined();
    });

    it('returns 404 when querying return belonging to another customer', async () => {
      const { user: owner } = await createCustomer('detail_owner@test.com');
      const { customerCookie: attackerCookie } = await createCustomer('detail_attacker@test.com');
      const { order } = await createDeliveredOrder({ userId: owner.id });

      const created = await prisma.returnRequest.create({
        data: {
          returnNumber: 'RET-OWNER-SECURE',
          orderId: order.id,
          userId: owner.id,
          status: 'REQUESTED',
          customerReason: 'DEFECTIVE_ITEM',
          estimatedRefundAmount: 50000,
          items: {
            create: { orderItemId: order.items[0].id, quantity: 1, reason: 'Defective' },
          },
        },
      });

      const res = await request(app)
        .get(`/api/v1/customer/returns/${created.returnNumber}`)
        .set('Cookie', attackerCookie);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RETURN_NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Return Cancellation Tests
  // -------------------------------------------------------------------------
  describe('POST /api/v1/customer/returns/:returnNumber/cancel', () => {
    it('cancels a REQUESTED return, logs status history, and releases returnable quantity', async () => {
      const { user, customerCookie } = await createCustomer('cancel_success@test.com');
      const { order } = await createDeliveredOrder({
        userId: user.id,
        items: [{ price: 50000, quantity: 2 }],
      });

      // Submit return for 2 units
      const createRes = await request(app)
        .post(`/api/v1/orders/${order.orderNumber}/returns`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', [customerCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          customerReason: 'CHANGED_MIND',
          items: [{ orderItemId: order.items[0].id, quantity: 2 }],
        });

      const returnNumber = createRes.body.data.return.returnNumber;

      // Verify returnable quantity is now 0
      const eligBefore = await request(app)
        .get(`/api/v1/orders/${order.orderNumber}/return-eligibility`)
        .set('Cookie', customerCookie);
      expect(eligBefore.body.data.items[0].returnableQuantity).toBe(0);

      // Cancel return
      const cancelRes = await request(app)
        .post(`/api/v1/customer/returns/${returnNumber}/cancel`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', [customerCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ reason: 'Found missing accessories' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.return.status).toBe('CANCELLED');

      // Verify history
      const history = cancelRes.body.data.return.statusHistory;
      expect(history).toHaveLength(2);
      expect(history[1].fromStatus).toBe('REQUESTED');
      expect(history[1].toStatus).toBe('CANCELLED');
      expect(history[1].reason).toBe('Found missing accessories');

      // Verify returnable quantity is restored to 2!
      const eligAfter = await request(app)
        .get(`/api/v1/orders/${order.orderNumber}/return-eligibility`)
        .set('Cookie', customerCookie);
      expect(eligAfter.body.data.items[0].returnableQuantity).toBe(2);
    });

    it('rejects cancellation if return is already CANCELLED', async () => {
      const { user, customerCookie } = await createCustomer('cancel_twice@test.com');
      const { order } = await createDeliveredOrder({ userId: user.id });

      const returnReq = await prisma.returnRequest.create({
        data: {
          returnNumber: 'RET-ALREADY-CANCELLED',
          orderId: order.id,
          userId: user.id,
          status: 'CANCELLED',
          customerReason: 'CHANGED_MIND',
          estimatedRefundAmount: 50000,
        },
      });

      const res = await request(app)
        .post(`/api/v1/customer/returns/${returnReq.returnNumber}/cancel`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', [customerCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('RETURN_ALREADY_CANCELLED');
    });

    it('rejects cancellation if return has advanced to APPROVED status', async () => {
      const { user, customerCookie } = await createCustomer('cancel_approved@test.com');
      const { order } = await createDeliveredOrder({ userId: user.id });

      const returnReq = await prisma.returnRequest.create({
        data: {
          returnNumber: 'RET-APPROVED-ALREADY',
          orderId: order.id,
          userId: user.id,
          status: 'APPROVED',
          customerReason: 'CHANGED_MIND',
          estimatedRefundAmount: 50000,
        },
      });

      const res = await request(app)
        .post(`/api/v1/customer/returns/${returnReq.returnNumber}/cancel`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', [customerCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('RETURN_NOT_CANCELLABLE');
    });

    it('rejects cancellation attempt by non-owner customer with 404', async () => {
      const { user: owner } = await createCustomer('cancel_owner@test.com');
      const { customerCookie: attackerCookie } = await createCustomer('cancel_attacker@test.com');
      const { order } = await createDeliveredOrder({ userId: owner.id });

      const returnReq = await prisma.returnRequest.create({
        data: {
          returnNumber: 'RET-OWNER-PROTECTED',
          orderId: order.id,
          userId: owner.id,
          status: 'REQUESTED',
          customerReason: 'CHANGED_MIND',
          estimatedRefundAmount: 50000,
        },
      });

      const res = await request(app)
        .post(`/api/v1/customer/returns/${returnReq.returnNumber}/cancel`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', [attackerCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RETURN_NOT_FOUND');
    });
  });
});
