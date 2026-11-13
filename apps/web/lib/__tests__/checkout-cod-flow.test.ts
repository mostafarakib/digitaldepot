import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { submitCodCheckoutApi, getOrderConfirmationApi, setInMemoryCsrfToken } from '../api-client';

describe('Checkout COD Client API Helpers & Flow Logic (Phase 6B)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    setInMemoryCsrfToken('test-csrf-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  describe('submitCodCheckoutApi', () => {
    it('calls POST /api/checkout/cod with payload and CSRF header', async () => {
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
                id: 'order-123',
                orderNumber: 'DD-20261113-12345678',
                status: 'CONFIRMED',
                paymentStatus: 'PENDING',
                paymentMethod: 'COD',
                merchandiseSubtotal: 150000,
                shippingFee: 6000,
                discountAmount: 0,
                totalPayable: 156000,
                coupon: null,
                createdAt: '2026-11-13T00:00:00.000Z',
                shippingAddress: {
                  recipientName: 'Tanvir Ahmed',
                  phone: '+8801700000001',
                  alternativePhone: '+8801700000000',
                  divisionId: 'DHAKA',
                  districtId: 'DHAKA',
                  upazila: 'Dhanmondi',
                  streetAddress: 'Road 4',
                  deliveryNotes: 'Leave at front desk',
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
            },
          }),
        } as unknown as Response;
      });

      const res = await submitCodCheckoutApi({
        addressId: 'addr-test',
        deliveryNotes: 'Leave at front desk',
        alternativePhone: '+8801700000000',
        acknowledgedLivePrices: true,
      });

      expect(calledUrl).toBe('/api/checkout/cod');
      expect(calledMethod).toBe('POST');
      expect(calledHeaders?.get('x-csrf-token')).toBe('test-csrf-token');
      expect(JSON.parse(calledBody)).toEqual({
        addressId: 'addr-test',
        deliveryNotes: 'Leave at front desk',
        alternativePhone: '+8801700000000',
        acknowledgedLivePrices: true,
      });
      expect(res.order.orderNumber).toBe('DD-20261113-12345678');
      expect(res.order.status).toBe('CONFIRMED');
      expect(res.order.paymentStatus).toBe('PENDING');
      expect(res.order.totalPayable).toBe(156000);
    });

    it('propagates error when cart is empty (e.g. concurrent checkout)', async () => {
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
        submitCodCheckoutApi({
          addressId: 'addr-test',
          acknowledgedLivePrices: true,
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: 'EMPTY_CART',
        message: 'Your cart is empty',
      });
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
        submitCodCheckoutApi({
          addressId: 'addr-test',
          acknowledgedLivePrices: false,
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: 'PRICE_CHANGE_ACKNOWLEDGEMENT_REQUIRED',
      });
    });
  });

  describe('getOrderConfirmationApi', () => {
    it('calls GET /api/checkout/orders/:orderNumber/confirmation and returns order details', async () => {
      let calledUrl = '';
      let calledMethod = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        calledUrl = url;
        calledMethod = init?.method ?? 'GET';

        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              order: {
                id: 'order-123',
                orderNumber: 'DD-20261113-12345678',
                status: 'CONFIRMED',
                paymentStatus: 'PENDING',
                paymentMethod: 'COD',
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
                  deliveryNotes: 'Leave at security',
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
            },
          }),
        } as unknown as Response;
      });

      const res = await getOrderConfirmationApi('DD-20261113-12345678');

      expect(calledUrl).toBe('/api/checkout/orders/DD-20261113-12345678/confirmation');
      expect(calledMethod).toBe('GET');
      expect(res.order.orderNumber).toBe('DD-20261113-12345678');
      expect(res.order.items).toHaveLength(1);
      expect(res.order.totalPayable).toBe(156000);
    });

    it('rejects with 404 when order is not found or not owned by customer', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 404,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Order not found',
            },
          }),
        } as unknown as Response;
      });

      await expect(getOrderConfirmationApi('DD-20261113-FOREIGN99')).rejects.toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
      });
    });
  });
});
