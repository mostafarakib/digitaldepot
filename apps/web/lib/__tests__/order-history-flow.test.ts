import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCustomerOrdersApi,
  getCustomerOrderApi,
  cancelCustomerOrderApi,
  setInMemoryCsrfToken,
} from '../api-client';

describe('Order History & Details API Client Flow (Phase 6D)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    setInMemoryCsrfToken('test-csrf-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  it('getCustomerOrdersApi sends GET request with page, limit, and status query parameters', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              orders: [],
              pagination: { page: 2, limit: 10, total: 25, totalPages: 3 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await getCustomerOrdersApi({ page: 2, limit: 10, status: 'DELIVERED' });
    expect(capturedUrl).toBe('/api/account/orders?page=2&limit=10&status=DELIVERED');
    expect(result.pagination.total).toBe(25);
    expect(result.pagination.totalPages).toBe(3);
  });

  it('getCustomerOrderApi sends GET request for orderNumber', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              order: {
                orderNumber: 'DD-20261113-ABC12345',
                status: 'CONFIRMED',
                canCancel: true,
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await getCustomerOrderApi('DD-20261113-ABC12345');
    expect(capturedUrl).toBe('/api/account/orders/DD-20261113-ABC12345');
    expect(result.order.orderNumber).toBe('DD-20261113-ABC12345');
    expect(result.order.canCancel).toBe(true);
  });

  it('cancelCustomerOrderApi sends POST request with cancellation reason', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedBody = (init?.body as string) || '';
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              order: {
                id: 'ord-123',
                orderNumber: 'DD-20261113-ABC12345',
                status: 'CANCELLED',
                paymentStatus: 'CANCELLED',
                cancelledAt: '2026-11-13T10:00:00.000Z',
                cancellationReason: 'Changed my mind',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await cancelCustomerOrderApi('DD-20261113-ABC12345', {
      reason: 'Changed my mind',
    });

    expect(capturedUrl).toBe('/api/account/orders/DD-20261113-ABC12345/cancel');
    expect(JSON.parse(capturedBody)).toEqual({ reason: 'Changed my mind' });
    expect(result.order.status).toBe('CANCELLED');
  });
});
