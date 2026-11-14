import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAdminAuditLogsApi, getAdminAuditActorsApi } from '../api-client';

describe('Admin Audit Logs API Client Flow (Phase 8C)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('getAdminAuditLogsApi sends GET request with category and search filters', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              logs: [],
              stats: {
                totalEvents: 50,
                orderEvents: 20,
                returnEvents: 10,
                refundEvents: 5,
                inventoryEvents: 10,
                pricingEvents: 3,
                customerEvents: 2,
              },
              pagination: { page: 1, limit: 25, total: 50, totalPages: 2 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await getAdminAuditLogsApi({
      page: 1,
      limit: 25,
      category: 'INVENTORY',
      search: 'IPHONE',
    });

    expect(capturedUrl).toContain('/api/admin/audit-logs');
    expect(capturedUrl).toContain('category=INVENTORY');
    expect(capturedUrl).toContain('search=IPHONE');
    expect(result.stats.totalEvents).toBe(50);
    expect(result.stats.inventoryEvents).toBe(10);
  });

  it('getAdminAuditActorsApi fetches list of admin actors', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              actors: [
                { id: 'admin-1', email: 'admin@digitaldepot.local', name: 'Admin', role: 'ADMIN' },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await getAdminAuditActorsApi();

    expect(capturedUrl).toBe('/api/admin/audit-logs/actors');
    expect(result.actors.length).toBe(1);
    expect(result.actors[0].email).toBe('admin@digitaldepot.local');
  });
});
