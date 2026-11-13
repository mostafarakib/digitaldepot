import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAdminOrdersApi,
  getAdminOrderApi,
  updateAdminOrderStatusApi,
  cancelAdminOrderApi,
  markAdminCodPaidApi,
  setInMemoryCsrfToken,
} from '../api-client';

describe('Admin Orders API Client Flow (Phase 6E)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    setInMemoryCsrfToken('test-csrf-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  it('getAdminOrdersApi sends GET request with search, status, and sorting params', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              orders: [],
              pagination: { page: 1, limit: 20, total: 10, totalPages: 1 },
              statusCounts: {
                all: 10,
                pending: 2,
                confirmed: 3,
                processing: 2,
                shipped: 1,
                delivered: 1,
                cancelled: 1,
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await getAdminOrdersApi({
      page: 1,
      limit: 20,
      search: 'DD-2026',
      status: 'CONFIRMED',
      paymentMethod: 'COD',
      sortBy: 'newest',
    });

    expect(capturedUrl).toContain('/api/admin/orders?');
    expect(capturedUrl).toContain('search=DD-2026');
    expect(capturedUrl).toContain('status=CONFIRMED');
    expect(capturedUrl).toContain('paymentMethod=COD');
    expect(result.pagination.total).toBe(10);
    expect(result.statusCounts.confirmed).toBe(3);
  });

  it('getAdminOrderApi sends GET request for order ID or orderNumber', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              order: {
                id: 'ord-123',
                orderNumber: 'DD-20261113-ABCDEF12',
                status: 'CONFIRMED',
                allowedNextStatuses: ['PROCESSING'],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await getAdminOrderApi('ord-123');
    expect(capturedUrl).toBe('/api/admin/orders/ord-123');
    expect(result.order.id).toBe('ord-123');
    expect(result.order.allowedNextStatuses).toEqual(['PROCESSING']);
  });

  it('updateAdminOrderStatusApi sends PATCH request with new status and reason', async () => {
    let capturedMethod = '';
    let capturedBody = '';

    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedMethod = init?.method || '';
      capturedBody = typeof init?.body === 'string' ? init.body : '';
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: { order: { id: 'ord-123', status: 'PROCESSING' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await updateAdminOrderStatusApi('ord-123', {
      status: 'PROCESSING',
      reason: 'Order verified by operations team',
    });

    expect(capturedMethod).toBe('PATCH');
    expect(capturedBody).toContain('PROCESSING');
    expect(capturedBody).toContain('Order verified by operations team');
    expect(result).toBeDefined();
  });

  it('cancelAdminOrderApi sends POST request with cancellation reason', async () => {
    let capturedMethod = '';
    let capturedBody = '';

    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedMethod = init?.method || '';
      capturedBody = typeof init?.body === 'string' ? init.body : '';
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: { order: { id: 'ord-123', status: 'CANCELLED' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    await cancelAdminOrderApi('ord-123', {
      reason: 'Cancelled due to customer request',
    });

    expect(capturedMethod).toBe('POST');
    expect(capturedBody).toContain('Cancelled due to customer request');
  });

  it('markAdminCodPaidApi sends POST request to mark COD payment as paid', async () => {
    let capturedMethod = '';
    let capturedBody = '';

    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedMethod = init?.method || '';
      capturedBody = typeof init?.body === 'string' ? init.body : '';
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: { order: { id: 'ord-123', paymentStatus: 'PAID' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    await markAdminCodPaidApi('ord-123', {
      note: 'Cash collected by delivery agent',
    });

    expect(capturedMethod).toBe('POST');
    expect(capturedBody).toContain('Cash collected by delivery agent');
  });
});
