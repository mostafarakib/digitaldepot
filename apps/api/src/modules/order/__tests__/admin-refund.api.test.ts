import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool } from '../../../test/setup.js';
import { env } from '../../../config/env.js';
import { hashPassword, signAccessToken } from '../../../lib/crypto.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { productService } from '../../catalogue/product.service.js';
import { categoryService } from '../../catalogue/category.service.js';
import {
  generateOrderNumber,
  generateReturnNumber,
  generateTransactionId,
} from '../order.utils.js';
import { sslcommerzService } from '../../payment/sslcommerz.service.js';

describe('Admin Returns Refund API Integration Tests (Phase 7D)', () => {
  const originalFetch = global.fetch;
  let csrfToken: string;
  let csrfCookie: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanDatabase();
    csrfToken = generateCsrfToken();
    csrfCookie = `${COOKIE_NAMES.CSRF_TOKEN}=${csrfToken}`;
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPool.end();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  async function createAdminUser() {
    const passwordHash = await hashPassword('AdminPass123!');
    const suffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const admin = await prisma.user.create({
      data: {
        email: `admin-${suffix}@example.com`,
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

  async function createInspectedReturnOrder(params: {
    userId: string;
    itemCount?: number;
    initialStock?: number;
    paymentMethod?: 'COD' | 'SSLCOMMERZ';
    returnStatus?: 'RECEIVED' | 'REQUESTED' | 'APPROVED';
    returnQtyPerItem?: number;
  }) {
    const suffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const category = await categoryService.create({
      name: `Category ${suffix}`,
      slug: `cat-${suffix}`,
      isActive: true,
    });

    const count = params.itemCount ?? 2;
    const initialStock = params.initialStock ?? 20;
    const products: Array<{
      id: string;
      name: string;
      variants: Array<{ id: string; sku: string }>;
    }> = [];

    for (let i = 0; i < count; i++) {
      const prod = await productService.create({
        name: `Product ${i + 1} ${suffix}`,
        summary: 'Refund test product',
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

      products.push(prod);
    }

    const orderNumber = generateOrderNumber();
    const merchandiseSubtotal = count * 100000; // 2 items each line
    const totalPayable = merchandiseSubtotal + 6000;
    const paymentMethod = params.paymentMethod ?? 'SSLCOMMERZ';

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: params.userId,
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        paymentMethod,
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
        payments: {
          create: {
            transactionId: generateTransactionId(),
            gatewayTransactionId: paymentMethod === 'SSLCOMMERZ' ? `BANK-TXN-${suffix}` : null,
            method: paymentMethod,
            status: 'PAID',
            amount: totalPayable,
            paidAt: new Date(),
          },
        },
        statusHistory: {
          create: [
            { fromStatus: null, toStatus: 'PENDING', reason: 'Order placed' },
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
        payments: true,
      },
    });

    const returnNumber = generateReturnNumber();
    const returnStatus = params.returnStatus ?? 'RECEIVED';
    const returnQty = params.returnQtyPerItem ?? 2;

    const returnRequest = await prisma.returnRequest.create({
      data: {
        returnNumber,
        orderId: order.id,
        userId: params.userId,
        status: returnStatus,
        customerReason: 'Defective item',
        customerNotes: 'Please refund to original method',
        estimatedRefundAmount: count * returnQty * 50000,
        items: {
          create: order.items.map((it) => ({
            orderItemId: it.id,
            quantity: returnQty,
            reason: 'Defective item',
            condition: returnStatus === 'RECEIVED' ? 'GOOD' : null,
            restockedQuantity: returnStatus === 'RECEIVED' ? returnQty : 0,
          })),
        },
        statusHistory: {
          create: [
            { fromStatus: null, toStatus: 'REQUESTED', reason: 'Customer requested return' },
            ...(returnStatus === 'APPROVED' || returnStatus === 'RECEIVED'
              ? [
                  {
                    fromStatus: 'REQUESTED' as const,
                    toStatus: 'APPROVED' as const,
                    reason: 'Approved',
                  },
                ]
              : []),
            ...(returnStatus === 'RECEIVED'
              ? [
                  {
                    fromStatus: 'APPROVED' as const,
                    toStatus: 'RECEIVED' as const,
                    reason: 'Inspected',
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

    return { order, returnRequest, products };
  }

  // -------------------------------------------------------------------------
  // 1. GET /api/v1/admin/returns/:returnNumber/refund-preview
  // -------------------------------------------------------------------------
  describe('GET /api/v1/admin/returns/:returnNumber/refund-preview', () => {
    it('returns calculated refund breakdown, remaining capacities, and target payment', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('preview-cust@example.com');
      const { returnRequest } = await createInspectedReturnOrder({
        userId: customer.id,
        itemCount: 2,
        paymentMethod: 'SSLCOMMERZ',
        returnStatus: 'RECEIVED',
      });

      const res = await request(app)
        .get(`/api/v1/admin/returns/${returnRequest.returnNumber}/refund-preview`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const preview = res.body.data.preview;
      expect(preview.returnNumber).toBe(returnRequest.returnNumber);
      expect(preview.returnStatus).toBe('RECEIVED');
      expect(preview.calculatedMerchandiseRefund).toBe(200000); // 2 items * 2 qty * 50000
      expect(preview.defaultShippingRefund).toBe(0);
      expect(preview.availableOrderCapacity).toBe(206000); // 200000 merchandise + 6000 shipping
      expect(preview.availableMerchandiseCapacity).toBe(200000);
      expect(preview.targetPayment).not.toBeNull();
      expect(preview.targetPayment.method).toBe('SSLCOMMERZ');
      expect(preview.hasPendingRefund).toBe(false);
    });

    it('rejects refund preview for return in REQUESTED or APPROVED status', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('not-received@example.com');
      const { returnRequest } = await createInspectedReturnOrder({
        userId: customer.id,
        returnStatus: 'REQUESTED',
      });

      const res = await request(app)
        .get(`/api/v1/admin/returns/${returnRequest.returnNumber}/refund-preview`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_RETURN_STATUS');
    });
  });

  // -------------------------------------------------------------------------
  // 2. POST /api/v1/admin/returns/:returnNumber/refund (SSLCommerz)
  // -------------------------------------------------------------------------
  describe('POST /api/v1/admin/returns/:returnNumber/refund (Online SSLCommerz)', () => {
    it('successfully processes full online refund through SSLCommerz and transitions Payment & Order to REFUNDED', async () => {
      const { admin, adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('online-refund-full@example.com');
      const { order, returnRequest } = await createInspectedReturnOrder({
        userId: customer.id,
        itemCount: 2,
        paymentMethod: 'SSLCOMMERZ',
        returnStatus: 'RECEIVED',
      });

      // Mock gateway initiateRefund returning SUCCESS
      vi.spyOn(sslcommerzService, 'initiateRefund').mockResolvedValueOnce({
        status: 'SUCCESS',
        refundRefId: 'SSL-GATEWAY-REF-1234',
        transId: 'TXN-GATEWAY-1',
        raw: { status: 'success', refund_ref_id: 'SSL-GATEWAY-REF-1234' },
      });

      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/refund`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          shippingAmount: 6000,
          shippingRefundReason: 'Full order return with store refund policy',
          notes: 'Full online refund approved',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify ReturnRequest status is COMPLETED and actualRefundAmount = 206000
      const dbReturn = await prisma.returnRequest.findUnique({
        where: { id: returnRequest.id },
        include: { refunds: true, statusHistory: true },
      });
      expect(dbReturn?.status).toBe('COMPLETED');
      expect(dbReturn?.actualRefundAmount).toBe(206000);
      expect(dbReturn?.shippingFeeRefunded).toBe(true);

      // Verify Refund record
      expect(dbReturn?.refunds).toHaveLength(1);
      const refund = dbReturn!.refunds[0];
      expect(refund.status).toBe('COMPLETED');
      expect(refund.method).toBe('SSLCOMMERZ');
      expect(refund.amount).toBe(206000);
      expect(refund.merchandiseAmount).toBe(200000);
      expect(refund.shippingAmount).toBe(6000);
      expect(refund.gatewayReference).toBe('SSL-GATEWAY-REF-1234');
      expect(refund.processedByUserId).toBe(admin.id);

      // Verify Invariant: 100% of captured payment refunded => Payment.status = REFUNDED and Order.paymentStatus = REFUNDED
      const dbPayment = await prisma.payment.findFirst({
        where: { orderId: order.id },
      });
      expect(dbPayment?.status).toBe('REFUNDED');

      const dbOrder = await prisma.order.findUnique({
        where: { id: order.id },
      });
      expect(dbOrder?.paymentStatus).toBe('REFUNDED');
    });

    it('partial refund leaves Payment and Order paymentStatus PAID', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('online-partial@example.com');
      // Create order with 2 items, but return only 1 item (50000 poisha merchandise returned out of 200000)
      const { order, returnRequest } = await createInspectedReturnOrder({
        userId: customer.id,
        itemCount: 2,
        paymentMethod: 'SSLCOMMERZ',
        returnStatus: 'RECEIVED',
        returnQtyPerItem: 1, // only 1 unit per item = 100000 poisha
      });

      vi.spyOn(sslcommerzService, 'initiateRefund').mockResolvedValueOnce({
        status: 'SUCCESS',
        refundRefId: 'SSL-GATEWAY-PARTIAL-1',
        raw: { status: 'success' },
      });

      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/refund`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          notes: 'Partial item return refund',
        });

      expect(res.status).toBe(200);

      // Payment captured was 206000, refunded is 100000 (< 206000)
      const dbPayment = await prisma.payment.findFirst({
        where: { orderId: order.id },
      });
      expect(dbPayment?.status).toBe('PAID'); // Invariant: partial refund leaves Payment PAID

      const dbOrder = await prisma.order.findUnique({
        where: { id: order.id },
      });
      expect(dbOrder?.paymentStatus).toBe('PAID'); // Invariant: partial refund leaves Order PAID
    });

    it('handles gateway failure: leaves ReturnRequest in RECEIVED and releases capacity', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('online-failed@example.com');
      const { returnRequest } = await createInspectedReturnOrder({
        userId: customer.id,
        itemCount: 2,
        paymentMethod: 'SSLCOMMERZ',
        returnStatus: 'RECEIVED',
      });

      vi.spyOn(sslcommerzService, 'initiateRefund').mockResolvedValueOnce({
        status: 'FAILED',
        errorReason: 'Customer card expired or blocked',
        raw: { status: 'failed', errorReason: 'Customer card expired or blocked' },
      });

      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/refund`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          notes: 'Attempt online refund',
        });

      expect(res.status).toBe(200);

      // Return remains RECEIVED
      const dbReturn = await prisma.returnRequest.findUnique({
        where: { id: returnRequest.id },
        include: { refunds: true },
      });
      expect(dbReturn?.status).toBe('RECEIVED');
      expect(dbReturn?.refunds).toHaveLength(1);
      expect(dbReturn?.refunds[0].status).toBe('FAILED');
      expect(dbReturn?.refunds[0].failureReason).toBe('Customer card expired or blocked');
    });

    it('handles ambiguous gateway timeout: leaves Refund PENDING and allows subsequent reconciliation', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('online-ambiguous@example.com');
      const { order, returnRequest } = await createInspectedReturnOrder({
        userId: customer.id,
        itemCount: 2,
        paymentMethod: 'SSLCOMMERZ',
        returnStatus: 'RECEIVED',
      });

      // 1. Initiate refund returns AMBIGUOUS (e.g. gateway timeout)
      vi.spyOn(sslcommerzService, 'initiateRefund').mockResolvedValueOnce({
        status: 'AMBIGUOUS',
        errorReason: 'ETIMEDOUT gateway connection lost',
        raw: { error: 'ETIMEDOUT gateway connection lost' },
      });

      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/refund`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          shippingAmount: 6000,
          shippingRefundReason: 'Full return',
          notes: 'Online refund attempt',
        });

      expect(res.status).toBe(200);

      // Verify Refund record remains PENDING
      let dbReturn = await prisma.returnRequest.findUnique({
        where: { id: returnRequest.id },
        include: { refunds: true },
      });
      expect(dbReturn?.status).toBe('RECEIVED');
      expect(dbReturn?.refunds[0].status).toBe('PENDING');

      // 2. Reject duplicate refund attempt while PENDING exists
      const dupRes = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/refund`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          notes: 'Duplicate attempt',
        });
      expect(dupRes.status).toBe(400);
      expect(dupRes.body.error.code).toBe('REFUND_ALREADY_PENDING');

      // 3. Reconcile with gateway: gateway query confirms SUCCESS
      vi.spyOn(sslcommerzService, 'queryRefundStatus').mockResolvedValueOnce({
        status: 'SUCCESS',
        refundRefId: 'GATEWAY-CONFIRMED-99',
        raw: { status: 'success' },
      });

      const recRes = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/refund/reconcile`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({});

      expect(recRes.status).toBe(200);

      dbReturn = await prisma.returnRequest.findUnique({
        where: { id: returnRequest.id },
        include: { refunds: true },
      });
      expect(dbReturn?.status).toBe('COMPLETED');
      expect(dbReturn?.refunds[0].status).toBe('COMPLETED');
      expect(dbReturn?.refunds[0].gatewayReference).toBe('GATEWAY-CONFIRMED-99');

      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.paymentStatus).toBe('REFUNDED');
    });
  });

  // -------------------------------------------------------------------------
  // 3. POST /api/v1/admin/returns/:returnNumber/refund (COD Manual Payout)
  // -------------------------------------------------------------------------
  describe('POST /api/v1/admin/returns/:returnNumber/refund (COD Manual Payout)', () => {
    it('successfully records manual COD payout via BKASH with payoutReference', async () => {
      const { admin, adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('cod-refund@example.com');
      const { order, returnRequest } = await createInspectedReturnOrder({
        userId: customer.id,
        itemCount: 2,
        paymentMethod: 'COD',
        returnStatus: 'RECEIVED',
      });

      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/refund`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          payoutChannel: 'BKASH',
          payoutReference: 'BKASH-TRX-987654321',
          notes: 'Customer refunded via bKash personal send money',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbReturn = await prisma.returnRequest.findUnique({
        where: { id: returnRequest.id },
        include: { refunds: true, statusHistory: true },
      });
      expect(dbReturn?.status).toBe('COMPLETED');
      expect(dbReturn?.actualRefundAmount).toBe(200000);

      expect(dbReturn?.refunds).toHaveLength(1);
      const refund = dbReturn!.refunds[0];
      expect(refund.status).toBe('COMPLETED');
      expect(refund.method).toBe('COD_PAYOUT');
      expect(refund.payoutChannel).toBe('BKASH');
      expect(refund.payoutReference).toBe('BKASH-TRX-987654321');
      expect(refund.amount).toBe(200000);
      expect(refund.processedByUserId).toBe(admin.id);

      // Verify audit history was created
      const lastHistory = dbReturn?.statusHistory[dbReturn.statusHistory.length - 1];
      expect(lastHistory?.fromStatus).toBe('RECEIVED');
      expect(lastHistory?.toStatus).toBe('COMPLETED');
      expect(lastHistory?.reason).toContain('BKASH-TRX-987654321');

      // Because shipping was not refunded (200000 < 206000), payment remains PAID
      const dbPayment = await prisma.payment.findFirst({ where: { orderId: order.id } });
      expect(dbPayment?.status).toBe('PAID');
    });

    it('rejects non-cash COD payout when payoutReference is missing', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('cod-noref@example.com');
      const { returnRequest } = await createInspectedReturnOrder({
        userId: customer.id,
        paymentMethod: 'COD',
        returnStatus: 'RECEIVED',
      });

      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/refund`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          payoutChannel: 'NAGAD',
          // missing payoutReference
        });

      expect(res.status).toBe(400);
    });

    it('allows cash COD payout without payoutReference', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('cod-cash@example.com');
      const { returnRequest } = await createInspectedReturnOrder({
        userId: customer.id,
        paymentMethod: 'COD',
        returnStatus: 'RECEIVED',
      });

      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/refund`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          payoutChannel: 'CASH',
          notes: 'Customer collected cash from storefront reception',
        });

      expect(res.status).toBe(200);

      const dbReturn = await prisma.returnRequest.findUnique({
        where: { id: returnRequest.id },
        include: { refunds: true },
      });
      expect(dbReturn?.refunds[0].payoutChannel).toBe('CASH');
      expect(dbReturn?.refunds[0].payoutReference).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Shipping fee refund validation
  // -------------------------------------------------------------------------
  describe('Shipping Fee Refund Enforcement', () => {
    it('rejects shipping refund when shippingRefundReason is empty', async () => {
      const { adminCookie } = await createAdminUser();
      const { user: customer } = await createCustomer('shipping-err@example.com');
      const { returnRequest } = await createInspectedReturnOrder({
        userId: customer.id,
        paymentMethod: 'COD',
        returnStatus: 'RECEIVED',
      });

      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/refund`)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          shippingAmount: 6000,
          payoutChannel: 'CASH',
          // missing shippingRefundReason
        });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // 5. RBAC & Security
  // -------------------------------------------------------------------------
  describe('Security & RBAC Enforcement', () => {
    it('rejects refund request when performed by a regular customer user with 403', async () => {
      const { user: customer, customerCookie } = await createCustomer('attacker-cust@example.com');
      const { returnRequest } = await createInspectedReturnOrder({
        userId: customer.id,
        paymentMethod: 'COD',
        returnStatus: 'RECEIVED',
      });

      const res = await request(app)
        .post(`/api/v1/admin/returns/${returnRequest.returnNumber}/refund`)
        .set('Cookie', [customerCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .set('Origin', env.FRONTEND_URL)
        .send({
          payoutChannel: 'CASH',
        });

      expect(res.status).toBe(403);
    });
  });
});
