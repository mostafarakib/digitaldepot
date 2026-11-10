import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getCategories, POST as postCategory } from '../categories/route';
import { GET as getCategoryTree } from '../categories/tree/route';
import { PATCH as patchReorder } from '../categories/reorder/route';
import {
  GET as getCategoryById,
  PATCH as patchCategoryById,
  DELETE as deleteCategoryById,
} from '../categories/[id]/route';
import { GET as getBrands, POST as postBrand } from '../brands/route';
import {
  GET as getBrandById,
  PATCH as patchBrandById,
  DELETE as deleteBrandById,
} from '../brands/[id]/route';
import { GET as getPublicCategoryTree } from '../../categories/tree/route';
import { GET as getPublicBrands } from '../../brands/route';

describe('BFF Admin Catalogue Route Handlers (Phase 4A)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Categories BFF Routes', () => {
    it('forwards GET /api/admin/categories with query parameters to Express', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/categories?search=phones&page=1',
        {
          method: 'GET',
          headers: { cookie: 'dd_access=test' },
        },
      );

      const res = await getCategories(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/categories?search=phones&page=1');
    });

    it('validates Origin and forwards POST /api/admin/categories', async () => {
      let forwardedBody = '';
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        forwardedBody = init.body as string;
        return new Response(JSON.stringify({ success: true, data: { id: 'c1' } }), { status: 201 });
      });

      // Missing origin: rejected with 403
      const badReq = new NextRequest('http://localhost:3000/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ name: 'Smartphones' }),
      });
      const badRes = await postCategory(badReq);
      expect(badRes.status).toBe(403);

      // Valid origin
      const goodReq = new NextRequest('http://localhost:3000/api/admin/categories', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          'x-csrf-token': 'csrf-123',
        },
        body: JSON.stringify({ name: 'Smartphones' }),
      });
      const goodRes = await postCategory(goodReq);
      expect(goodRes.status).toBe(201);
      expect(JSON.parse(forwardedBody).name).toBe('Smartphones');
    });

    it('forwards GET /api/admin/categories/tree', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      });

      const req = new NextRequest('http://localhost:3000/api/admin/categories/tree', {
        method: 'GET',
      });
      const res = await getCategoryTree(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/categories/tree');
    });

    it('forwards PATCH /api/admin/categories/reorder with origin check', async () => {
      let forwardedBody = '';
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        forwardedBody = init.body as string;
        return new Response(JSON.stringify({ success: true, data: { count: 1 } }), { status: 200 });
      });

      const req = new NextRequest('http://localhost:3000/api/admin/categories/reorder', {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ items: [{ id: 'c1', displayOrder: 0 }] }),
      });

      const res = await patchReorder(req);
      expect(res.status).toBe(200);
      expect(JSON.parse(forwardedBody).items[0].id).toBe('c1');
    });

    it('forwards parameterized routes: GET, PATCH, DELETE /api/admin/categories/[id]', async () => {
      let forwardedMethod = '';
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        forwardedUrl = url;
        forwardedMethod = init.method ?? 'GET';
        return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
      });

      const params = Promise.resolve({ id: 'cat-123' });

      // GET
      const getReq = new NextRequest('http://localhost:3000/api/admin/categories/cat-123');
      const getRes = await getCategoryById(getReq, { params });
      expect(getRes.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/categories/cat-123');
      expect(forwardedMethod).toBe('GET');

      // PATCH
      const patchReq = new NextRequest('http://localhost:3000/api/admin/categories/cat-123', {
        method: 'PATCH',
        headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Cat' }),
      });
      const patchRes = await patchCategoryById(patchReq, { params });
      expect(patchRes.status).toBe(200);
      expect(forwardedMethod).toBe('PATCH');

      // DELETE
      const deleteReq = new NextRequest('http://localhost:3000/api/admin/categories/cat-123', {
        method: 'DELETE',
        headers: { origin: 'http://localhost:3000' },
      });
      const deleteRes = await deleteCategoryById(deleteReq, { params });
      expect(deleteRes.status).toBe(200);
      expect(forwardedMethod).toBe('DELETE');
    });
  });

  describe('Brands BFF Routes', () => {
    it('forwards GET /api/admin/brands and validates Origin on POST', async () => {
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        if (init.method === 'POST') {
          return new Response(JSON.stringify({ success: true, data: { id: 'b1' } }), {
            status: 201,
          });
        }
        return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      });

      // GET
      const getReq = new NextRequest('http://localhost:3000/api/admin/brands');
      const getRes = await getBrands(getReq);
      expect(getRes.status).toBe(200);

      // POST with valid origin
      const postReq = new NextRequest('http://localhost:3000/api/admin/brands', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Apple' }),
      });
      const postRes = await postBrand(postReq);
      expect(postRes.status).toBe(201);
    });

    it('forwards parameterized routes: GET, PATCH, DELETE /api/admin/brands/[id]', async () => {
      let forwardedMethod = '';
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        forwardedMethod = init.method ?? 'GET';
        return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
      });

      const params = Promise.resolve({ id: 'brand-999' });

      // GET
      const getReq = new NextRequest('http://localhost:3000/api/admin/brands/brand-999');
      await getBrandById(getReq, { params });
      expect(forwardedMethod).toBe('GET');

      // PATCH
      const patchReq = new NextRequest('http://localhost:3000/api/admin/brands/brand-999', {
        method: 'PATCH',
        headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Apple Inc' }),
      });
      await patchBrandById(patchReq, { params });
      expect(forwardedMethod).toBe('PATCH');

      // DELETE
      const deleteReq = new NextRequest('http://localhost:3000/api/admin/brands/brand-999', {
        method: 'DELETE',
        headers: { origin: 'http://localhost:3000' },
      });
      await deleteBrandById(deleteReq, { params });
      expect(forwardedMethod).toBe('DELETE');
    });
  });

  describe('Public Catalogue BFF Routes', () => {
    it('forwards GET /api/categories/tree and GET /api/brands without origin check', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      });

      // Categories tree
      const catReq = new NextRequest('http://localhost:3000/api/categories/tree');
      const catRes = await getPublicCategoryTree(catReq);
      expect(catRes.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/categories/tree');

      // Brands
      const brandReq = new NextRequest('http://localhost:3000/api/brands');
      const brandRes = await getPublicBrands(brandReq);
      expect(brandRes.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/brands');
    });
  });
});
