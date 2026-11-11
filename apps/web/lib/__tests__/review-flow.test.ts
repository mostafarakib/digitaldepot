import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getProductReviewsApi,
  submitReviewApi,
  deleteMyReviewApi,
  getAdminReviewsApi,
  moderateReviewApi,
  deleteAdminReviewApi,
  setInMemoryCsrfToken,
} from '../api-client';

describe('Review Client API Helpers (Phase 5D)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setInMemoryCsrfToken('test-csrf-token');
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  it('getProductReviewsApi formats URL and queries', async () => {
    let calledUrl = '';

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      calledUrl = url;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            product: { id: 'p1', name: 'Test', slug: 'test-phone' },
            summary: { averageRating: 4.5, reviewCount: 2, distribution: {} },
            reviews: [],
            currentUserReview: null,
            pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
          },
        }),
      } as unknown as Response;
    });

    const res = await getProductReviewsApi('test-phone', { page: 1, limit: 10, sortBy: 'newest' });
    expect(calledUrl).toContain('/api/products/test-phone/reviews?page=1&limit=10&sortBy=newest');
    expect(res.summary.averageRating).toBe(4.5);
  });

  it('submitReviewApi sends POST with payload', async () => {
    let calledUrl = '';
    let calledBody = '';

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calledUrl = url;
      calledBody = init?.body as string;
      return {
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: 'r1', rating: 5, comment: 'Great phone!', status: 'PENDING' },
        }),
      } as unknown as Response;
    });

    const res = await submitReviewApi('test-phone', {
      rating: 5,
      title: 'Super',
      comment: 'Great phone!',
    });

    expect(calledUrl).toBe('/api/products/test-phone/reviews');
    expect(JSON.parse(calledBody)).toEqual({
      rating: 5,
      title: 'Super',
      comment: 'Great phone!',
    });
    expect(res.status).toBe('PENDING');
  });

  it('moderateReviewApi sends PATCH to admin review status endpoint', async () => {
    let calledUrl = '';
    let calledBody = '';

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calledUrl = url;
      calledBody = init?.body as string;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: 'r1', status: 'APPROVED' },
        }),
      } as unknown as Response;
    });

    const res = await moderateReviewApi('r1', { status: 'APPROVED' });
    expect(calledUrl).toBe('/api/admin/reviews/r1/status');
    expect(JSON.parse(calledBody)).toEqual({ status: 'APPROVED' });
    expect(res.status).toBe('APPROVED');
  });

  it('deleteAdminReviewApi sends DELETE to admin review endpoint', async () => {
    let calledUrl = '';

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      calledUrl = url;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          message: 'Review deleted',
        }),
      } as unknown as Response;
    });

    const res = await deleteAdminReviewApi('r1');
    expect(calledUrl).toBe('/api/admin/reviews/r1');
    expect(res.success).toBe(true);
  });
});
