import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getCoupons, POST as createCoupon } from '../coupons/route';
import {
  GET as getCouponById,
  PATCH as updateCoupon,
  DELETE as deleteCoupon,
} from '../coupons/[id]/route';
import { PATCH as toggleActive } from '../coupons/[id]/toggle-active/route';

describe('BFF Admin Coupons Route Handlers (Phase 5B)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET & POST /api/admin/coupons', () => {
    it('forwards GET request with query params to Express API', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: [],
            pagination: { page: 1, limit: 15, total: 0, totalPages: 0 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/coupons?q=SUMMER&status=active&page=1',
      );
      const res = await getCoupons(req);

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/coupons');
      expect(forwardedUrl).toContain('q=SUMMER');
      expect(forwardedUrl).toContain('status=active');
    });

    it('rejects POST with cross-origin with 403', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/coupons', {
        method: 'POST',
        headers: {
          origin: 'http://malicious-site.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ code: 'HACK' }),
      });

      const res = await createCoupon(req);
      expect(res.status).toBe(403);
    });

    it('forwards POST with valid origin to Express API', async () => {
      let forwardedUrl = '';
      let forwardedBody = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedBody = (init.body as string) ?? '';
        return new Response(
          JSON.stringify({
            success: true,
            data: { id: 'cp-1', code: 'PROMO10' },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      });

      const payload = {
        code: 'PROMO10',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        startDate: '2026-11-11T00:00:00.000Z',
        endDate: '2026-11-18T00:00:00.000Z',
      };

      const req = new NextRequest('http://localhost:3000/api/admin/coupons', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const res = await createCoupon(req);
      expect(res.status).toBe(201);
      expect(forwardedUrl).toContain('/api/v1/admin/coupons');
      expect(JSON.parse(forwardedBody)).toEqual(payload);
    });
  });

  describe('PATCH & DELETE /api/admin/coupons/[id]', () => {
    it('forwards PATCH to Express with coupon ID and payload', async () => {
      let forwardedUrl = '';
      let forwardedBody = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedBody = (init.body as string) ?? '';
        return new Response(
          JSON.stringify({
            success: true,
            data: { id: 'cp-1', discountValue: 15 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/admin/coupons/cp-1', {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ discountValue: 15 }),
      });

      const res = await updateCoupon(req, { params: Promise.resolve({ id: 'cp-1' }) });
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/coupons/cp-1');
      expect(JSON.parse(forwardedBody)).toEqual({ discountValue: 15 });
    });

    it('forwards DELETE to Express with coupon ID', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init.method ?? 'GET';
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Coupon deleted',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/admin/coupons/cp-1', {
        method: 'DELETE',
        headers: { origin: 'http://localhost:3000' },
      });

      const res = await deleteCoupon(req, { params: Promise.resolve({ id: 'cp-1' }) });
      expect(res.status).toBe(200);
      expect(forwardedMethod).toBe('DELETE');
      expect(forwardedUrl).toContain('/api/v1/admin/coupons/cp-1');
    });

    it('forwards toggle-active PATCH to Express', async () => {
      let forwardedUrl = '';

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: { id: 'cp-1', isActive: false },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/admin/coupons/cp-1/toggle-active', {
        method: 'PATCH',
        headers: { origin: 'http://localhost:3000' },
      });

      const res = await toggleActive(req, { params: Promise.resolve({ id: 'cp-1' }) });
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/coupons/cp-1/toggle-active');
    });
  });
});
