import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as listReviews } from '../reviews/route';
import { PATCH as moderateReview } from '../reviews/[id]/status/route';
import { DELETE as deleteReview } from '../reviews/[id]/route';

describe('BFF Admin Review Moderation Route Handlers (Phase 5D)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /api/admin/reviews', () => {
    it('forwards query parameters to Express admin reviews endpoint', async () => {
      let forwardedUrl = '';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        forwardedUrl = url;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: { reviews: [], pendingCount: 0, pagination: { total: 0 } },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/reviews?status=PENDING&page=1&limit=15',
      );

      const res = await listReviews(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/reviews?status=PENDING&page=1&limit=15');
    });
  });

  describe('PATCH /api/admin/reviews/[id]/status', () => {
    it('rejects cross-origin requests with 403 INVALID_ORIGIN', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/reviews/rev_1/status', {
        method: 'PATCH',
        headers: {
          origin: 'http://malicious-site.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'APPROVED' }),
      });

      const res = await moderateReview(req, {
        params: Promise.resolve({ id: 'rev_1' }),
      });

      expect(res.status).toBe(403);
    });

    it('forwards valid moderation status update to Express backend', async () => {
      let forwardedUrl = '';
      let forwardedBody = '';

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        forwardedUrl = url;
        forwardedBody = init?.body as string;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: { id: 'rev_1', status: 'APPROVED' },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        );
      });

      const req = new NextRequest('http://localhost:3000/api/admin/reviews/rev_1/status', {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          'x-csrf-token': 'csrf-123',
          cookie: 'dd_access=admin_token',
        },
        body: JSON.stringify({ status: 'APPROVED' }),
      });

      const res = await moderateReview(req, {
        params: Promise.resolve({ id: 'rev_1' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/reviews/rev_1/status');
      expect(JSON.parse(forwardedBody)).toEqual({ status: 'APPROVED' });
    });
  });

  describe('DELETE /api/admin/reviews/[id]', () => {
    it('forwards delete request to Express admin backend', async () => {
      let forwardedUrl = '';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        forwardedUrl = url;
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, message: 'Deleted' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const req = new NextRequest('http://localhost:3000/api/admin/reviews/rev_1', {
        method: 'DELETE',
        headers: {
          origin: 'http://localhost:3000',
          'x-csrf-token': 'csrf-123',
          cookie: 'dd_access=admin_token',
        },
      });

      const res = await deleteReview(req, {
        params: Promise.resolve({ id: 'rev_1' }),
      });

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/reviews/rev_1');
    });
  });
});
