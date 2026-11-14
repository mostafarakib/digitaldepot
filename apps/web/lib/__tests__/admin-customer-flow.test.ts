import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAdminCustomersApi,
  getAdminCustomerDetailApi,
  updateAdminCustomerStatusApi,
  setInMemoryCsrfToken,
} from '../api-client';

describe('Admin Customers API Client Flow (Phase 8B)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    setInMemoryCsrfToken('test-csrf-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  it('getAdminCustomersApi sends GET request with search, status, and order filters', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              customers: [],
              stats: {
                totalCustomers: 10,
                activeCustomers: 9,
                suspendedCustomers: 1,
                verifiedCustomers: 8,
              },
              pagination: { page: 1, limit: 20, total: 10, totalPages: 1 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await getAdminCustomersApi({
      page: 1,
      limit: 20,
      search: 'Rahim',
      status: 'ACTIVE',
      minOrders: 1,
      sortBy: 'ltvDesc',
    });

    expect(capturedUrl).toContain('/api/admin/customers?');
    expect(capturedUrl).toContain('page=1');
    expect(capturedUrl).toContain('limit=20');
    expect(capturedUrl).toContain('search=Rahim');
    expect(capturedUrl).toContain('status=ACTIVE');
    expect(capturedUrl).toContain('minOrders=1');
    expect(capturedUrl).toContain('sortBy=ltvDesc');
    expect(result.customers).toEqual([]);
    expect(result.stats.totalCustomers).toBe(10);
  });

  it('getAdminCustomerDetailApi sends GET request for specific customer ID', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              customer: {
                id: 'cust-123',
                email: 'customer@example.com',
                financials: {
                  grossSpent: 150000,
                  totalRefunded: 30000,
                  lifetimeValue: 120000,
                },
                orderStats: {
                  totalOrderCount: 3,
                  completedOrderCount: 2,
                },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await getAdminCustomerDetailApi('cust-123');

    expect(capturedUrl).toBe('/api/admin/customers/cust-123');
    expect(result.customer.id).toBe('cust-123');
    expect(result.customer.financials.lifetimeValue).toBe(120000);
    expect(result.customer.orderStats.totalOrderCount).toBe(3);
    expect(result.customer.orderStats.completedOrderCount).toBe(2);
  });

  it('updateAdminCustomerStatusApi sends PATCH request with CSRF header and payload', async () => {
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
              customer: {
                id: 'cust-123',
                status: 'SUSPENDED',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await updateAdminCustomerStatusApi('cust-123', {
      status: 'SUSPENDED',
      reason: 'Chargeback fraud',
    });

    expect(capturedUrl).toBe('/api/admin/customers/cust-123/status');
    expect(capturedOptions?.method).toBe('PATCH');
    const headers = capturedOptions?.headers;
    const csrf =
      headers instanceof Headers
        ? headers.get('x-csrf-token')
        : (headers as Record<string, string>)?.[`x-csrf-token`];
    expect(csrf).toBe('test-csrf-token');
    expect(JSON.parse(capturedOptions?.body as string)).toEqual({
      status: 'SUSPENDED',
      reason: 'Chargeback fraud',
    });
    expect(result.customer.status).toBe('SUSPENDED');
  });
});
