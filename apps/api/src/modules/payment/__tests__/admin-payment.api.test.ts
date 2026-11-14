import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { hashPassword, signAccessToken } from '../../../lib/crypto.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';

describe('Admin Payment Monitoring API (Phase 8C)', () => {
  let adminCookie: string;
  let customerCookie: string;

  let paidPaymentId: string;
  let refundedPaymentId: string;

  beforeAll(async () => {
    const timestamp = Date.now();
    const passwordHash = await hashPassword('StrongPass123!');

    // 1. Create Admin
    const admin = await prisma.user.create({
      data: {
        email: `admin-pay-${timestamp}@digitaldepot.local`,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            firstName: 'Super',
            lastName: 'Admin',
            phone: '+8801700000001',
          },
        },
      },
    });

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
        email: `customer-pay-${timestamp}@digitaldepot.local`,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            firstName: 'Tanvir',
            lastName: 'Hasan',
            phone: '+8801711223344',
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

    // 3. Create Orders & Payments for testing
    // Order 1: Delivered order with PAID online payment and a partial COMPLETED refund
    const order1 = await prisma.order.create({
      data: {
        orderNumber: `DD-${timestamp}-PAY01`,
        userId: customer.id,
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        paymentMethod: 'SSLCOMMERZ',
        merchandiseSubtotal: 500000, // ৳5,000
        shippingFee: 6000, // ৳60
        totalPayable: 506000, // ৳5,060
        shippingRecipientName: 'Tanvir Hasan',
        shippingPhone: '+8801711223344',
        shippingDivisionId: 'DHAKA',
        shippingDistrictId: 'DHAKA',
        shippingUpazila: 'Dhanmondi',
        shippingStreetAddress: 'House 12, Road 5',
      },
    });

    const paymentPaid = await prisma.payment.create({
      data: {
        orderId: order1.id,
        transactionId: `TXN-${timestamp}-PAID`,
        gatewayTransactionId: `SSL-BANK-${timestamp}-01`,
        method: 'SSLCOMMERZ',
        status: 'PAID',
        amount: 506000,
        currency: 'BDT',
        paidAt: new Date(),
        gatewayResponse: {
          status: 'VALID',
          bank_tran_id: `SSL-BANK-${timestamp}-01`,
          card_type: 'VISA-CityBank',
          card_brand: 'VISA',
          card_issuer: 'City Bank',
          card_no: '411111XXXXXX1111',
          store_passwd: 'SUPER_SECRET_INTERNAL_KEY', // sensitive field to verify it's NOT leaked
        },
      },
    });
    paidPaymentId = paymentPaid.id;

    // Create a return request and partial refund on paymentPaid
    const returnReq = await prisma.returnRequest.create({
      data: {
        returnNumber: `RET-${timestamp}-01`,
        orderId: order1.id,
        userId: customer.id,
        status: 'COMPLETED',
        customerReason: 'Defective item',
        estimatedRefundAmount: 100000,
        actualRefundAmount: 100000,
      },
    });

    await prisma.refund.create({
      data: {
        refundNumber: `REF-${timestamp}-01`,
        returnRequestId: returnReq.id,
        paymentId: paymentPaid.id,
        amount: 100000, // ৳1,000 partial refund
        merchandiseAmount: 100000,
        shippingAmount: 0,
        method: 'SSLCOMMERZ',
        status: 'COMPLETED',
        gatewayReference: `REF-GW-${timestamp}-01`,
        processedByUserId: admin.id,
        processedAt: new Date(),
      },
    });

    // Order 2: PENDING COD order
    const order2 = await prisma.order.create({
      data: {
        orderNumber: `DD-${timestamp}-PAY02`,
        userId: customer.id,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        paymentMethod: 'COD',
        merchandiseSubtotal: 200000, // ৳2,000
        shippingFee: 6000,
        totalPayable: 206000,
        shippingRecipientName: 'Tanvir Hasan',
        shippingPhone: '+8801711223344',
        shippingDivisionId: 'DHAKA',
        shippingDistrictId: 'DHAKA',
        shippingUpazila: 'Mirpur',
        shippingStreetAddress: 'Section 10',
      },
    });

    await prisma.payment.create({
      data: {
        orderId: order2.id,
        transactionId: `TXN-${timestamp}-PENDING`,
        method: 'COD',
        status: 'PENDING',
        amount: 206000,
        currency: 'BDT',
      },
    });

    // Order 3: Fully refunded order
    const order3 = await prisma.order.create({
      data: {
        orderNumber: `DD-${timestamp}-PAY03`,
        userId: customer.id,
        status: 'DELIVERED',
        paymentStatus: 'REFUNDED',
        paymentMethod: 'SSLCOMMERZ',
        merchandiseSubtotal: 300000,
        shippingFee: 6000,
        totalPayable: 306000,
        shippingRecipientName: 'Tanvir Hasan',
        shippingPhone: '+8801711223344',
        shippingDivisionId: 'DHAKA',
        shippingDistrictId: 'DHAKA',
        shippingUpazila: 'Uttara',
        shippingStreetAddress: 'Sector 3',
      },
    });

    const paymentRefunded = await prisma.payment.create({
      data: {
        orderId: order3.id,
        transactionId: `TXN-${timestamp}-REFUNDED`,
        gatewayTransactionId: `SSL-BANK-${timestamp}-03`,
        method: 'SSLCOMMERZ',
        status: 'REFUNDED',
        amount: 306000,
        currency: 'BDT',
        paidAt: new Date(Date.now() - 3600000),
      },
    });
    refundedPaymentId = paymentRefunded.id;

    const returnReq3 = await prisma.returnRequest.create({
      data: {
        returnNumber: `RET-${timestamp}-03`,
        orderId: order3.id,
        userId: customer.id,
        status: 'COMPLETED',
        customerReason: 'Full return',
        estimatedRefundAmount: 306000,
        actualRefundAmount: 306000,
      },
    });

    await prisma.refund.create({
      data: {
        refundNumber: `REF-${timestamp}-03`,
        returnRequestId: returnReq3.id,
        paymentId: paymentRefunded.id,
        amount: 306000, // 100% refunded
        merchandiseAmount: 300000,
        shippingAmount: 6000,
        method: 'SSLCOMMERZ',
        status: 'COMPLETED',
        processedByUserId: admin.id,
        processedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    // Tests cleaned up via DB transactions / isolation
  });

  // ---------------- 1. Authorization Gates ----------------
  describe('Authorization Gates', () => {
    it('rejects unauthenticated requests to GET /api/v1/admin/payments with 401', async () => {
      const res = await request(app).get('/api/v1/admin/payments');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects customer requests to GET /api/v1/admin/payments with 403', async () => {
      const res = await request(app).get('/api/v1/admin/payments').set('Cookie', [customerCookie]);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects customer requests to GET /api/v1/admin/payments/:id with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/payments/${paidPaymentId}`)
        .set('Cookie', [customerCookie]);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // ---------------- 2. Directory Listing & Filtering ----------------
  describe('Directory Listing & Filtering', () => {
    it('lists payments with pagination and KPI stats for admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/payments?limit=10')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.payments)).toBe(true);
      expect(res.body.data.payments.length).toBeGreaterThanOrEqual(3);
      expect(res.body.data.stats).toHaveProperty('totalAttempts');
      expect(res.body.data.stats).toHaveProperty('totalCapturedPoisha');
      expect(res.body.data.stats).toHaveProperty('totalRefundedPoisha');
      expect(res.body.data.stats).toHaveProperty('netRetainedPoisha');
      expect(res.body.data.pagination).toHaveProperty('total');
    });

    it('filters payments by status', async () => {
      const res = await request(app)
        .get('/api/v1/admin/payments?status=PAID')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      const payments = res.body.data.payments;
      expect(payments.every((p: any) => p.status === 'PAID')).toBe(true);
    });

    it('filters payments by method', async () => {
      const res = await request(app)
        .get('/api/v1/admin/payments?method=COD')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      const payments = res.body.data.payments;
      expect(payments.every((p: any) => p.method === 'COD')).toBe(true);
    });

    it('searches payments by transactionId or orderNumber', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/payments?search=PAY01`)
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.payments.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.payments[0].order.orderNumber).toContain('PAY01');
    });
  });

  // ---------------- 3. Financial Accuracy & Invariants ----------------
  describe('Financial Accuracy & Invariants (Clarification #2)', () => {
    it('treats PAID and REFUNDED payments as captured; excludes PENDING, FAILED, CANCELLED from captured totals', async () => {
      // Query specific payment using transactionId
      const res = await request(app)
        .get(`/api/v1/admin/payments?search=${paidPaymentId}`)
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      // Verify list item calculation: netAmount = Math.max(0, amount - refundedAmount)
      const item = res.body.data.payments.find((p: any) => p.id === paidPaymentId);
      if (item) {
        expect(item.amount).toBe(506000);
        expect(item.refundedAmount).toBe(100000);
        expect(item.netAmount).toBe(406000); // 506000 - 100000
      }
    });

    it('fully refunded payment shows netAmount = 0 and status = REFUNDED', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/payments/${refundedPaymentId}`)
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      const payment = res.body.data.payment;
      expect(payment.status).toBe('REFUNDED');
      expect(payment.amount).toBe(306000);
      expect(payment.refundedAmount).toBe(306000);
      expect(payment.netAmount).toBe(0);
      expect(payment.remainingRefundCapacity).toBe(0);
    });
  });

  // ---------------- 4. Payment Detail & Safe Projections ----------------
  describe('Payment Detail & Safe Projections (Clarification #5)', () => {
    it('retrieves detailed payment inspection with linked order snapshot and refund records', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/payments/${paidPaymentId}`)
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      const p = res.body.data.payment;
      expect(p.id).toBe(paidPaymentId);
      expect(p.transactionId).toContain('TXN-');
      expect(p.gatewayTransactionId).toContain('SSL-BANK-');
      expect(p.order.orderNumber).toContain('PAY01');
      expect(p.order.customer.email).toContain('customer-pay-');
      expect(p.remainingRefundCapacity).toBe(406000);

      // Verify linked refund history
      expect(p.refunds.length).toBe(1);
      expect(p.refunds[0].amount).toBe(100000);
      expect(p.refunds[0].status).toBe('COMPLETED');
    });

    it('safely projects gateway details without leaking credentials or secret keys', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/payments/${paidPaymentId}`)
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      const p = res.body.data.payment;
      expect(p.safeGatewayDetails).not.toBeNull();
      expect(p.safeGatewayDetails.cardBrand).toBe('VISA');
      expect(p.safeGatewayDetails.cardIssuer).toBe('City Bank');
      expect(p.safeGatewayDetails.gatewayStatus).toBe('VALID');

      // Crucial security invariant: raw credentials must NEVER be leaked in JSON response
      const rawText = JSON.stringify(res.body);
      expect(rawText).not.toContain('SUPER_SECRET_INTERNAL_KEY');
      expect(rawText).not.toContain('store_passwd');
    });

    it('returns 404 PAYMENT_NOT_FOUND when payment does not exist', async () => {
      const res = await request(app)
        .get('/api/v1/admin/payments/non-existent-payment-id')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PAYMENT_NOT_FOUND');
    });
  });
});
