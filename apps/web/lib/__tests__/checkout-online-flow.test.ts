import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { submitOnlineCheckoutApi, setInMemoryCsrfToken } from '../api-client';

describe('Checkout Online Client API Helpers & Flow Logic (Phase 6C)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    setInMemoryCsrfToken('test-csrf-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  describe('submitOnlineCheckoutApi', () => {
    it('calls POST /api/checkout/online with payload, CSRF header, and returns gatewayUrl', async () => {
      let calledUrl = '';
      let calledMethod = '';
      let calledBody = '';
      let calledHeaders: Headers | undefined;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        calledUrl = url;
        calledMethod = init?.method ?? 'GET';
        calledBody = (init?.body as string) ?? '';
        calledHeaders = new Headers(init?.headers);

        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              order: {
                id: 'order-online-1',
                orderNumber: 'DD-20261113-12345678',
                status: 'PENDING',
                paymentStatus: 'PENDING',
                paymentMethod: 'SSLCOMMERZ',
                merchandiseSubtotal: 150000,
                shippingFee: 6000,
                discountAmount: 0,
                totalPayable: 156000,
                coupon: null,
                createdAt: '2026-11-13T00:00:00.000Z',
                shippingAddress: {
                  recipientName: 'Tanvir Ahmed',
                  phone: '+8801700000001',
                  alternativePhone: null,
                  divisionId: 'DHAKA',
                  districtId: 'DHAKA',
                  upazila: 'Dhanmondi',
                  streetAddress: 'Road 4',
                  deliveryNotes: 'Leave at reception',
                },
                items: [
                  {
                    id: 'item-1',
                    productId: 'prod-1',
                    variantId: 'var-1',
                    productName: 'Mechanical Keyboard',
                    variantTitle: 'Blue Switch',
                    sku: 'KB-BLUE-01',
                    thumbnailUrl: '/images/kb.jpg',
                    unitPrice: 75000,
                    quantity: 2,
                    lineTotal: 150000,
                    attributes: null,
                  },
                ],
              },
              gatewayUrl: 'https://sandbox.sslcommerz.com/EasyCheckOut/mock-session-123',
              sessionKey: 'mock-session-key',
            },
          }),
        } as unknown as Response;
      });

      const res = await submitOnlineCheckoutApi({
        addressId: 'addr-online-1',
        deliveryNotes: 'Leave at reception',
        alternativePhone: '+8801700000000',
        acknowledgedLivePrices: true,
      });

      expect(calledUrl).toBe('/api/checkout/online');
      expect(calledMethod).toBe('POST');
      expect(calledHeaders?.get('x-csrf-token')).toBe('test-csrf-token');
      expect(JSON.parse(calledBody)).toEqual({
        addressId: 'addr-online-1',
        deliveryNotes: 'Leave at reception',
        alternativePhone: '+8801700000000',
        acknowledgedLivePrices: true,
      });
      expect(res.gatewayUrl).toBe('https://sandbox.sslcommerz.com/EasyCheckOut/mock-session-123');
      expect(res.sessionKey).toBe('mock-session-key');
      expect(res.order.orderNumber).toBe('DD-20261113-12345678');
      expect(res.order.status).toBe('PENDING');
      expect(res.order.paymentStatus).toBe('PENDING');
      expect(res.order.totalPayable).toBe(156000);
    });

    it('propagates PRICE_CHANGE_ACKNOWLEDGEMENT_REQUIRED error when live prices changed without acknowledgement', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 400,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: false,
            error: {
              code: 'PRICE_CHANGE_ACKNOWLEDGEMENT_REQUIRED',
              message:
                'Prices have changed since items were added to cart. Customer acknowledgement required.',
            },
          }),
        } as unknown as Response;
      });

      await expect(
        submitOnlineCheckoutApi({
          addressId: 'addr-test',
          acknowledgedLivePrices: false,
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: 'PRICE_CHANGE_ACKNOWLEDGEMENT_REQUIRED',
      });
    });

    it('propagates PAYMENT_INITIATION_FAILED (502) when gateway session initiation fails', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 502,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: false,
            error: {
              code: 'PAYMENT_INITIATION_FAILED',
              message: 'Failed to initiate payment session with gateway. Please try again.',
            },
          }),
        } as unknown as Response;
      });

      await expect(
        submitOnlineCheckoutApi({
          addressId: 'addr-test',
          acknowledgedLivePrices: true,
        }),
      ).rejects.toMatchObject({
        status: 502,
        code: 'PAYMENT_INITIATION_FAILED',
      });
    });

    it('propagates EMPTY_CART error when cart is empty', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 400,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: false,
            error: {
              code: 'EMPTY_CART',
              message: 'Your cart is empty',
            },
          }),
        } as unknown as Response;
      });

      await expect(
        submitOnlineCheckoutApi({
          addressId: 'addr-test',
          acknowledgedLivePrices: true,
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: 'EMPTY_CART',
      });
    });
  });
});
