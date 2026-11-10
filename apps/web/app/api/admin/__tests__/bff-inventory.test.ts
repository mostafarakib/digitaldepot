import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getInventory } from '../inventory/route';
import { POST as postAdjust } from '../inventory/adjust/route';
import { GET as getGlobalHistory } from '../inventory/history/route';
import { GET as getVariantHistory } from '../inventory/[variantId]/history/route';
import { PATCH as patchThreshold } from '../inventory/[variantId]/threshold/route';

describe('BFF Admin Inventory Route Handlers (Phase 4C)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Inventory BFF Routes', () => {
    it('forwards GET /api/admin/inventory with query parameters', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(JSON.stringify({ success: true, data: { items: [] } }), {
          status: 200,
        });
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/inventory?search=macbook&stockStatus=low_stock&page=1',
        { method: 'GET' },
      );

      const res = await getInventory(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain(
        '/api/v1/admin/inventory?search=macbook&stockStatus=low_stock&page=1',
      );
    });

    it('enforces Origin check and forwards POST /api/admin/inventory/adjust', async () => {
      let forwardedBody = '';
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        forwardedBody = init.body as string;
        return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
      });

      // 1. Without origin: 403 Forbidden
      const badReq = new NextRequest('http://localhost:3000/api/admin/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({
          variantId: 'v1',
          type: 'RECEIVE',
          quantityDelta: 5,
          reason: 'Test',
        }),
      });
      const badRes = await postAdjust(badReq);
      expect(badRes.status).toBe(403);

      // 2. With matching Origin: 200 OK
      const validReq = new NextRequest('http://localhost:3000/api/admin/inventory/adjust', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          variantId: 'v1',
          type: 'RECEIVE',
          quantityDelta: 5,
          reason: 'Test',
        }),
      });
      const res = await postAdjust(validReq);
      expect(res.status).toBe(200);
      expect(JSON.parse(forwardedBody)).toEqual({
        variantId: 'v1',
        type: 'RECEIVE',
        quantityDelta: 5,
        reason: 'Test',
      });
    });

    it('forwards GET /api/admin/inventory/history', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      });

      const req = new NextRequest('http://localhost:3000/api/admin/inventory/history?page=2', {
        method: 'GET',
      });

      const res = await getGlobalHistory(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/inventory/history?page=2');
    });

    it('forwards GET /api/admin/inventory/[variantId]/history', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/inventory/var_123/history?page=1',
        { method: 'GET' },
      );

      const res = await getVariantHistory(req, {
        params: Promise.resolve({ variantId: 'var_123' }),
      });
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/inventory/variant/var_123/history?page=1');
    });

    it('enforces Origin check and forwards PATCH /api/admin/inventory/[variantId]/threshold', async () => {
      let forwardedBody = '';
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        forwardedBody = init.body as string;
        return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
      });

      const req = new NextRequest('http://localhost:3000/api/admin/inventory/var_456/threshold', {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ lowStockThreshold: 10 }),
      });

      const res = await patchThreshold(req, {
        params: Promise.resolve({ variantId: 'var_456' }),
      });
      expect(res.status).toBe(200);
      expect(JSON.parse(forwardedBody)).toEqual({ lowStockThreshold: 10 });
    });
  });
});
