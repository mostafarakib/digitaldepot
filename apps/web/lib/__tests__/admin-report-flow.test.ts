import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAdminOverviewReportApi,
  getAdminSalesReportApi,
  getAdminFulfillmentReportApi,
  getAdminInventoryReportApi,
  getAdminReturnsReportApi,
} from '../api-client';

describe('Admin Report Flow Client SDK (Phase 8D)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('getAdminOverviewReportApi calls /api/admin/reports/overview', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              todayDeliveredSalesPoisha: 150000,
              activeOrdersCount: 8,
              lowStockAlertsCount: 3,
              totalCustomersCount: 140,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const res = await getAdminOverviewReportApi();
    expect(capturedUrl).toBe('/api/admin/reports/overview');
    expect(res.todayDeliveredSalesPoisha).toBe(150000);
    expect(res.activeOrdersCount).toBe(8);
  });

  it('getAdminSalesReportApi builds query string correctly', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              period: { preset: 'last7days' },
              deliveredSales: { grossDeliveredTotalPoisha: 500000 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const res = await getAdminSalesReportApi({
      preset: 'last7days',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-07',
    });

    expect(capturedUrl).toContain('/api/admin/reports/sales');
    expect(capturedUrl).toContain('preset=last7days');
    expect(capturedUrl).toContain('dateFrom=2026-11-01');
    expect(capturedUrl).toContain('dateTo=2026-11-07');
    expect(res.deliveredSales.grossDeliveredTotalPoisha).toBe(500000);
  });

  it('getAdminFulfillmentReportApi, getAdminInventoryReportApi, getAdminReturnsReportApi call appropriate routes', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true, data: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await getAdminFulfillmentReportApi({ preset: 'thisMonth' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/reports/fulfillment?preset=thisMonth'),
      expect.anything(),
    );

    await getAdminInventoryReportApi({ preset: 'today' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/reports/inventory?preset=today'),
      expect.anything(),
    );

    await getAdminReturnsReportApi({ preset: 'last30days' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/reports/returns?preset=last30days'),
      expect.anything(),
    );
  });
});
