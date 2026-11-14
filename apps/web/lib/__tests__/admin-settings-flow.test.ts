import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPublicStoreSettingsApi,
  getAdminStoreSettingsApi,
  updateAdminStoreSettingsApi,
  setInMemoryCsrfToken,
} from '../api-client';

describe('Admin & Store Settings API Client Flow (Phase 8A)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    setInMemoryCsrfToken('test-csrf-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  it('getPublicStoreSettingsApi fetches public store settings from /api/store/settings', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
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
        ),
      );
    });

    const settings = await getPublicStoreSettingsApi();

    expect(capturedUrl).toBe('/api/store/settings');
    expect(settings.storeName).toBe('DigitalDepot');
    expect(settings.insideDhakaShippingFee).toBe(6000);
    expect(settings.outsideDhakaShippingFee).toBe(12000);
    expect(settings.freeShippingThreshold).toBe(500000);
  });

  it('getAdminStoreSettingsApi fetches full admin settings from /api/admin/settings', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
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
              supportPhone: '+880 1700-000000',
              supportHours: 'Sat – Thu: 10:00 AM – 8:00 PM',
              storeAddress: 'Dhaka, Bangladesh',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const settings = await getAdminStoreSettingsApi();

    expect(capturedUrl).toBe('/api/admin/settings');
    expect(settings.id).toBe('default');
    expect(settings.storeName).toBe('DigitalDepot');
  });

  it('updateAdminStoreSettingsApi sends PUT to /api/admin/settings with CSRF header and payload', async () => {
    let capturedUrl = '';
    let capturedOptions: RequestInit | undefined;

    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      capturedUrl = url;
      capturedOptions = options;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: 'default',
              insideDhakaShippingFee: 7000,
              outsideDhakaShippingFee: 13000,
              freeShippingThreshold: 600000,
              estimatedDaysInsideDhakaMin: 1,
              estimatedDaysInsideDhakaMax: 2,
              estimatedDaysOutsideDhakaMin: 2,
              estimatedDaysOutsideDhakaMax: 4,
              storeName: 'DigitalDepot Updated',
              supportEmail: 'customercare@digitaldepot.local',
              supportPhone: '+880 1800-111222',
              supportHours: 'Sat – Thu: 9:00 AM – 9:00 PM',
              storeAddress: 'Gulshan-2, Dhaka, Bangladesh',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              updatedByUserId: 'admin-user-id',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const updatePayload = {
      insideDhakaShippingFee: 7000,
      outsideDhakaShippingFee: 13000,
      freeShippingThreshold: 600000,
      estimatedDaysInsideDhakaMin: 1,
      estimatedDaysInsideDhakaMax: 2,
      estimatedDaysOutsideDhakaMin: 2,
      estimatedDaysOutsideDhakaMax: 4,
      storeName: 'DigitalDepot Updated',
      supportEmail: 'customercare@digitaldepot.local',
      supportPhone: '+880 1800-111222',
      supportHours: 'Sat – Thu: 9:00 AM – 9:00 PM',
      storeAddress: 'Gulshan-2, Dhaka, Bangladesh',
    };

    const result = await updateAdminStoreSettingsApi(updatePayload);

    expect(capturedUrl).toBe('/api/admin/settings');
    expect(capturedOptions?.method).toBe('PUT');
    const headers = capturedOptions?.headers;
    const csrfToken =
      headers instanceof Headers
        ? headers.get('x-csrf-token')
        : (headers as Record<string, string>)?.[['x-csrf-token'] as any];
    expect(csrfToken).toBe('test-csrf-token');
    expect(JSON.parse(capturedOptions?.body as string)).toEqual(updatePayload);
    expect(result.insideDhakaShippingFee).toBe(7000);
    expect(result.storeName).toBe('DigitalDepot Updated');
  });
});
