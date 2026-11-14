import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getOverview } from '../reports/overview/route';
import { GET as getSales } from '../reports/sales/route';
import { GET as getFulfillment } from '../reports/fulfillment/route';
import { GET as getInventory } from '../reports/inventory/route';
import { GET as getReturns } from '../reports/returns/route';

describe('BFF Admin Reports Route Handlers (Phase 8D)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('GET /api/admin/reports/overview forwards to Express', async () => {
    let forwardedUrl = '';
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      forwardedUrl = url;
      return new Response(JSON.stringify({ success: true, data: { activeOrdersCount: 5 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const req = new NextRequest('http://localhost:3000/api/admin/reports/overview');
    const res = await getOverview(req);

    expect(res.status).toBe(200);
    expect(forwardedUrl).toContain('/api/v1/admin/reports/overview');
  });

  it('GET /api/admin/reports/sales forwards query params to Express', async () => {
    let forwardedUrl = '';
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      forwardedUrl = url;
      return new Response(
        JSON.stringify({ success: true, data: { deliveredSales: {}, cashAndPayments: {} } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const req = new NextRequest(
      'http://localhost:3000/api/admin/reports/sales?preset=last7days&dateFrom=2026-11-01',
    );
    const res = await getSales(req);

    expect(res.status).toBe(200);
    expect(forwardedUrl).toContain('/api/v1/admin/reports/sales');
    expect(forwardedUrl).toContain('preset=last7days');
  });

  it('GET /api/admin/reports/fulfillment forwards query params to Express', async () => {
    let forwardedUrl = '';
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      forwardedUrl = url;
      return new Response(JSON.stringify({ success: true, data: { cycleTimes: {} } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const req = new NextRequest(
      'http://localhost:3000/api/admin/reports/fulfillment?preset=thisMonth',
    );
    const res = await getFulfillment(req);

    expect(res.status).toBe(200);
    expect(forwardedUrl).toContain('/api/v1/admin/reports/fulfillment');
    expect(forwardedUrl).toContain('preset=thisMonth');
  });

  it('GET /api/admin/reports/inventory forwards query params to Express', async () => {
    let forwardedUrl = '';
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      forwardedUrl = url;
      return new Response(JSON.stringify({ success: true, data: { valuation: {} } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const req = new NextRequest('http://localhost:3000/api/admin/reports/inventory?preset=today');
    const res = await getInventory(req);

    expect(res.status).toBe(200);
    expect(forwardedUrl).toContain('/api/v1/admin/reports/inventory');
  });

  it('GET /api/admin/reports/returns forwards query params to Express', async () => {
    let forwardedUrl = '';
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      forwardedUrl = url;
      return new Response(JSON.stringify({ success: true, data: { returnVolume: {} } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const req = new NextRequest(
      'http://localhost:3000/api/admin/reports/returns?preset=last30days',
    );
    const res = await getReturns(req);

    expect(res.status).toBe(200);
    expect(forwardedUrl).toContain('/api/v1/admin/reports/returns');
  });
});
