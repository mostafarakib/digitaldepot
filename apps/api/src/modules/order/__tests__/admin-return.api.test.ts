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
import { generateOrderNumber, generateReturnNumber } from '../order.utils.js';

describe('Phase 7C: Admin Return Inspection, Approval & Restocking API', () => {
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

  async function createAdminUser(email = 'admin-return@example.com') {
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
            firstName: 'Admin',
            lastName: 'Supervisor',
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

  async function createDeliveredOrderWithReturn(params: {
    userId: string;
    itemCount?: number;
    initialStock?: number;
    reservedStock?: number;
    returnStatus?: 'REQUESTED' | 'APPROVED' | 'RECEIVED' | 'REJECTED' | 'CANCELLED';
  }) {
    const suffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const category = await categoryService.create({
      name: `Category ${suffix}`,
      slug: `cat-${suffix}`,
      isActive: true,
    });

    const initialStock = params.initialStock ?? 20;
    const reservedStock = params.reservedStock ?? 2;

    const count = params.itemCount ?? 2;
    const products: any[] = [];

    for (let i = 0; i < count; i++) {
      const prod = await productService.create({
        name: `Product ${i + 1} ${suffix}`,
        summary: 'Return test item',
        categoryId: category.id,
        initialVariant: {
          sku: `SKU-${i + 1}-${suffix}`,
          price: 50000,
          initialStock,
        },
      });

      await prisma.product.update({
        where: { id: prod.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });

      // Update reserved quantity on inventory item for invariant checks
      const inv = await prisma.inventoryItem.findUnique({
        where: { variantId: prod.variants[0].id },
      });
      if (inv) {
        await prisma.inventoryItem.update({
          where: { id: inv.id },
          data: { reservedQuantity: reservedStock },
        });
      }

      products.push(prod);
    }

    const orderNumber = generateOrderNumber();
    const merchandiseSubtotal = count * 50000;
    const totalPayable = merchandiseSubtotal + 6000;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: params.userId,
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        paymentMethod: 'COD',
        merchandiseSubtotal,
        discountAmount: 0,
        shippingFee: 6000,
        totalPayable,
        shippingRecipientName: 'Tanvir Ahmed',
        shippingPhone: '+8801700000001',
        shippingDivisionId: 'DHAKA',
        shippingDistrictId: 'DHAKA',
        shippingUpazila: 'Gulshan',
        shippingStreetAddress: 'Road 11, House 25',
        items: {
          create: products.map((prod) => ({
            productId: prod.id,
            variantId: prod.variants[0].id,
            productName: prod.name,
            variantTitle: 'Default',
            sku: prod.variants[0].sku,
            unitPrice: 50000,
            quantity: 2,
            lineTotal: 100000,
          })),
        },
        statusHistory: {
          create: [
            {
              fromStatus: null,
              toStatus: 'PENDING',
              reason: 'Order placed',
            },
            {
              fromStatus: 'PENDING',
              toStatus: 'DELIVERED',
              reason: 'Delivered',
              createdAt: new Date(),
            },
          ],
        },
      },
      include: {
        items: true,
      },
    });

    const returnNumber = generateReturnNumber();
    const returnStatus = params.returnStatus ?? 'REQUESTED';

    const returnRequest = await prisma.returnRequest.create({
      data: {
        returnNumber,
        orderId: order.id,
        userId: params.userId,
        status: returnStatus,
        customerReason: 'DEFECTIVE_ITEM',
        customerNotes: 'Item not working as expected',
        estimatedRefundAmount: count * 100000,
        items: {
          create: order.items.map((it) => ({
            orderItemId: it.id,
            quantity: it.quantity,
            reason: 'Defective item',
            condition: returnStatus === 'RECEIVED' ? 'GOOD' : null,
            restockedQuantity: returnStatus === 'RECEIVED' ? it.quantity : 0,
          })),
        },
        statusHistory: {
          create: [
            {
              fromStatus: null,
              toStatus: 'REQUESTED',
              reason: 'Customer requested return',
            },
            ...(returnStatus !== 'REQUESTED'
              ? [
                  {
                    fromStatus: 'REQUESTED' as const,
                    toStatus: returnStatus,
                    reason: `Transition to ${returnStatus}`,
                  },
                ]
              : []),
          ],
        },
      },
      include: {
        items: {
          include: { orderItem: true },
        },
      },
    });

    return { order, returnRequest, products };
  }

  describe('1. Authentication & Role-Based Access Control', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/admin/returns');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects regular customer requests with 403', async () => {
      const { customerCookie } = await createCustomer('customer-test@example.com');
      const res = await request(app).get('/api/v1/admin/returns').set('Cookie', customerCookie);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('allows admin requests to list all returns regardless of order customer', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('cust-any@example.com');
      await createDeliveredOrderWithReturn({ userId: customer.id });

      const res = await request(app).get('/api/v1/admin/returns').set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.returns.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('2. Admin Return Listing & Filters', () => {
    it('filters returns by status, orderNumber, and returnNumber', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: c1 } = await createCustomer('c1@example.com');
      const { user: c2 } = await createCustomer('c2@example.com');

      const data1 = await createDeliveredOrderWithReturn({
        userId: c1.id,
        returnStatus: 'REQUESTED',
      });
      const data2 = await createDeliveredOrderWithReturn({
        userId: c2.id,
        returnStatus: 'APPROVED',
      });

      // Filter by status=REQUESTED
      const resStatus = await request(app)
        .get('/api/v1/admin/returns?status=REQUESTED')
        .set('Cookie', adminCookie);
      expect(resStatus.status).toBe(200);
      const requestedNumbers = resStatus.body.data.returns.map((r: any) => r.returnNumber);
      expect(requestedNumbers).toContain(data1.returnRequest.returnNumber);
      expect(requestedNumbers).not.toContain(data2.returnRequest.returnNumber);

      // Filter by orderNumber
      const resOrder = await request(app)
        .get(`/api/v1/admin/returns?orderNumber=${data1.order.orderNumber}`)
        .set('Cookie', adminCookie);
      expect(resOrder.status).toBe(200);
      expect(resOrder.body.data.returns).toHaveLength(1);
      expect(resOrder.body.data.returns[0].returnNumber).toBe(data1.returnRequest.returnNumber);

      // Filter by returnNumber
      const resRet = await request(app)
        .get(`/api/v1/admin/returns?returnNumber=${data2.returnRequest.returnNumber}`)
        .set('Cookie', adminCookie);
      expect(resRet.status).toBe(200);
      expect(resRet.body.data.returns).toHaveLength(1);
      expect(resRet.body.data.returns[0].returnNumber).toBe(data2.returnRequest.returnNumber);
    });

    it('filters returns by date range and returns pagination metadata', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('date-test@example.com');
      const { returnRequest } = await createDeliveredOrderWithReturn({ userId: customer.id });

      const pastDate = new Date(Date.now() - 60000).toISOString();
      const futureDate = new Date(Date.now() + 60000).toISOString();

      const res = await request(app)
        .get(`/api/v1/admin/returns?startDate=${pastDate}&endDate=${futureDate}&page=1&limit=5`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(5);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);
      const numbers = res.body.data.returns.map((r: any) => r.returnNumber);
      expect(numbers).toContain(returnRequest.returnNumber);
    });
  });

  describe('3. Admin Return Details & Safe Projections', () => {
    it('returns full operational details and excludes secrets/passwords', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('details-cust@example.com');
      const { returnRequest, order } = await createDeliveredOrderWithReturn({
        userId: customer.id,
      });

      const res = await request(app)
        .get(`/api/v1/admin/returns/${returnRequest.returnNumber}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const ret = res.body.data.return;
      expect(ret.returnNumber).toBe(returnRequest.returnNumber);
      expect(ret.orderNumber).toBe(order.orderNumber);
      expect(ret.customer.email).toBe('details-cust@example.com');
      expect(ret.customer.name).toContain('Tanvir');
      expect(ret.customer.phone).toBe('+8801700000001');
      expect(ret.orderSummary.status).toBe('DELIVERED');
      expect(ret.orderSummary.paymentStatus).toBe('PAID');
      expect(ret.items).toHaveLength(2);
      expect(ret.statusHistory.length).toBeGreaterThanOrEqual(1);

      // Verify no sensitive fields leak
      expect(ret.customer.passwordHash).toBeUndefined();
      expect(ret.customer.verificationTokenHash).toBeUndefined();
    });

    it('returns 404 for non-existent returnNumber', async () => {
      const { adminCookie } = await createAdminUser();
      const res = await request(app)
        .get('/api/v1/admin/returns/RET-99999999-NOTFOUND')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RETURN_NOT_FOUND');
    });
  });

  describe('4. Approval Workflow (REQUESTED -> APPROVED)', () => {
    it('approves a REQUESTED return and appends ReturnStatusHistory', async () => {
      const { admin, adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('approve-cust@example.com');
      const { returnRequest } = await createDeliveredOrderWithReturn({
        userId: customer.id,
        returnStatus: 'REQUESTED',
      });

      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/approve`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({ notes: 'Return request verified and approved' });

      expect(res.status).toBe(200);
      expect(res.body.data.return.status).toBe('APPROVED');

      // Verify database state
      const dbReturn = await prisma.returnRequest.findUnique({
        where: { id: returnRequest.id },
        include: { statusHistory: { orderBy: { createdAt: 'desc' } } },
      });
      expect(dbReturn?.status).toBe('APPROVED');
      expect(dbReturn?.statusHistory[0].fromStatus).toBe('REQUESTED');
      expect(dbReturn?.statusHistory[0].toStatus).toBe('APPROVED');
      expect(dbReturn?.statusHistory[0].changedByUserId).toBe(admin.id);
      expect(dbReturn?.statusHistory[0].reason).toBe('Return request verified and approved');
    });

    it('rejects approval when return is not in REQUESTED status', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('already-approved@example.com');
      const { returnRequest } = await createDeliveredOrderWithReturn({
        userId: customer.id,
        returnStatus: 'APPROVED',
      });

      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/approve`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_RETURN_STATUS');
    });
  });

  describe('5. Rejection Workflow (REQUESTED -> REJECTED)', () => {
    it('rejects a return request with mandatory reason and appends ReturnStatusHistory', async () => {
      const { admin, adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('reject-cust@example.com');
      const { returnRequest } = await createDeliveredOrderWithReturn({
        userId: customer.id,
        returnStatus: 'REQUESTED',
      });

      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/reject`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          reason: 'Serial number does not match original shipment',
          notes: 'Customer provided photos from different device',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.return.status).toBe('REJECTED');
      expect(res.body.data.return.rejectionReason).toBe(
        'Serial number does not match original shipment',
      );

      // Verify database
      const dbReturn = await prisma.returnRequest.findUnique({
        where: { id: returnRequest.id },
        include: { statusHistory: { orderBy: { createdAt: 'desc' } } },
      });
      expect(dbReturn?.status).toBe('REJECTED');
      expect(dbReturn?.rejectionReason).toBe('Serial number does not match original shipment');
      expect(dbReturn?.statusHistory[0].toStatus).toBe('REJECTED');
      expect(dbReturn?.statusHistory[0].changedByUserId).toBe(admin.id);
    });

    it('fails with validation error when rejection reason is missing', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('reject-noreason@example.com');
      const { returnRequest } = await createDeliveredOrderWithReturn({
        userId: customer.id,
        returnStatus: 'REQUESTED',
      });

      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/reject`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({ notes: 'Only note without reason' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects transition when return is not in REQUESTED status', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('reject-already@example.com');
      const { returnRequest } = await createDeliveredOrderWithReturn({
        userId: customer.id,
        returnStatus: 'APPROVED',
      });

      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/reject`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({ reason: 'Too late' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_RETURN_STATUS');
    });
  });

  describe('6. Physical Inspection & Restocking (APPROVED -> RECEIVED)', () => {
    it('restocks GOOD items, preserves inventory invariants, and creates RETURN_RESTOCK adjustments', async () => {
      const { admin, adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('good-restock@example.com');
      const { returnRequest, products } = await createDeliveredOrderWithReturn({
        userId: customer.id,
        itemCount: 2,
        initialStock: 20,
        reservedStock: 3,
        returnStatus: 'APPROVED',
      });

      const variant1 = products[0].variants[0].id;
      const variant2 = products[1].variants[0].id;

      const returnItem1 = returnRequest.items[0];
      const returnItem2 = returnRequest.items[1];

      // Physical inspection with full quantity in condition GOOD
      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/inspect`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          items: [
            {
              returnItemId: returnItem1.id,
              condition: 'GOOD',
              inspectedQuantity: returnItem1.quantity, // 2
              notes: 'Factory seal intact, mint condition',
            },
            {
              returnItemId: returnItem2.id,
              condition: 'GOOD',
              // inspectedQuantity omitted to verify defaulting to returnItem.quantity
              notes: 'Original packaging complete',
            },
          ],
          notes: 'Full return inspected and accepted into stock',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.return.status).toBe('RECEIVED');
      expect(res.body.data.return.items[0].condition).toBe('GOOD');
      expect(res.body.data.return.items[0].restockedQuantity).toBe(2);
      expect(res.body.data.return.items[1].condition).toBe('GOOD');
      expect(res.body.data.return.items[1].restockedQuantity).toBe(2);

      // Verify inventory item 1: initialStock 20 + restocked 2 = 22
      const inv1 = await prisma.inventoryItem.findUnique({
        where: { variantId: variant1 },
        include: { adjustments: { orderBy: { createdAt: 'desc' } } },
      });
      expect(inv1?.quantity).toBe(22);
      expect(inv1?.reservedQuantity).toBe(3); // Invariant: reservedQuantity unchanged
      expect(inv1!.quantity).toBeGreaterThanOrEqual(inv1!.reservedQuantity);
      expect(inv1?.adjustments[0].type).toBe('RETURN_RESTOCK');
      expect(inv1?.adjustments[0].quantityDelta).toBe(2);
      expect(inv1?.adjustments[0].oldQuantity).toBe(20);
      expect(inv1?.adjustments[0].newQuantity).toBe(22);
      expect(inv1?.adjustments[0].adjustedByUserId).toBe(admin.id);

      // Verify inventory item 2: initialStock 20 + restocked 2 = 22
      const inv2 = await prisma.inventoryItem.findUnique({
        where: { variantId: variant2 },
        include: { adjustments: { orderBy: { createdAt: 'desc' } } },
      });
      expect(inv2?.quantity).toBe(22);
      expect(inv2?.reservedQuantity).toBe(3);
      expect(inv2?.adjustments[0].type).toBe('RETURN_RESTOCK');
      expect(inv2?.adjustments[0].quantityDelta).toBe(2);

      // Verify ReturnRequest status and history
      const dbReturn = await prisma.returnRequest.findUnique({
        where: { id: returnRequest.id },
        include: { statusHistory: { orderBy: { createdAt: 'desc' } } },
      });
      expect(dbReturn?.status).toBe('RECEIVED');
      expect(dbReturn?.statusHistory[0].fromStatus).toBe('APPROVED');
      expect(dbReturn?.statusHistory[0].toStatus).toBe('RECEIVED');
      expect(dbReturn?.statusHistory[0].changedByUserId).toBe(admin.id);
    });

    it('does NOT restock DAMAGED or OPENED_UNUSABLE items and creates no inventory adjustments', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('damaged-cust@example.com');
      const { returnRequest, products } = await createDeliveredOrderWithReturn({
        userId: customer.id,
        itemCount: 2,
        initialStock: 15,
        reservedStock: 1,
        returnStatus: 'APPROVED',
      });

      const variant1 = products[0].variants[0].id;
      const variant2 = products[1].variants[0].id;

      const returnItem1 = returnRequest.items[0];
      const returnItem2 = returnRequest.items[1];

      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/inspect`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          items: [
            {
              returnItemId: returnItem1.id,
              condition: 'DAMAGED',
              inspectedQuantity: returnItem1.quantity,
              notes: 'Cracked screen, cannot be resold',
            },
            {
              returnItemId: returnItem2.id,
              condition: 'OPENED_UNUSABLE',
              inspectedQuantity: returnItem2.quantity,
              notes: 'Missing internal parts',
            },
          ],
          notes: 'Both items non-restockable',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.return.status).toBe('RECEIVED');
      expect(res.body.data.return.items[0].condition).toBe('DAMAGED');
      expect(res.body.data.return.items[0].restockedQuantity).toBe(0);
      expect(res.body.data.return.items[1].condition).toBe('OPENED_UNUSABLE');
      expect(res.body.data.return.items[1].restockedQuantity).toBe(0);

      // Verify inventory did not change
      const inv1 = await prisma.inventoryItem.findUnique({
        where: { variantId: variant1 },
        include: { adjustments: true },
      });
      expect(inv1?.quantity).toBe(15);
      const restockAdj1 = inv1?.adjustments.filter((a) => a.type === 'RETURN_RESTOCK');
      expect(restockAdj1).toHaveLength(0);

      const inv2 = await prisma.inventoryItem.findUnique({
        where: { variantId: variant2 },
        include: { adjustments: true },
      });
      expect(inv2?.quantity).toBe(15);
      const restockAdj2 = inv2?.adjustments.filter((a) => a.type === 'RETURN_RESTOCK');
      expect(restockAdj2).toHaveLength(0);
    });

    it('handles mixed inspection: restocks GOOD item and skips DAMAGED item', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('mixed-cust@example.com');
      const { returnRequest, products } = await createDeliveredOrderWithReturn({
        userId: customer.id,
        itemCount: 2,
        initialStock: 10,
        returnStatus: 'APPROVED',
      });

      const returnItem1 = returnRequest.items[0];
      const returnItem2 = returnRequest.items[1];

      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/inspect`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          items: [
            {
              returnItemId: returnItem1.id,
              condition: 'GOOD',
              inspectedQuantity: 2,
              notes: 'Good condition',
            },
            {
              returnItemId: returnItem2.id,
              condition: 'DAMAGED',
              inspectedQuantity: 2,
              notes: 'Water damaged',
            },
          ],
        });

      expect(res.status).toBe(200);

      // Verify item 1 restocked
      const inv1 = await prisma.inventoryItem.findUnique({
        where: { variantId: products[0].variants[0].id },
        include: { adjustments: true },
      });
      expect(inv1?.quantity).toBe(12);
      const restockAdj1 = inv1?.adjustments.filter((a) => a.type === 'RETURN_RESTOCK');
      expect(restockAdj1).toHaveLength(1);
      expect(restockAdj1?.[0].quantityDelta).toBe(2);

      // Verify item 2 NOT restocked
      const inv2 = await prisma.inventoryItem.findUnique({
        where: { variantId: products[1].variants[0].id },
        include: { adjustments: true },
      });
      expect(inv2?.quantity).toBe(10);
      const restockAdj2 = inv2?.adjustments.filter((a) => a.type === 'RETURN_RESTOCK');
      expect(restockAdj2).toHaveLength(0);
    });

    it('rejects partial inspection when not all items are covered (Clarification 1)', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('partial-item@example.com');
      const { returnRequest } = await createDeliveredOrderWithReturn({
        userId: customer.id,
        itemCount: 2,
        returnStatus: 'APPROVED',
      });

      // Submit inspection for only 1 of the 2 return items
      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/inspect`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          items: [
            {
              returnItemId: returnRequest.items[0].id,
              condition: 'GOOD',
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INCOMPLETE_INSPECTION');
    });

    it('rejects partial quantity inspection (Clarification 1)', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('partial-qty@example.com');
      const { returnRequest } = await createDeliveredOrderWithReturn({
        userId: customer.id,
        itemCount: 1,
        returnStatus: 'APPROVED',
      });

      const returnItem = returnRequest.items[0]; // quantity = 2

      // Supply inspectedQuantity: 1 when returnItem.quantity is 2
      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/inspect`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          items: [
            {
              returnItemId: returnItem.id,
              condition: 'GOOD',
              inspectedQuantity: 1, // Must equal 2
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PARTIAL_INSPECTION_NOT_ALLOWED');
    });

    it('prevents repeated inspection and duplicate restocking (Idempotency)', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('duplicate-insp@example.com');
      const { returnRequest, products } = await createDeliveredOrderWithReturn({
        userId: customer.id,
        itemCount: 1,
        initialStock: 10,
        returnStatus: 'APPROVED',
      });

      const returnItem = returnRequest.items[0];

      // First inspection succeeds
      const res1 = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/inspect`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          items: [
            {
              returnItemId: returnItem.id,
              condition: 'GOOD',
            },
          ],
        });
      expect(res1.status).toBe(200);

      const invAfterFirst = await prisma.inventoryItem.findUnique({
        where: { variantId: products[0].variants[0].id },
      });
      expect(invAfterFirst?.quantity).toBe(12);

      // Second inspection attempt MUST be rejected and must NOT restock again
      const res2 = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/inspect`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          items: [
            {
              returnItemId: returnItem.id,
              condition: 'GOOD',
            },
          ],
        });

      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe('RETURN_ALREADY_INSPECTED');

      const invAfterSecond = await prisma.inventoryItem.findUnique({
        where: { variantId: products[0].variants[0].id },
      });
      expect(invAfterSecond?.quantity).toBe(12); // Still 12, no double restock
    });

    it('rejects inspection for returns in REQUESTED status (must be APPROVED first)', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('not-approved@example.com');
      const { returnRequest } = await createDeliveredOrderWithReturn({
        userId: customer.id,
        itemCount: 1,
        returnStatus: 'REQUESTED',
      });

      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/inspect`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          items: [
            {
              returnItemId: returnRequest.items[0].id,
              condition: 'GOOD',
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_RETURN_STATUS');
    });
  });
});
