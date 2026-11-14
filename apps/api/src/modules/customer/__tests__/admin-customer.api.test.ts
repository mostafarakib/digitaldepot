import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { hashPassword, signAccessToken } from '../../../lib/crypto.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { env } from '../../../config/env.js';

describe('Admin Customer Management API (Phase 8B)', () => {
  let csrfToken: string;
  let csrfCookie: string;
  let adminCookie: string;
  let customerCookie: string;
  let adminId: string;
  let customerId: string;
  let customerAccessToken: string;

  beforeEach(async () => {
    csrfToken = generateCsrfToken();
    csrfCookie = `${COOKIE_NAMES.CSRF_TOKEN}=${csrfToken}`;

    const timestamp = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const passwordHash = await hashPassword('SecurePass123!');

    // 1. Create Admin User
    const admin = await prisma.user.create({
      data: {
        email: `admin-cust-${timestamp}@digitaldepot.local`,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        profile: {
          create: {
            firstName: 'Admin',
            lastName: 'Supervisor',
          },
        },
      },
    });
    adminId = admin.id;

    const adminSession = await prisma.session.create({
      data: {
        userId: admin.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const adminToken = await signAccessToken({
      sub: admin.id,
      sid: adminSession.id,
    });
    adminCookie = `${COOKIE_NAMES.ACCESS_TOKEN}=${adminToken}`;

    // 2. Create Target Customer User
    const customer = await prisma.user.create({
      data: {
        email: `customer-test-${timestamp}@digitaldepot.local`,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            firstName: 'Rahim',
            lastName: 'Uddin',
            phone: '+8801712345678',
          },
        },
      },
    });
    customerId = customer.id;

    const customerSession = await prisma.session.create({
      data: {
        userId: customer.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    customerAccessToken = await signAccessToken({
      sub: customer.id,
      sid: customerSession.id,
    });
    customerCookie = `${COOKIE_NAMES.ACCESS_TOKEN}=${customerAccessToken}`;
  });

  afterAll(async () => {
    // Cleanup will happen via DB reset or test isolation
  });

  describe('Authorization Gates', () => {
    it('rejects unauthenticated requests to GET /api/v1/admin/customers with 401', async () => {
      const res = await request(app).get('/api/v1/admin/customers');
      expect(res.status).toBe(401);
    });

    it('rejects customer requests to GET /api/v1/admin/customers with 403', async () => {
      const res = await request(app).get('/api/v1/admin/customers').set('Cookie', customerCookie);
      expect(res.status).toBe(403);
    });

    it('rejects customer requests to GET /api/v1/admin/customers/:id with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/customers/${customerId}`)
        .set('Cookie', customerCookie);
      expect(res.status).toBe(403);
    });

    it('rejects customer requests to PATCH /api/v1/admin/customers/:id/status with 403', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/customers/${customerId}/status`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', `${customerCookie}; ${csrfCookie}`)
        .set('x-csrf-token', csrfToken)
        .send({ status: 'SUSPENDED', reason: 'Unauthorized customer attempt' });
      expect(res.status).toBe(403);
    });

    it('rejects status changes without CSRF token with 403', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/customers/${customerId}/status`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', adminCookie)
        .send({ status: 'SUSPENDED', reason: 'Missing CSRF' });
      expect(res.status).toBe(403);
    });
  });

  describe('Safe Projections & Security Invariants', () => {
    it('never leaks passwordHash, refreshTokens, or security secrets in customer list', async () => {
      const res = await request(app).get('/api/v1/admin/customers').set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const customers = res.body.data.customers;
      expect(customers.length).toBeGreaterThan(0);

      for (const c of customers) {
        expect(c.passwordHash).toBeUndefined();
        expect(c.refreshTokens).toBeUndefined();
        expect(c.sessions).toBeUndefined();
        expect(c.securityTokens).toBeUndefined();
      }
    });

    it('never leaks passwordHash or security secrets in customer detail', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/customers/${customerId}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const cust = res.body.data.customer;
      expect(cust.id).toBe(customerId);
      expect(cust.email).toContain('customer-test-');
      expect(cust.passwordHash).toBeUndefined();
      expect(cust.refreshTokens).toBeUndefined();
      expect(cust.securityTokens).toBeUndefined();
      expect(cust.sessions).toBeUndefined();
    });

    it('forbids inspecting an ADMIN account through customer detail with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/customers/${adminId}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CANNOT_MANAGE_ADMIN_ACCOUNT');
    });

    it('forbids suspending or modifying an ADMIN account with 403', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/customers/${adminId}/status`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('x-csrf-token', csrfToken)
        .send({ status: 'SUSPENDED', reason: 'Attempting to suspend an admin' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CANNOT_MODIFY_ADMIN_ACCOUNT');
    });
  });

  describe('Directory Filtering, Searching & Order Stats', () => {
    it('searches customers by name, email, and phone', async () => {
      // Search by email prefix
      const emailRes = await request(app)
        .get('/api/v1/admin/customers?search=Rahim')
        .set('Cookie', adminCookie);

      expect(emailRes.status).toBe(200);
      expect(emailRes.body.data.customers.some((c: any) => c.id === customerId)).toBe(true);

      // Search by phone
      const phoneRes = await request(app)
        .get('/api/v1/admin/customers?search=01712345678')
        .set('Cookie', adminCookie);

      expect(phoneRes.status).toBe(200);
      expect(phoneRes.body.data.customers.some((c: any) => c.id === customerId)).toBe(true);
    });

    it('filters customers by status and registration dates', async () => {
      const activeRes = await request(app)
        .get('/api/v1/admin/customers?status=ACTIVE')
        .set('Cookie', adminCookie);

      expect(activeRes.status).toBe(200);
      expect(activeRes.body.data.customers.every((c: any) => c.status === 'ACTIVE')).toBe(true);

      // Filter by future date should return 0
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const futureRes = await request(app)
        .get(`/api/v1/admin/customers?registeredFrom=${futureDate}`)
        .set('Cookie', adminCookie);

      expect(futureRes.status).toBe(200);
      expect(futureRes.body.data.customers.length).toBe(0);
    });
  });

  describe('LTV & Separate Order Counts Accuracy (Clarifications 3 & 4)', () => {
    it('correctly calculates LTV from PAID payments minus COMPLETED refunds in integer poisha', async () => {
      // Create Order 1 (PAID online payment: ৳1,500 = 150000 poisha, DELIVERED)
      const order1 = await prisma.order.create({
        data: {
          orderNumber: `DD-${Date.now()}-ORD1`,
          userId: customerId,
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          paymentMethod: 'SSLCOMMERZ',
          merchandiseSubtotal: 140000,
          shippingFee: 10000,
          totalPayable: 150000,
          shippingRecipientName: 'Rahim Uddin',
          shippingPhone: '+8801712345678',
          shippingDivisionId: 'dhaka',
          shippingDistrictId: 'dhaka',
          shippingUpazila: 'Gulshan',
          shippingStreetAddress: 'Road 1',
          payments: {
            create: {
              transactionId: `TXN-${Date.now()}-1`,
              method: 'SSLCOMMERZ',
              status: 'PAID',
              amount: 150000,
              paidAt: new Date(),
            },
          },
        },
      });

      // Create Order 2 (Unpaid PENDING order: ৳800 = 80000 poisha, should NOT count towards LTV)
      await prisma.order.create({
        data: {
          orderNumber: `DD-${Date.now()}-ORD2`,
          userId: customerId,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          paymentMethod: 'COD',
          merchandiseSubtotal: 74000,
          shippingFee: 6000,
          totalPayable: 80000,
          shippingRecipientName: 'Rahim Uddin',
          shippingPhone: '+8801712345678',
          shippingDivisionId: 'dhaka',
          shippingDistrictId: 'dhaka',
          shippingUpazila: 'Gulshan',
          shippingStreetAddress: 'Road 1',
        },
      });

      // Create Order 3 (CANCELLED online order with FAILED payment: should NOT count towards LTV)
      await prisma.order.create({
        data: {
          orderNumber: `DD-${Date.now()}-ORD3`,
          userId: customerId,
          status: 'CANCELLED',
          paymentStatus: 'FAILED',
          paymentMethod: 'SSLCOMMERZ',
          merchandiseSubtotal: 50000,
          shippingFee: 6000,
          totalPayable: 56000,
          shippingRecipientName: 'Rahim Uddin',
          shippingPhone: '+8801712345678',
          shippingDivisionId: 'dhaka',
          shippingDistrictId: 'dhaka',
          shippingUpazila: 'Gulshan',
          shippingStreetAddress: 'Road 1',
          payments: {
            create: {
              transactionId: `TXN-${Date.now()}-3`,
              method: 'SSLCOMMERZ',
              status: 'FAILED',
              amount: 56000,
              failedAt: new Date(),
            },
          },
        },
      });

      // Create Completed Return on Order 1 with COMPLETED Refund of ৳300 = 30000 poisha
      const payment1 = await prisma.payment.findFirstOrThrow({
        where: { orderId: order1.id },
      });

      const returnRequest = await prisma.returnRequest.create({
        data: {
          returnNumber: `RET-${Date.now()}-1`,
          orderId: order1.id,
          userId: customerId,
          status: 'COMPLETED',
          customerReason: 'Defective product',
          estimatedRefundAmount: 30000,
          actualRefundAmount: 30000,
          refunds: {
            create: {
              refundNumber: `REF-${Date.now()}-1`,
              paymentId: payment1.id,
              amount: 30000,
              merchandiseAmount: 30000,
              shippingAmount: 0,
              method: 'SSLCOMMERZ',
              status: 'COMPLETED',
              processedAt: new Date(),
            },
          },
        },
      });

      // Also create a PENDING refund attempt (should NOT deduct until COMPLETED)
      await prisma.refund.create({
        data: {
          refundNumber: `REF-${Date.now()}-PENDING`,
          returnRequestId: returnRequest.id,
          paymentId: payment1.id,
          amount: 20000,
          merchandiseAmount: 20000,
          shippingAmount: 0,
          method: 'SSLCOMMERZ',
          status: 'PENDING',
        },
      });

      // Fetch customer detail and assert financials
      const detailRes = await request(app)
        .get(`/api/v1/admin/customers/${customerId}`)
        .set('Cookie', adminCookie);

      expect(detailRes.status).toBe(200);
      const cust = detailRes.body.data.customer;

      // Clarification 4: LTV Math check
      // Gross Paid: 150000
      // Total Refunded: 30000 (pending refund 20000 is ignored)
      // Net LTV: 150000 - 30000 = 120000 poisha (৳1,200)
      expect(cust.financials.grossSpent).toBe(150000);
      expect(cust.financials.totalRefunded).toBe(30000);
      expect(cust.financials.lifetimeValue).toBe(120000);

      // Clarification 3: Separate Order Counts check
      // Total Orders: 3 (Order 1, Order 2, Order 3)
      // Completed Orders: 1 (Order 1 DELIVERED)
      // Cancelled Orders: 1 (Order 3 CANCELLED)
      // Return Count: 1
      // Completed Return Count: 1
      expect(cust.orderStats.totalOrderCount).toBe(3);
      expect(cust.orderStats.completedOrderCount).toBe(1);
      expect(cust.orderStats.cancelledOrderCount).toBe(1);
      expect(cust.orderStats.returnCount).toBe(1);
      expect(cust.orderStats.completedReturnCount).toBe(1);
    });
  });

  describe('Customer Status Management & Immediate Access Token Invalidation (Clarification 1 & 2)', () => {
    it('suspends a customer, revokes sessions atomically, and causes existing access tokens to immediately stop working', async () => {
      // 1. Verify customer access token works before suspension on authenticated customer endpoint
      const beforeRes = await request(app)
        .get('/api/v1/account/profile')
        .set('Cookie', customerCookie);

      expect(beforeRes.status).toBe(200);
      expect(beforeRes.body.data.email).toContain('customer-test-');

      // 2. Admin suspends customer account with mandatory reason
      const suspendRes = await request(app)
        .patch(`/api/v1/admin/customers/${customerId}/status`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('x-csrf-token', csrfToken)
        .send({
          status: 'SUSPENDED',
          reason: 'Chargeback fraud investigation',
        });

      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.success).toBe(true);
      expect(suspendRes.body.data.customer.status).toBe('SUSPENDED');

      // 3. Clarification 1 Verification:
      // Existing access token must now immediately fail with 401 or 403 on subsequent requests
      const afterRes = await request(app)
        .get('/api/v1/account/profile')
        .set('Cookie', customerCookie);

      expect([401, 403]).toContain(afterRes.status);
      expect(['ACCOUNT_SUSPENDED', 'SESSION_REVOKED_OR_EXPIRED']).toContain(
        afterRes.body.error.code,
      );

      // 4. Verify session in DB has revokedReason and revokedAt set
      const session = await prisma.session.findFirst({
        where: { userId: customerId },
      });
      expect(session?.revokedAt).not.toBeNull();
      expect(session?.revokedReason).toBe('Chargeback fraud investigation');
    });

    it('reactivates a suspended customer account', async () => {
      // First suspend
      await prisma.user.update({
        where: { id: customerId },
        data: { status: 'SUSPENDED' },
      });

      // Admin reactivates
      const reactivateRes = await request(app)
        .patch(`/api/v1/admin/customers/${customerId}/status`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('x-csrf-token', csrfToken)
        .send({
          status: 'ACTIVE',
          reason: 'Investigation cleared - valid customer identity confirmed',
        });

      expect(reactivateRes.status).toBe(200);
      expect(reactivateRes.body.data.customer.status).toBe('ACTIVE');
    });

    it('rejects setting the same status with 400 STATUS_ALREADY_SET', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/customers/${customerId}/status`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('x-csrf-token', csrfToken)
        .send({
          status: 'ACTIVE', // Already ACTIVE
          reason: 'No change',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('STATUS_ALREADY_SET');
    });
  });
});
