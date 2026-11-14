import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAdminPaymentsApi, getAdminPaymentDetailApi } from '../api-client';

describe('Admin Payments API Client Flow (Phase 8C)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('getAdminPaymentsApi sends GET request with filters and parameters', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              payments: [],
              stats: {
                totalAttempts: 15,
                successfulPayments: 12,
                failedPayments: 2,
                pendingPayments: 1,
                cancelledPayments: 0,
                totalCapturedPoisha: 1200000,
                totalRefundedPoisha: 100000,
                netRetainedPoisha: 1100000,
              },
              pagination: { page: 1, limit: 20, total: 15, totalPages: 1 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await getAdminPaymentsApi({
      page: 1,
      limit: 20,
      search: 'TXN-1234',
      status: 'PAID',
      method: 'SSLCOMMERZ',
    });

    expect(capturedUrl).toContain('/api/admin/payments');
    expect(capturedUrl).toContain('status=PAID');
    expect(capturedUrl).toContain('method=SSLCOMMERZ');
    expect(capturedUrl).toContain('search=TXN-1234');
    expect(result.stats.totalAttempts).toBe(15);
    expect(result.stats.netRetainedPoisha).toBe(1100000);
  });

  it('getAdminPaymentDetailApi fetches payment details by ID', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              payment: {
                id: 'pay-001',
                transactionId: 'TXN-001',
                method: 'SSLCOMMERZ',
                status: 'PAID',
                amount: 506000,
                refundedAmount: 100000,
                netAmount: 406000,
                safeGatewayDetails: {
                  cardBrand: 'VISA',
                  gatewayStatus: 'VALID',
                },
                order: {
                  id: 'ord-001',
                  orderNumber: 'DD-001',
                  totalPayable: 506000,
                },
                refunds: [],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await getAdminPaymentDetailApi('pay-001');

    expect(capturedUrl).toBe('/api/admin/payments/pay-001');
    expect(result.payment.id).toBe('pay-001');
    expect(result.payment.netAmount).toBe(406000);
    expect(result.payment.safeGatewayDetails?.cardBrand).toBe('VISA');
  });
});
