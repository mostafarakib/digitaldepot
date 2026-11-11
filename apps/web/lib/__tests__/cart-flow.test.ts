import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCartApi,
  addToCartApi,
  updateCartItemApi,
  removeCartItemApi,
  clearCartApi,
  mergeCartApi,
  applyCouponApi,
  removeCouponApi,
  estimateShippingApi,
  clearShippingEstimateApi,
  setInMemoryCsrfToken,
} from '../api-client';

describe('Cart Client API helpers (Phase 5A)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setInMemoryCsrfToken('test-csrf-token');
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  it('getCartApi performs GET /api/cart', async () => {
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
          data: { id: 'cart-1', items: [], itemCount: 0, totalQuantity: 0, subtotal: 0 },
        }),
      } as unknown as Response;
    });

    const cart = await getCartApi();
    expect(calledUrl).toBe('/api/cart');
    expect(calledMethod).toBe('GET');
    expect(cart.id).toBe('cart-1');
  });

  it('addToCartApi sends POST /api/cart/items with payload', async () => {
    let calledUrl = '';
    let calledMethod = '';
    let calledBody = '';

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calledUrl = url;
      calledMethod = init?.method ?? 'GET';
      calledBody = init?.body as string;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            id: 'cart-1',
            items: [{ id: 'item-1', variantId: 'v-1', quantity: 2 }],
            itemCount: 1,
            totalQuantity: 2,
            subtotal: 200000,
          },
        }),
      } as unknown as Response;
    });

    const cart = await addToCartApi({ variantId: 'v-1', quantity: 2 });
    expect(calledUrl).toBe('/api/cart/items');
    expect(calledMethod).toBe('POST');
    expect(JSON.parse(calledBody)).toEqual({ variantId: 'v-1', quantity: 2 });
    expect(cart.itemCount).toBe(1);
  });

  it('updateCartItemApi sends PATCH /api/cart/items/[id]', async () => {
    let calledUrl = '';
    let calledMethod = '';
    let calledBody = '';

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calledUrl = url;
      calledMethod = init?.method ?? 'GET';
      calledBody = init?.body as string;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            id: 'cart-1',
            items: [{ id: 'item-1', variantId: 'v-1', quantity: 5 }],
            itemCount: 1,
            totalQuantity: 5,
            subtotal: 500000,
          },
        }),
      } as unknown as Response;
    });

    const cart = await updateCartItemApi('item-1', { quantity: 5 });
    expect(calledUrl).toBe('/api/cart/items/item-1');
    expect(calledMethod).toBe('PATCH');
    expect(JSON.parse(calledBody)).toEqual({ quantity: 5 });
    expect(cart.totalQuantity).toBe(5);
  });

  it('removeCartItemApi sends DELETE /api/cart/items/[id]', async () => {
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
          data: { id: 'cart-1', items: [], itemCount: 0, totalQuantity: 0, subtotal: 0 },
        }),
      } as unknown as Response;
    });

    const cart = await removeCartItemApi('item-1');
    expect(calledUrl).toBe('/api/cart/items/item-1');
    expect(calledMethod).toBe('DELETE');
    expect(cart.itemCount).toBe(0);
  });

  it('clearCartApi sends DELETE /api/cart', async () => {
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
          data: { id: 'cart-1', items: [], itemCount: 0, totalQuantity: 0, subtotal: 0 },
        }),
      } as unknown as Response;
    });

    const cart = await clearCartApi();
    expect(calledUrl).toBe('/api/cart');
    expect(calledMethod).toBe('DELETE');
    expect(cart.itemCount).toBe(0);
  });

  it('mergeCartApi sends POST /api/cart/merge', async () => {
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
          data: { id: 'merged-cart', items: [], itemCount: 0, totalQuantity: 0, subtotal: 0 },
        }),
      } as unknown as Response;
    });

    const cart = await mergeCartApi();
    expect(calledUrl).toBe('/api/cart/merge');
    expect(calledMethod).toBe('POST');
    expect(cart.id).toBe('merged-cart');
  });

  it('applyCouponApi sends POST /api/cart/coupon with code payload', async () => {
    let calledUrl = '';
    let calledMethod = '';
    let calledBody = '';

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calledUrl = url;
      calledMethod = init?.method ?? 'GET';
      calledBody = init?.body as string;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            id: 'cart-1',
            items: [],
            itemCount: 1,
            totalQuantity: 1,
            subtotal: 100000,
            discount: 10000,
            total: 90000,
            coupon: { code: 'SAVE10', discountAmount: 10000 },
          },
        }),
      } as unknown as Response;
    });

    const cart = await applyCouponApi('SAVE10');
    expect(calledUrl).toBe('/api/cart/coupon');
    expect(calledMethod).toBe('POST');
    expect(JSON.parse(calledBody)).toEqual({ code: 'SAVE10' });
    expect(cart.discount).toBe(10000);
    expect(cart.total).toBe(90000);
  });

  it('removeCouponApi sends DELETE /api/cart/coupon', async () => {
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
            id: 'cart-1',
            items: [],
            itemCount: 1,
            totalQuantity: 1,
            subtotal: 100000,
            discount: 0,
            total: 100000,
            coupon: null,
          },
        }),
      } as unknown as Response;
    });

    const cart = await removeCouponApi();
    expect(calledUrl).toBe('/api/cart/coupon');
    expect(calledMethod).toBe('DELETE');
    expect(cart.discount).toBe(0);
    expect(cart.coupon).toBeNull();
  });

  it('estimateShippingApi sends POST /api/cart/shipping with district payload', async () => {
    let calledUrl = '';
    let calledMethod = '';
    let calledBody = '';

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calledUrl = url;
      calledMethod = init?.method ?? 'GET';
      calledBody = init?.body as string;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            id: 'cart-1',
            items: [],
            itemCount: 1,
            totalQuantity: 1,
            subtotal: 100000,
            discount: 0,
            shipping: {
              district: 'DHAKA',
              isInsideDhaka: true,
              standardFee: 6000,
              shippingFee: 6000,
              isFreeShipping: false,
              freeShippingThreshold: 500000,
              amountNeededForFreeShipping: 400000,
              freeShippingProgressPercent: 20,
              isEstimated: true,
            },
            total: 106000,
            coupon: null,
          },
        }),
      } as unknown as Response;
    });

    const cart = await estimateShippingApi({ district: 'DHAKA' });
    expect(calledUrl).toBe('/api/cart/shipping');
    expect(calledMethod).toBe('POST');
    expect(JSON.parse(calledBody)).toEqual({ district: 'DHAKA' });
    expect(cart.shipping.shippingFee).toBe(6000);
    expect(cart.total).toBe(106000);
  });

  it('clearShippingEstimateApi sends DELETE /api/cart/shipping', async () => {
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
            id: 'cart-1',
            items: [],
            itemCount: 1,
            totalQuantity: 1,
            subtotal: 100000,
            discount: 0,
            shipping: {
              district: null,
              isInsideDhaka: null,
              standardFee: 0,
              shippingFee: 0,
              isFreeShipping: false,
              freeShippingThreshold: 500000,
              amountNeededForFreeShipping: 400000,
              freeShippingProgressPercent: 20,
              isEstimated: false,
            },
            total: 100000,
            coupon: null,
          },
        }),
      } as unknown as Response;
    });

    const cart = await clearShippingEstimateApi();
    expect(calledUrl).toBe('/api/cart/shipping');
    expect(calledMethod).toBe('DELETE');
    expect(cart.shipping.isEstimated).toBe(false);
    expect(cart.shipping.district).toBeNull();
  });
});
