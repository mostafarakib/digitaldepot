import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getAdminSettings, PUT as putAdminSettings } from '../settings/route';
import { GET as getStoreSettings } from '../../store/settings/route';

describe('BFF Settings Route Handlers (Phase 8A)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /api/admin/settings', () => {
    it('forwards GET request to Express API', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init.method ?? 'GET';
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: 'default',
              insideDhakaShippingFee: 6000,
              outsideDhakaShippingFee: 12000,
              freeShippingThreshold: 500000,
              estimatedDaysInsideDhakaMin: 2,
              estimatedDaysInsideDhakaMax: 3,
              estimatedDaysOutsideDhakaMin: 3,
              estimatedDaysOutsideDhakaMax: 5,
              storeName: 'DigitalDepot',
              supportEmail: 'support@digitaldepot.local',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/admin/settings', {
        method: 'GET',
        headers: {
          cookie: 'dd_access=test-token',
        },
      });

      const res = await getAdminSettings(req);
      expect(res.status).toBe(200);
      expect(forwardedMethod).toBe('GET');
      expect(forwardedUrl).toContain('/api/v1/admin/settings');
    });
  });

  describe('PUT /api/admin/settings', () => {
    it('rejects cross-origin request with 403 Forbidden', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/settings', {
        method: 'PUT',
        headers: {
          origin: 'http://malicious-attacker.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ insideDhakaShippingFee: 8000 }),
      });

      const res = await putAdminSettings(req);
      expect(res.status).toBe(403);
    });

    it('rejects request with invalid JSON body with 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/settings', {
        method: 'PUT',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: 'invalid-non-json-payload',
      });

      const res = await putAdminSettings(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('BAD_REQUEST');
    });

    it('forwards valid PUT request with body to Express API', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';
      let forwardedBody = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init.method ?? 'PUT';
        forwardedBody = (init.body as string) ?? '';
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: 'default',
              insideDhakaShippingFee: 8000,
              outsideDhakaShippingFee: 15000,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const updatePayload = {
        insideDhakaShippingFee: 8000,
        outsideDhakaShippingFee: 15000,
        freeShippingThreshold: 750000,
        estimatedDaysInsideDhakaMin: 1,
        estimatedDaysInsideDhakaMax: 2,
        estimatedDaysOutsideDhakaMin: 2,
        estimatedDaysOutsideDhakaMax: 4,
        storeName: 'DigitalDepot Flagship',
        supportEmail: 'support@digitaldepot.local',
        supportPhone: '+880 1700-000000',
        supportHours: 'Sat – Thu: 10:00 AM – 8:00 PM',
        storeAddress: 'Dhaka, Bangladesh',
      };

      const req = new NextRequest('http://localhost:3000/api/admin/settings', {
        method: 'PUT',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          'x-csrf-token': 'valid-csrf-token',
        },
        body: JSON.stringify(updatePayload),
      });

      const res = await putAdminSettings(req);
      expect(res.status).toBe(200);
      expect(forwardedMethod).toBe('PUT');
      expect(forwardedUrl).toContain('/api/v1/admin/settings');
      expect(JSON.parse(forwardedBody)).toEqual(updatePayload);
    });
  });

  describe('GET /api/store/settings (Public)', () => {
    it('forwards public store settings GET request without requiring admin auth', async () => {
      let forwardedUrl = '';

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              insideDhakaShippingFee: 6000,
              outsideDhakaShippingFee: 12000,
              freeShippingThreshold: 500000,
              estimatedDaysInsideDhakaMin: 2,
              estimatedDaysInsideDhakaMax: 3,
              estimatedDaysOutsideDhakaMin: 3,
              estimatedDaysOutsideDhakaMax: 5,
              storeName: 'DigitalDepot',
              supportEmail: 'support@digitaldepot.local',
              supportPhone: '+880 1700-000000',
              supportHours: 'Sat – Thu: 10:00 AM – 8:00 PM',
              storeAddress: 'Dhaka, Bangladesh',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/store/settings', {
        method: 'GET',
      });

      const res = await getStoreSettings(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/store/settings');
    });
  });
});
