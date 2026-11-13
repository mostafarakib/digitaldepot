import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sslcommerzService } from '../sslcommerz.service.js';
import type { OrderWithDetails } from '../../order/order.types.js';
import type { Payment } from '../../../generated/client/client.js';

describe('SSLCommerz Gateway Client Service', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const mockOrder: OrderWithDetails = {
    id: 'ord-123',
    orderNumber: 'DD-20261113-12345678',
    userId: 'usr-1',
    status: 'PENDING',
    paymentStatus: 'PENDING',
    paymentMethod: 'SSLCOMMERZ',
    merchandiseSubtotal: 100000,
    discountAmount: 0,
    shippingFee: 6000,
    totalPayable: 106000,
    shippingRecipientName: 'Tanvir Ahmed',
    shippingPhone: '+8801700000001',
    shippingAlternativePhone: null,
    shippingDivisionId: 'DHAKA',
    shippingDistrictId: 'DHAKA',
    shippingUpazila: 'Dhanmondi',
    shippingStreetAddress: 'Road 4',
    shippingDeliveryNotes: 'Call on arrival',
    couponCode: null,
    couponId: null,
    couponDiscountType: null,
    couponDiscountValue: null,
    couponDiscountAmount: 0,
    paymentExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'item-1',
        orderId: 'ord-123',
        productId: 'prod-1',
        variantId: 'var-1',
        productName: 'Mechanical Keyboard',
        variantTitle: 'Blue Switch',
        sku: 'KB-BLUE',
        unitPrice: 100000,
        quantity: 1,
        lineTotal: 100000,
        attributes: null,
        thumbnailUrl: null,
        createdAt: new Date(),
      },
    ],
    payments: [],
    statusHistory: [],
  };

  const mockPayment: Payment = {
    id: 'pay-123',
    orderId: 'ord-123',
    transactionId: 'TXN-20261113-ABCDEF12',
    gatewayTransactionId: null,
    method: 'SSLCOMMERZ',
    status: 'PENDING',
    amount: 106000,
    currency: 'BDT',
    gatewayResponse: null,
    paidAt: null,
    failedAt: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('initiateSession', () => {
    it('initiates session with formatted form data and returns gateway URL', async () => {
      let calledUrl = '';
      let calledBody = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        calledUrl = url;
        calledBody = (init?.body as string) || '';

        return new Response(
          JSON.stringify({
            status: 'SUCCESS',
            failedreason: '',
            sessionkey: 'test-session-key-123',
            GatewayPageURL: 'https://sandbox.sslcommerz.com/EasyCheckOut/testc4c776',
          }),
          { status: 200 },
        );
      });

      const result = await sslcommerzService.initiateSession({
        order: mockOrder,
        payment: mockPayment,
        customerEmail: 'customer@example.com',
      });

      expect(calledUrl).toContain('/gwprocess/v4/api.php');
      const params = new URLSearchParams(calledBody);
      expect(params.get('total_amount')).toBe('1060.00'); // 106,000 poysha = ৳1,060.00
      expect(params.get('currency')).toBe('BDT');
      expect(params.get('tran_id')).toBe('TXN-20261113-ABCDEF12');
      expect(params.get('cus_name')).toBe('Tanvir Ahmed');
      expect(params.get('cus_email')).toBe('customer@example.com');
      expect(params.get('cus_phone')).toBe('+8801700000001');

      expect(result.status).toBe('SUCCESS');
      expect(result.gatewayUrl).toBe('https://sandbox.sslcommerz.com/EasyCheckOut/testc4c776');
      expect(result.sessionKey).toBe('test-session-key-123');
    });

    it('throws error when gateway rejects initiation with non-SUCCESS status', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            status: 'FAILED',
            failedreason: 'Invalid store credentials or transaction reference',
          }),
          { status: 200 },
        );
      });

      await expect(
        sslcommerzService.initiateSession({
          order: mockOrder,
          payment: mockPayment,
          customerEmail: 'customer@example.com',
        }),
      ).rejects.toThrow('SSLCommerz session initiation rejected: Invalid store credentials');
    });

    it('throws error on network connection failure', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        throw new Error('Connection refused');
      });

      await expect(
        sslcommerzService.initiateSession({
          order: mockOrder,
          payment: mockPayment,
          customerEmail: 'customer@example.com',
        }),
      ).rejects.toThrow('SSLCommerz network connection failed: Connection refused');
    });
  });

  describe('validateOrder', () => {
    it('queries SSLCommerz validation API with credentials and returns structured result', async () => {
      let calledUrl = '';

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        calledUrl = url;

        return new Response(
          JSON.stringify({
            status: 'VALID',
            tran_id: 'TXN-20261113-ABCDEF12',
            val_id: 'val-998877',
            amount: '1060.00',
            currency: 'BDT',
            store_id: 'digitaldepot_sandbox_store',
            bank_tran_id: 'BANK-TXN-112233',
            card_type: 'VISA',
            card_brand: 'VISA',
            tran_date: '2026-11-13 10:00:00',
          }),
          { status: 200 },
        );
      });

      const result = await sslcommerzService.validateOrder('val-998877');

      expect(calledUrl).toContain('/validator/api/validationserverAPI.php');
      expect(calledUrl).toContain('val_id=val-998877');
      expect(result.status).toBe('VALID');
      expect(result.tran_id).toBe('TXN-20261113-ABCDEF12');
      expect(result.amount).toBe('1060.00');
      expect(result.currency).toBe('BDT');
      expect(result.bank_tran_id).toBe('BANK-TXN-112233');
    });

    it('throws error when validation API returns non-200 HTTP status', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        return new Response('Gateway Error', { status: 500 });
      });

      await expect(sslcommerzService.validateOrder('val-fail')).rejects.toThrow(
        'SSLCommerz validation API HTTP 500',
      );
    });
  });

  describe('initiateRefund', () => {
    it('calls SSLCommerz refund API and parses successful refund outcome', async () => {
      let calledUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        calledUrl = url;
        return new Response(
          JSON.stringify({
            APIConnect: 'DONE',
            status: 'success',
            refund_ref_id: 'SSL-REF-9988',
            trans_id: 'TXN-12345',
          }),
          { status: 200 },
        );
      });

      const result = await sslcommerzService.initiateRefund({
        bankTranId: 'BANK-TXN-112233',
        refundAmount: 50000,
        refundRemarks: 'Customer return refund',
        refundRefId: 'REF-20261114-12345678',
      });

      expect(calledUrl).toContain('/validator/api/merchantTransIDvalidationAPI.php');
      expect(calledUrl).toContain('refund_amount=500.00');
      expect(calledUrl).toContain('bank_tran_id=BANK-TXN-112233');
      expect(calledUrl).toContain('refe_id=REF-20261114-12345678');
      expect(result.status).toBe('SUCCESS');
      expect(result.refundRefId).toBe('SSL-REF-9988');
    });

    it('returns FAILED when gateway returns status failed', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            APIConnect: 'DONE',
            status: 'failed',
            errorReason: 'Transaction already refunded',
          }),
          { status: 200 },
        );
      });

      const result = await sslcommerzService.initiateRefund({
        bankTranId: 'BANK-TXN-112233',
        refundAmount: 50000,
        refundRemarks: 'Customer return refund',
        refundRefId: 'REF-20261114-12345678',
      });

      expect(result.status).toBe('FAILED');
      expect(result.errorReason).toBe('Transaction already refunded');
    });

    it('returns AMBIGUOUS on network error without throwing', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));

      const result = await sslcommerzService.initiateRefund({
        bankTranId: 'BANK-TXN-112233',
        refundAmount: 50000,
        refundRemarks: 'Customer return refund',
        refundRefId: 'REF-20261114-12345678',
      });

      expect(result.status).toBe('AMBIGUOUS');
      expect(result.errorReason).toContain('ETIMEDOUT');
    });
  });

  describe('queryRefundStatus', () => {
    it('queries SSLCommerz refund status and parses success response', async () => {
      let calledUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        calledUrl = url;
        return new Response(
          JSON.stringify({
            APIConnect: 'DONE',
            status: 'success',
            refund_ref_id: 'SSL-REF-9988',
          }),
          { status: 200 },
        );
      });

      const result = await sslcommerzService.queryRefundStatus('SSL-REF-9988');

      expect(calledUrl).toContain('/validator/api/merchantTransIDvalidationAPI.php');
      expect(calledUrl).toContain('refund_ref_id=SSL-REF-9988');
      expect(result.status).toBe('SUCCESS');
      expect(result.refundRefId).toBe('SSL-REF-9988');
    });

    it('returns AMBIGUOUS on network failure when querying refund status', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection reset'));

      const result = await sslcommerzService.queryRefundStatus('SSL-REF-9988');

      expect(result.status).toBe('AMBIGUOUS');
    });
  });
});
