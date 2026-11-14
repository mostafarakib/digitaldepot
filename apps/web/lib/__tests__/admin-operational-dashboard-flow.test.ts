import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAdminOverviewReportApi } from '../api-client';
import type { OverviewReportResponse } from '../report-types';

describe('Live Operational Dashboard Flow & Client SDK (Phase 8E)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches complete live operational dashboard payload with all sections', async () => {
    const mockPayload: OverviewReportResponse = {
      todayDeliveredSalesPoisha: 250000,
      todayOrdersPlacedCount: 12,
      todayCapturedCashPoisha: 320000,
      activeOrdersCount: 15,
      lowStockAlertsCount: 4,
      totalCustomersCount: 120,
      recentOrders: [
        {
          id: 'ord-1',
          orderNumber: 'DD-20261115-001',
          customerName: 'Rahim Ahmed',
          totalPayable: 150000,
          status: 'PROCESSING',
          paymentStatus: 'PAID',
          paymentMethod: 'SSLCOMMERZ',
          createdAt: new Date().toISOString(),
        },
      ],
      topLowStockItems: [
        {
          sku: 'SKU-001',
          productName: 'Mechanical Keyboard',
          categoryName: 'Accessories',
          quantity: 2,
          lowStockThreshold: 5,
        },
      ],
      financials: {
        todayDeliveredMerchandisePoisha: 200000,
        todayDeliveredShippingPoisha: 50000,
        todayGrossDeliveredSalesPoisha: 250000,
        todayCompletedRefundsPoisha: 20000,
        todayNetDeliveredSalesPoisha: 230000,
        todayCapturedCashPoisha: 320000,
        todayNetRetainedCashPoisha: 300000,
        pendingCodOrdersCount: 6,
        pendingCodCollectionsPoisha: 450000,
      },
      pipeline: {
        activeOrdersCount: 15,
        pendingOnlineCount: 2,
        awaitingProcessingCount: 5,
        awaitingShipmentCount: 4,
        inTransitCount: 4,
        deliveredTodayCount: 8,
        cancelledTodayCount: 1,
        failedPaymentsLast24hCount: 0,
      },
      agingOrders: {
        count: 1,
        thresholdHours: 24,
        orders: [
          {
            id: 'ord-aging-1',
            orderNumber: 'DD-20261114-999',
            customerName: 'Karim Ullah',
            status: 'CONFIRMED',
            paymentMethod: 'COD',
            paymentStatus: 'PENDING',
            totalPayable: 200000,
            hoursInStatus: 36,
            statusChangedAt: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
            createdAt: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
          },
        ],
      },
      returnsQueue: {
        pendingReviewsCount: 2,
        pendingInspectionsCount: 1,
        pendingRefundsCount: 3,
        pendingRefundsPoisha: 75000,
        failedRefundsCount: 0,
        urgentReturns: [
          {
            id: 'ret-1',
            returnNumber: 'RET-20261115-001',
            orderNumber: 'DD-20261113-100',
            customerName: 'Sultana Begum',
            status: 'REQUESTED',
            estimatedRefundAmount: 25000,
            createdAt: new Date().toISOString(),
          },
        ],
      },
      inventoryWatchlist: {
        outOfStockCount: 1,
        lowStockCount: 3,
        topAlerts: [
          {
            sku: 'SKU-ZERO',
            productName: 'Gaming Mouse',
            categoryName: 'Peripherals',
            quantity: 0,
            lowStockThreshold: 5,
            isOutOfStock: true,
          },
        ],
      },
      recentActivities: [
        {
          id: 'act-1',
          category: 'ORDER',
          action: 'Status -> SHIPPED',
          description: 'Order DD-20261115-001 moved to SHIPPED',
          actorName: 'Warehouse Admin',
          createdAt: new Date().toISOString(),
        },
      ],
    };

    let requestedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      requestedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data: mockPayload }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const res = await getAdminOverviewReportApi();
    expect(requestedUrl).toBe('/api/admin/reports/overview');
    expect(res.pipeline.activeOrdersCount).toBe(15);
    expect(res.financials.pendingCodCollectionsPoisha).toBe(450000);
    expect(res.agingOrders.orders[0].hoursInStatus).toBe(36);
    expect(res.returnsQueue.pendingRefundsPoisha).toBe(75000);
    expect(res.inventoryWatchlist.outOfStockCount).toBe(1);
    expect(res.recentActivities[0].category).toBe('ORDER');
  });

  it('throws ApiError when backend returns an error response', async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    await expect(getAdminOverviewReportApi()).rejects.toThrow('Authentication required');
  });
});
