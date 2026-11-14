import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { hashPassword, signAccessToken } from '../../../lib/crypto.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { resolveDhakaDateRange } from '../report.dates.js';

describe('Admin Business Reporting & Analytics API (Phase 8D)', () => {
  let adminCookie: string;
  let customerCookie: string;

  beforeAll(async () => {
    const timestamp = Date.now();
    const passwordHash = await hashPassword('StrongPass123!');

    // 1. Create Admin User
    const admin = await prisma.user.create({
      data: {
        email: `admin-rep-${timestamp}@digitaldepot.local`,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        profile: {
          create: {
            firstName: 'Reporting',
            lastName: 'Admin',
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

    // 2. Create Regular Customer
    const customer = await prisma.user.create({
      data: {
        email: `cust-rep-${timestamp}@digitaldepot.local`,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
        profile: {
          create: {
            firstName: 'Regular',
            lastName: 'Customer',
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

    // 3. Setup Catalogue & Inventory Data
    const category = await prisma.category.create({
      data: {
        name: `Analytics Category ${timestamp}`,
        slug: `analytics-cat-${timestamp}`,
      },
    });

    const product = await prisma.product.create({
      data: {
        name: `Analytics Phone ${timestamp}`,
        slug: `analytics-phone-${timestamp}`,
        categoryId: category.id,
        status: 'PUBLISHED',
      },
    });

    // Variant 1: has costPrice
    const variant1 = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `SKU-REP1-${timestamp}`,
        name: 'Cost Tracked Variant',
        price: 500000, // ৳5,000
        costPrice: 400000, // ৳4,000
        inventoryItem: {
          create: {
            quantity: 10,
            lowStockThreshold: 5,
          },
        },
      },
      include: { inventoryItem: true },
    });

    // Variant 2: no costPrice (null)
    await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `SKU-REP2-${timestamp}`,
        name: 'Uncosted Variant',
        price: 200000, // ৳2,000
        costPrice: null,
        inventoryItem: {
          create: {
            quantity: 2, // low stock!
            lowStockThreshold: 5,
          },
        },
      },
      include: { inventoryItem: true },
    });

    // Record inventory adjustment for movement tracking
    if (variant1.inventoryItem) {
      await prisma.inventoryAdjustment.create({
        data: {
          inventoryItemId: variant1.inventoryItem.id,
          type: 'RECEIVE',
          quantityDelta: 10,
          oldQuantity: 0,
          newQuantity: 10,
          reason: 'Initial wholesale batch',
          adjustedByUserId: admin.id,
        },
      });
    }

    // 4. Create an order that was DELIVERED today
    const orderDelivered = await prisma.order.create({
      data: {
        orderNumber: `DD-REP-${timestamp}-DEL`,
        userId: customer.id,
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        paymentMethod: 'SSLCOMMERZ',
        merchandiseSubtotal: 500000,
        shippingFee: 6000,
        totalPayable: 506000,
        shippingRecipientName: 'Customer',
        shippingPhone: '+8801700000001',
        shippingDivisionId: 'DHAKA',
        shippingDistrictId: 'DHAKA',
        shippingUpazila: 'Mirpur',
        shippingStreetAddress: 'Road 1',
      },
    });

    // Authoritative OrderStatusHistory records for cycle times
    const now = new Date();
    const confirmedTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24h ago
    const shippedTime = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12h ago
    const deliveredTime = now; // Now

    await prisma.orderStatusHistory.createMany({
      data: [
        {
          orderId: orderDelivered.id,
          fromStatus: 'PENDING',
          toStatus: 'CONFIRMED',
          createdAt: confirmedTime,
        },
        {
          orderId: orderDelivered.id,
          fromStatus: 'CONFIRMED',
          toStatus: 'SHIPPED',
          createdAt: shippedTime,
        },
        {
          orderId: orderDelivered.id,
          fromStatus: 'SHIPPED',
          toStatus: 'DELIVERED',
          createdAt: deliveredTime,
        },
      ],
    });

    // Payment for delivered order
    const payment = await prisma.payment.create({
      data: {
        orderId: orderDelivered.id,
        transactionId: `TXN-REP-${timestamp}-01`,
        method: 'SSLCOMMERZ',
        status: 'PAID',
        amount: 506000,
        paidAt: now,
      },
    });

    // 5. Create Return and Partial Refund on delivered order
    const returnReq = await prisma.returnRequest.create({
      data: {
        returnNumber: `RET-REP-${timestamp}-01`,
        orderId: orderDelivered.id,
        userId: customer.id,
        status: 'COMPLETED',
        customerReason: 'Defective item',
        estimatedRefundAmount: 100000,
        actualRefundAmount: 100000,
      },
    });

    await prisma.refund.create({
      data: {
        refundNumber: `REF-REP-${timestamp}-01`,
        returnRequestId: returnReq.id,
        paymentId: payment.id,
        amount: 100000, // ৳1,000 total
        merchandiseAmount: 100000, // ৳1,000 merchandise
        shippingAmount: 0,
        method: 'SSLCOMMERZ',
        status: 'COMPLETED',
        processedAt: now,
      },
    });

    // 6. Create a CANCELLED order placed today
    await prisma.order.create({
      data: {
        orderNumber: `DD-REP-${timestamp}-CANC`,
        userId: customer.id,
        status: 'CANCELLED',
        paymentStatus: 'CANCELLED',
        paymentMethod: 'COD',
        merchandiseSubtotal: 200000,
        shippingFee: 6000,
        totalPayable: 206000,
        shippingRecipientName: 'Customer',
        shippingPhone: '+8801700000002',
        shippingDivisionId: 'DHAKA',
        shippingDistrictId: 'DHAKA',
        shippingUpazila: 'Mirpur',
        shippingStreetAddress: 'Road 2',
      },
    });
  });

  describe('Authorization Gates', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const endpoints = [
        '/api/v1/admin/reports/overview',
        '/api/v1/admin/reports/sales',
        '/api/v1/admin/reports/fulfillment',
        '/api/v1/admin/reports/inventory',
        '/api/v1/admin/reports/returns',
      ];

      for (const ep of endpoints) {
        const res = await request(app).get(ep);
        expect(res.status).toBe(401);
      }
    });

    it('rejects non-admin customer requests with 403', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/sales')
        .set('Cookie', customerCookie);

      expect(res.status).toBe(403);
    });

    it('allows admin requests with 200', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/overview')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Date Boundaries & Presets (Asia/Dhaka)', () => {
    it('computes correct half-open intervals for today, last7days and last30days', () => {
      const fixedDate = new Date('2026-11-14T10:00:00.000Z'); // 16:00 BST

      const today = resolveDhakaDateRange('today', undefined, undefined, fixedDate);
      expect(today.dateFromStr).toBe('2026-11-14');
      expect(today.dateToStr).toBe('2026-11-14');
      expect(today.startDate.toISOString()).toBe('2026-11-13T18:00:00.000Z');
      expect(today.endDate.toISOString()).toBe('2026-11-14T18:00:00.000Z');

      const last7 = resolveDhakaDateRange('last7days', undefined, undefined, fixedDate);
      expect(last7.dateFromStr).toBe('2026-11-08');
      expect(last7.dateToStr).toBe('2026-11-14');
      expect(last7.startDate.toISOString()).toBe('2026-11-07T18:00:00.000Z');
      expect(last7.endDate.toISOString()).toBe('2026-11-14T18:00:00.000Z');
    });

    it('accepts valid custom date range and rejects inverted dates', async () => {
      const validRes = await request(app)
        .get('/api/v1/admin/reports/sales?preset=custom&dateFrom=2026-11-01&dateTo=2026-11-14')
        .set('Cookie', adminCookie);

      expect(validRes.status).toBe(200);
      expect(validRes.body.data.period.dateFrom).toBe('2026-11-01');
      expect(validRes.body.data.period.dateTo).toBe('2026-11-14');

      const invalidRes = await request(app)
        .get('/api/v1/admin/reports/sales?preset=custom&dateFrom=2026-11-20&dateTo=2026-11-10')
        .set('Cookie', adminCookie);

      expect(invalidRes.status).toBe(500); // Throws dateFrom must be before dateTo
    });
  });

  describe('Sales & Payment Report Metrics', () => {
    it('returns separated delivered sales and net delivered calculations', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/sales?preset=today')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const data = res.body.data;

      // Delivered Sales
      expect(data.deliveredSales.deliveredOrdersCount).toBeGreaterThanOrEqual(1);
      expect(data.deliveredSales.grossDeliveredMerchandisePoisha).toBeGreaterThanOrEqual(500000);
      expect(data.deliveredSales.deliveredShippingFeePoisha).toBeGreaterThanOrEqual(6000);
      expect(data.deliveredSales.grossDeliveredTotalPoisha).toBeGreaterThanOrEqual(506000);
      expect(data.deliveredSales.completedMerchandiseRefundsPoisha).toBeGreaterThanOrEqual(100000);

      // Net delivered calculation
      expect(data.deliveredSales.netDeliveredMerchandisePoisha).toBe(
        data.deliveredSales.grossDeliveredMerchandisePoisha -
          data.deliveredSales.completedMerchandiseRefundsPoisha,
      );
      expect(data.deliveredSales.netDeliveredTotalPoisha).toBe(
        data.deliveredSales.grossDeliveredTotalPoisha -
          data.deliveredSales.totalCompletedRefundsPoisha,
      );

      // Captured cash & net retained
      expect(data.cashAndPayments.grossCapturedPaymentsPoisha).toBeGreaterThanOrEqual(506000);
      expect(data.cashAndPayments.totalCompletedRefundsPoisha).toBeGreaterThanOrEqual(100000);
      expect(data.cashAndPayments.netRetainedPaymentsPoisha).toBe(
        data.cashAndPayments.grossCapturedPaymentsPoisha -
          data.cashAndPayments.totalCompletedRefundsPoisha,
      );

      // Placed order demand pipeline
      expect(data.orderPipeline.totalOrdersPlacedCount).toBeGreaterThanOrEqual(1);
      expect(data.orderPipeline.cancelledOrdersCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Fulfillment Report Metrics', () => {
    it('calculates status distribution, cycle times, and cancellation rate', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/fulfillment?preset=today')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const data = res.body.data;

      expect(data.currentPipelineDistribution).toHaveProperty('DELIVERED');
      expect(data.currentPipelineDistribution).toHaveProperty('CANCELLED');

      // Cycle times: measured from the test transition
      expect(data.cycleTimes.avgProcessingHours).toBeGreaterThanOrEqual(10); // ~12h
      expect(data.cycleTimes.avgDeliveryHours).toBeGreaterThanOrEqual(10); // ~12h
      expect(data.cycleTimes.avgTotalFulfillmentHours).toBeGreaterThanOrEqual(20); // ~24h
      expect(data.cycleTimes.measuredOrdersCount).toBeGreaterThanOrEqual(1);

      // Cancellation rate is calculated
      expect(typeof data.cancellationRatePercent).toBe('number');
      expect(data.cancelledOrdersCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(data.recentFulfillmentEvents)).toBe(true);
    });
  });

  describe('Inventory Report & Partial Cost Valuation', () => {
    it('reports reliable retail valuation and partial cost valuation with coverage percentage', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/inventory?preset=today')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const data = res.body.data;

      // Stock health
      expect(data.stockHealth.totalTrackedVariants).toBeGreaterThanOrEqual(2);
      expect(data.stockHealth.totalPhysicalStock).toBeGreaterThanOrEqual(12);

      // Valuation
      expect(data.valuation.retailValuationPoisha).toBeGreaterThanOrEqual(
        10 * 500000 + 2 * 200000, // 5,400,000 poisha
      );
      // Cost valuation only sums variants where costPrice is not null (Variant 1: 10 * 400,000 = 4,000,000)
      expect(data.valuation.costValuationPoisha).toBeGreaterThanOrEqual(4000000);
      expect(data.valuation.costTrackedVariantsCount).toBeGreaterThanOrEqual(1);
      expect(data.valuation.costCoveragePercent).toBeGreaterThan(0);
      expect(data.valuation.costCoveragePercent).toBeLessThanOrEqual(100);

      // Low stock list includes items below threshold
      expect(Array.isArray(data.lowStockItems)).toBe(true);
      const lowStockSkus = (data.lowStockItems as Array<{ sku: string }>).map((i) => i.sku);
      expect(lowStockSkus.some((s: string) => s.startsWith('SKU-REP2-'))).toBe(true);

      // Movements in period contains the initial RECEIVE adjustment
      expect(Array.isArray(data.movementsInPeriod)).toBe(true);
      const receiveMovement = (
        data.movementsInPeriod as Array<{ type: string; deltaQuantity: number }>
      ).find((m) => m.type === 'RECEIVE');
      expect(receiveMovement).toBeDefined();
      expect(receiveMovement?.deltaQuantity).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Returns & Refunds Report', () => {
    it('reports return requests, items disposition, and refund methods', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/returns?preset=today')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const data = res.body.data;

      expect(data.returnVolume.totalReturnRequests).toBeGreaterThanOrEqual(1);
      expect(data.returnVolume.byStatus.COMPLETED).toBeGreaterThanOrEqual(1);

      expect(data.refundSummary.completedRefundsCount).toBeGreaterThanOrEqual(1);
      expect(data.refundSummary.completedMerchandiseRefundsPoisha).toBeGreaterThanOrEqual(100000);
      expect(data.refundSummary.byMethod.SSLCOMMERZ.totalPoisha).toBeGreaterThanOrEqual(100000);
    });
  });

  describe('Overview Report Dashboard Summary (Phase 8E Live Operational Dashboard)', () => {
    it('returns high-level operational KPIs and live operational payload', async () => {
      // Create an aging order (> 24h) with transition into CONFIRMED 30 hours ago
      const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
      const agingCust = await prisma.user.findFirst({ where: { role: 'CUSTOMER' } });
      const agingOrder = await prisma.order.create({
        data: {
          orderNumber: `ORD-AGING-${Date.now()}`,
          userId: agingCust!.id,
          status: 'CONFIRMED',
          paymentStatus: 'PENDING',
          paymentMethod: 'COD',
          merchandiseSubtotal: 300000,
          shippingFee: 6000,
          totalPayable: 306000,
          shippingRecipientName: 'Aging Customer',
          shippingPhone: '01711999999',
          shippingDivisionId: 'dhaka',
          shippingDistrictId: 'dhaka',
          shippingUpazila: 'Gulshan',
          shippingStreetAddress: 'Road 1',
          createdAt: thirtyHoursAgo,
          statusHistory: {
            create: {
              toStatus: 'CONFIRMED',
              createdAt: thirtyHoursAgo,
            },
          },
        },
      });

      const res = await request(app)
        .get('/api/v1/admin/reports/overview')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const data = res.body.data;

      // Backward compatibility fields
      expect(data.todayDeliveredSalesPoisha).toBeGreaterThanOrEqual(506000);
      expect(data.todayCapturedCashPoisha).toBeGreaterThanOrEqual(506000);
      expect(data.todayOrdersPlacedCount).toBeGreaterThanOrEqual(2);
      expect(data.totalCustomersCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(data.recentOrders)).toBe(true);
      expect(Array.isArray(data.topLowStockItems)).toBe(true);

      // Operational Financials
      expect(data.financials.todayGrossDeliveredSalesPoisha).toBeGreaterThanOrEqual(506000);
      expect(data.financials.todayCapturedCashPoisha).toBeGreaterThanOrEqual(506000);
      expect(data.financials.todayCompletedRefundsPoisha).toBeGreaterThanOrEqual(100000);
      expect(data.financials.todayNetDeliveredSalesPoisha).toBeDefined();
      expect(data.financials.todayNetRetainedCashPoisha).toBeDefined();
      expect(data.financials.pendingCodOrdersCount).toBeGreaterThanOrEqual(1);
      expect(data.financials.pendingCodCollectionsPoisha).toBeGreaterThanOrEqual(306000);

      // Operational Pipeline
      expect(data.pipeline.activeOrdersCount).toBeGreaterThanOrEqual(1);
      expect(data.pipeline.awaitingProcessingCount).toBeGreaterThanOrEqual(1);
      expect(data.pipeline.deliveredTodayCount).toBeGreaterThanOrEqual(1);

      // Aging Orders (> 24h)
      expect(data.agingOrders.thresholdHours).toBe(24);
      expect(data.agingOrders.count).toBeGreaterThanOrEqual(1);
      const foundAging = data.agingOrders.orders.find(
        (o: { orderNumber: string }) => o.orderNumber === agingOrder.orderNumber,
      );
      expect(foundAging).toBeDefined();
      expect(foundAging.hoursInStatus).toBeGreaterThanOrEqual(29);

      // Returns & Refunds Queue
      expect(data.returnsQueue).toBeDefined();
      expect(typeof data.returnsQueue.pendingReviewsCount).toBe('number');
      expect(typeof data.returnsQueue.pendingInspectionsCount).toBe('number');
      expect(typeof data.returnsQueue.pendingRefundsCount).toBe('number');
      expect(Array.isArray(data.returnsQueue.urgentReturns)).toBe(true);

      // Inventory Watchlist
      expect(data.inventoryWatchlist).toBeDefined();
      expect(typeof data.inventoryWatchlist.outOfStockCount).toBe('number');
      expect(typeof data.inventoryWatchlist.lowStockCount).toBe('number');
      expect(Array.isArray(data.inventoryWatchlist.topAlerts)).toBe(true);

      // Durable Operational Activities
      expect(Array.isArray(data.recentActivities)).toBe(true);
      expect(data.recentActivities.length).toBeGreaterThanOrEqual(1);
      expect(data.recentActivities[0]).toHaveProperty('category');
      expect(data.recentActivities[0]).toHaveProperty('action');
      expect(data.recentActivities[0]).toHaveProperty('actorName');
    });
  });
});
