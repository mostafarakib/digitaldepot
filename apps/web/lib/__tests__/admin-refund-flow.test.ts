import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAdminReturnRefundPreviewApi,
  processAdminReturnRefundApi,
  reconcileAdminReturnRefundApi,
  setInMemoryCsrfToken,
} from '../api-client';

describe('Admin Refund API Client Flow (Phase 7D)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    setInMemoryCsrfToken('test-csrf-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  it('getAdminReturnRefundPreviewApi sends GET request for refund preview', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              preview: {
                returnNumber: 'RET-20261114-12345678',
                orderNumber: 'ORD-20261114-001',
                currency: 'BDT',
                merchandiseAmount: 100000,
                maxOrderRefundCapacity: 106000,
                maxMerchandiseRefundCapacity: 100000,
                targetPayment: {
                  id: 'pay-1',
                  method: 'SSLCOMMERZ',
                  gateway: 'SSLCOMMERZ',
                  gatewayTransactionId: 'BANK-TRAN-1',
                  capturedAmount: 106000,
                  totalRefunded: 0,
                  remainingCapacity: 106000,
                },
                eligiblePayments: [],
                hasPendingRefund: false,
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await getAdminReturnRefundPreviewApi('RET-20261114-12345678');
    expect(capturedUrl).toBe('/api/admin/returns/RET-20261114-12345678/refund-preview');
    expect(result.preview.returnNumber).toBe('RET-20261114-12345678');
    expect(result.preview.targetPayment.method).toBe('SSLCOMMERZ');
  });

  it('processAdminReturnRefundApi sends POST request with payload and CSRF header', async () => {
    let capturedMethod = '';
    let capturedUrl = '';
    let capturedBody = '';
    let capturedHeaders: HeadersInit | undefined;

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method || '';
      capturedBody = typeof init?.body === 'string' ? init.body : '';
      capturedHeaders = init?.headers;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              refund: {
                id: 'ref-1',
                refundNumber: 'REF-20261114-12345678',
                amount: 100000,
                status: 'COMPLETED',
              },
              return: {
                id: 'ret-1',
                status: 'COMPLETED',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await processAdminReturnRefundApi('RET-20261114-12345678', {
      shippingAmount: 6000,
      shippingRefundReason: 'Damaged item return with fee reimbursement',
      payoutChannel: 'CASH',
      notes: 'Customer refunded cash in branch',
    });

    expect(capturedUrl).toBe('/api/admin/returns/RET-20261114-12345678/refund');
    expect(capturedMethod).toBe('POST');
    const csrfHeader =
      capturedHeaders instanceof Headers
        ? capturedHeaders.get('x-csrf-token')
        : (capturedHeaders as Record<string, string> | undefined)?.['x-csrf-token'];
    expect(csrfHeader).toBe('test-csrf-token');
    expect(JSON.parse(capturedBody)).toEqual({
      shippingAmount: 6000,
      shippingRefundReason: 'Damaged item return with fee reimbursement',
      payoutChannel: 'CASH',
      notes: 'Customer refunded cash in branch',
    });
    expect(result.refund.status).toBe('COMPLETED');
  });

  it('reconcileAdminReturnRefundApi sends POST request with empty body to reconcile endpoint', async () => {
    let capturedMethod = '';
    let capturedUrl = '';
    let capturedBody = '';

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method || '';
      capturedBody = typeof init?.body === 'string' ? init.body : '';
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              refund: {
                id: 'ref-1',
                refundNumber: 'REF-20261114-12345678',
                status: 'COMPLETED',
                gatewayReference: 'GATEWAY-OK',
              },
              return: {
                id: 'ret-1',
                status: 'COMPLETED',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await reconcileAdminReturnRefundApi('RET-20261114-12345678');
    expect(capturedUrl).toBe('/api/admin/returns/RET-20261114-12345678/refund/reconcile');
    expect(capturedMethod).toBe('POST');
    expect(capturedBody).toBe('{}');
    expect(result.refund.gatewayReference).toBe('GATEWAY-OK');
  });
});
