import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { hashPassword, signAccessToken } from '../../../lib/crypto.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';

describe('Admin Audit Log Viewer API (Phase 8C)', () => {
  let adminId: string;
  let adminCookie: string;
  let customerCookie: string;

  beforeAll(async () => {
    const timestamp = Date.now();
    const passwordHash = await hashPassword('StrongPass123!');

    // 1. Create Admin
    const admin = await prisma.user.create({
      data: {
        email: `admin-audit-${timestamp}@digitaldepot.local`,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            firstName: 'Auditor',
            lastName: 'General',
            phone: '+8801700000002',
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

    // 2. Create Customer
    const customer = await prisma.user.create({
      data: {
        email: `cust-audit-${timestamp}@digitaldepot.local`,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            firstName: 'Audit',
            lastName: 'Subject',
            phone: '+8801722334455',
          },
        },
      },
    });

    const customerSession = await prisma.session.create({
      data: {
        userId: customer.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const customerToken = await signAccessToken({
      sub: customer.id,
      sid: customerSession.id,
    });
    customerCookie = `${COOKIE_NAMES.ACCESS_TOKEN}=${customerToken}`;

    // 3. Create Seed Records across audit categories
    // A. Order & OrderStatusHistory
    const order = await prisma.order.create({
      data: {
        orderNumber: `DD-${timestamp}-AUDIT`,
        userId: customer.id,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
        paymentMethod: 'COD',
        merchandiseSubtotal: 100000,
        shippingFee: 6000,
        totalPayable: 106000,
        shippingRecipientName: 'Audit Subject',
        shippingPhone: '+8801722334455',
        shippingDivisionId: 'DHAKA',
        shippingDistrictId: 'DHAKA',
        shippingUpazila: 'Gulshan',
        shippingStreetAddress: 'Road 11',
      },
    });

    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: 'PENDING',
        toStatus: 'CONFIRMED',
        reason: 'Order confirmed by operator',
        changedByUserId: admin.id,
      },
    });

    // B. ReturnRequest & ReturnStatusHistory
    const ret = await prisma.returnRequest.create({
      data: {
        returnNumber: `RET-${timestamp}-AUDIT`,
        orderId: order.id,
        userId: customer.id,
        status: 'APPROVED',
        customerReason: 'Wrong size',
        estimatedRefundAmount: 50000,
      },
    });

    await prisma.returnStatusHistory.create({
      data: {
        returnRequestId: ret.id,
        fromStatus: 'REQUESTED',
        toStatus: 'APPROVED',
        reason: 'Return approved after RMA review',
        changedByUserId: admin.id,
      },
    });

    // C. Payment & Refund
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        transactionId: `TXN-${timestamp}-AUDIT`,
        method: 'COD',
        status: 'PAID',
        amount: 106000,
        paidAt: new Date(),
      },
    });

    await prisma.refund.create({
      data: {
        refundNumber: `REF-${timestamp}-AUDIT`,
        returnRequestId: ret.id,
        paymentId: payment.id,
        amount: 50000,
        merchandiseAmount: 50000,
        shippingAmount: 0,
        method: 'COD_PAYOUT',
        status: 'COMPLETED',
        payoutChannel: 'BKASH',
        payoutReference: `BKASH-${timestamp}-AUDIT`,
        processedByUserId: admin.id,
        processedAt: new Date(),
      },
    });

    // D. CustomerStatusHistory (Closure of audit gap)
    await prisma.customerStatusHistory.create({
      data: {
        customerId: customer.id,
        fromStatus: 'ACTIVE',
        toStatus: 'SUSPENDED',
        reason: 'Suspicious multiple failed checkouts',
        changedByUserId: admin.id,
      },
    });
  });

  afterAll(async () => {
    // Tests cleaned up via DB transactions / isolation
  });

  // ---------------- 1. Authorization Gates ----------------
  describe('Authorization Gates', () => {
    it('rejects unauthenticated requests to GET /api/v1/admin/audit-logs with 401', async () => {
      const res = await request(app).get('/api/v1/admin/audit-logs');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects customer requests to GET /api/v1/admin/audit-logs with 403', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Cookie', [customerCookie]);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects customer requests to GET /api/v1/admin/audit-logs/actors with 403', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs/actors')
        .set('Cookie', [customerCookie]);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // ---------------- 2. Category Isolation & Filtering ----------------
  describe('Category Isolation & Filtering', () => {
    it('returns order events when category=ORDERS', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs?category=ORDERS&limit=10')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const logs = res.body.data.logs;
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs.every((l: any) => l.category === 'ORDERS')).toBe(true);
      expect(logs[0].entityType).toBe('Order');
    });

    it('returns return events when category=RETURNS', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs?category=RETURNS&limit=10')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      const logs = res.body.data.logs;
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs.every((l: any) => l.category === 'RETURNS')).toBe(true);
      expect(logs[0].entityType).toBe('ReturnRequest');
    });

    it('returns refund events when category=REFUNDS', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs?category=REFUNDS&limit=10')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      const logs = res.body.data.logs;
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs.every((l: any) => l.category === 'REFUNDS')).toBe(true);
      expect(logs[0].entityType).toBe('Refund');
      expect(logs[0].details).toHaveProperty('amount');
    });

    it('returns customer status events when category=CUSTOMERS', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs?category=CUSTOMERS&limit=10')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      const logs = res.body.data.logs;
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs.every((l: any) => l.category === 'CUSTOMERS')).toBe(true);
      expect(logs[0].entityType).toBe('Customer');
      expect(logs[0].action).toContain('CUSTOMER_');
      expect(logs[0].reason).toContain('Suspicious multiple failed checkouts');
    });
  });

  // ---------------- 3. Unified Stream & Stats ----------------
  describe('Unified Stream & Deterministic Sorting (category=ALL)', () => {
    it('aggregates across multiple categories deterministically sorted by createdAt DESC', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs?category=ALL&limit=20')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.stats).toHaveProperty('totalEvents');
      expect(res.body.data.stats).toHaveProperty('orderEvents');
      expect(res.body.data.stats).toHaveProperty('customerEvents');
      expect(res.body.data.stats).toHaveProperty('refundEvents');

      const logs = res.body.data.logs;
      expect(logs.length).toBeGreaterThanOrEqual(4);

      // Verify sorting is descending by createdAt
      for (let i = 0; i < logs.length - 1; i++) {
        const timeA = new Date(logs[i].createdAt).getTime();
        const timeB = new Date(logs[i + 1].createdAt).getTime();
        expect(timeA).toBeGreaterThanOrEqual(timeB);
      }
    });

    it('filters audit logs by actorId', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/audit-logs?actorId=${adminId}`)
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      const logs = res.body.data.logs;
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs.every((l: any) => l.actor?.id === adminId)).toBe(true);
    });

    it('searches audit logs by entityReference or reason keyword', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/audit-logs?search=AUDIT`)
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.logs.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------- 4. Actor List Autocomplete ----------------
  describe('Actor List Autocomplete', () => {
    it('lists administrators for filter dropdowns', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs/actors')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.actors)).toBe(true);
      const actor = res.body.data.actors.find((a: any) => a.id === adminId);
      expect(actor).toBeDefined();
      expect(actor.email).toContain('admin-audit-');
      expect(actor.role).toBe('ADMIN');
    });
  });
});
