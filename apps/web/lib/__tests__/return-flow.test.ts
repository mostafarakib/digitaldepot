import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getReturnEligibilityApi,
  createReturnRequestApi,
  getCustomerReturnsApi,
  getCustomerReturnDetailApi,
  cancelCustomerReturnApi,
  setInMemoryCsrfToken,
} from '../api-client';

describe('Customer Return Flow API Client (Phase 7B)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    setInMemoryCsrfToken('test-csrf-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  it('getReturnEligibilityApi sends GET request for order return eligibility', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              orderNumber: 'DD-20261113-ABC12345',
              isEligible: true,
              deliveredAt: '2026-11-10T12:00:00.000Z',
              windowExpiresAt: '2026-11-17T23:59:59.999+06:00',
              daysRemaining: 4,
              items: [
                {
                  orderItemId: 'item-1',
                  productTitle: 'Mechanical Keyboard',
                  sku: 'KB-01',
                  orderedQuantity: 2,
                  returnedQuantity: 0,
                  returnableQuantity: 2,
                  unitPrice: 500000,
                  estimatedRefundPerUnit: 450000,
                  isEligible: true,
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await getReturnEligibilityApi('DD-20261113-ABC12345');
    expect(capturedUrl).toBe('/api/account/orders/DD-20261113-ABC12345/return-eligibility');
    expect(result.orderNumber).toBe('DD-20261113-ABC12345');
    expect(result.isEligible).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].returnableQuantity).toBe(2);
  });

  it('createReturnRequestApi sends POST request with items and reason', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    let capturedHeaders: Headers | undefined;

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedBody = (init?.body as string) || '';
      capturedHeaders = new Headers(init?.headers);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              return: {
                id: 'ret-123',
                returnNumber: 'RET-20261113-ABCD1234',
                orderNumber: 'DD-20261113-ABC12345',
                status: 'REQUESTED',
                customerReason: 'DEFECTIVE',
                customerNotes: 'Key switch broken',
                rejectionReason: null,
                createdAt: '2026-11-13T10:00:00.000Z',
                updatedAt: '2026-11-13T10:00:00.000Z',
                estimatedRefundAmount: 450000,
                actualRefundAmount: null,
                items: [
                  {
                    id: 'ri-1',
                    orderItemId: 'item-1',
                    productName: 'Mechanical Keyboard',
                    variantTitle: 'Default',
                    sku: 'KB-01',
                    thumbnailUrl: null,
                    quantity: 1,
                    unitPrice: 500000,
                    reason: 'Key switch broken',
                  },
                ],
                statusHistory: [],
              },
            },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await createReturnRequestApi('DD-20261113-ABC12345', {
      customerReason: 'DEFECTIVE',
      customerNotes: 'Key switch broken',
      items: [
        {
          orderItemId: 'item-1',
          quantity: 1,
          reason: 'Key switch broken',
        },
      ],
    });

    expect(capturedUrl).toBe('/api/account/orders/DD-20261113-ABC12345/returns');
    expect(capturedHeaders?.get('x-csrf-token')).toBe('test-csrf-token');
    const parsedBody = JSON.parse(capturedBody);
    expect(parsedBody.customerReason).toBe('DEFECTIVE');
    expect(parsedBody.items).toHaveLength(1);
    expect(result.return.returnNumber).toBe('RET-20261113-ABCD1234');
    expect(result.return.status).toBe('REQUESTED');
    expect(result.return.estimatedRefundAmount).toBe(450000);
  });

  it('getCustomerReturnsApi sends GET request with page, limit, and status query parameters', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              returns: [],
              pagination: { page: 2, limit: 10, total: 20, totalPages: 2 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await getCustomerReturnsApi({ page: 2, limit: 10, status: 'APPROVED' });
    expect(capturedUrl).toBe('/api/account/returns?page=2&limit=10&status=APPROVED');
    expect(result.pagination.total).toBe(20);
    expect(result.pagination.page).toBe(2);
  });

  it('getCustomerReturnDetailApi sends GET request for returnNumber', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              return: {
                id: 'ret-123',
                returnNumber: 'RET-20261113-ABCD1234',
                orderNumber: 'DD-20261113-ABC12345',
                status: 'REQUESTED',
                customerReason: 'DEFECTIVE',
                customerNotes: null,
                rejectionReason: null,
                estimatedRefundAmount: 450000,
                actualRefundAmount: null,
                createdAt: '2026-11-13T10:00:00.000Z',
                updatedAt: '2026-11-13T10:00:00.000Z',
                items: [],
                statusHistory: [],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await getCustomerReturnDetailApi('RET-20261113-ABCD1234');
    expect(capturedUrl).toBe('/api/account/returns/RET-20261113-ABCD1234');
    expect(result.return.returnNumber).toBe('RET-20261113-ABCD1234');
    expect(result.return.status).toBe('REQUESTED');
  });

  it('cancelCustomerReturnApi sends POST request with optional cancellation reason', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    let capturedHeaders: Headers | undefined;

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedBody = (init?.body as string) || '';
      capturedHeaders = new Headers(init?.headers);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              return: {
                id: 'ret-123',
                returnNumber: 'RET-20261113-ABCD1234',
                orderNumber: 'DD-20261113-ABC12345',
                status: 'CANCELLED',
                customerReason: 'DEFECTIVE',
                customerNotes: null,
                rejectionReason: null,
                estimatedRefundAmount: 450000,
                actualRefundAmount: null,
                createdAt: '2026-11-13T10:00:00.000Z',
                updatedAt: '2026-11-13T10:00:00.000Z',
                items: [],
                statusHistory: [],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await cancelCustomerReturnApi(
      'RET-20261113-ABCD1234',
      'No longer need to return',
    );

    expect(capturedUrl).toBe('/api/account/returns/RET-20261113-ABCD1234/cancel');
    expect(capturedHeaders?.get('x-csrf-token')).toBe('test-csrf-token');
    const parsedBody = JSON.parse(capturedBody);
    expect(parsedBody.reason).toBe('No longer need to return');
    expect(result.return.status).toBe('CANCELLED');
  });
});
