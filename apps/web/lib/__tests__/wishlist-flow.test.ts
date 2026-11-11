import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getWishlistApi,
  addToWishlistApi,
  removeFromWishlistApi,
  setInMemoryCsrfToken,
} from '../api-client';

describe('Wishlist Client API Helpers (Phase 5D)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setInMemoryCsrfToken('test-csrf-token');
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  it('getWishlistApi calls GET /api/wishlist', async () => {
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
          data: { items: [], productIds: [], itemCount: 0 },
        }),
      } as unknown as Response;
    });

    const res = await getWishlistApi();
    expect(calledUrl).toBe('/api/wishlist');
    expect(calledMethod).toBe('GET');
    expect(res.itemCount).toBe(0);
  });

  it('addToWishlistApi sends POST /api/wishlist with JSON body', async () => {
    let calledUrl = '';
    let calledMethod = '';
    let calledBody = '';

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calledUrl = url;
      calledMethod = init?.method ?? 'POST';
      calledBody = init?.body as string;
      return {
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: 'w1', productId: 'p123' },
        }),
      } as unknown as Response;
    });

    const res = await addToWishlistApi('p123');
    expect(calledUrl).toBe('/api/wishlist');
    expect(calledMethod).toBe('POST');
    expect(JSON.parse(calledBody)).toEqual({ productId: 'p123' });
    expect(res.id).toBe('w1');
  });

  it('removeFromWishlistApi sends DELETE /api/wishlist/:productId', async () => {
    let calledUrl = '';
    let calledMethod = '';

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calledUrl = url;
      calledMethod = init?.method ?? 'DELETE';
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          message: 'Product removed from wishlist',
        }),
      } as unknown as Response;
    });

    const res = await removeFromWishlistApi('p123');
    expect(calledUrl).toBe('/api/wishlist/p123');
    expect(calledMethod).toBe('DELETE');
    expect(res.success).toBe(true);
  });
});
