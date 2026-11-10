import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getProducts, POST as postProduct } from '../products/route';
import {
  GET as getProductById,
  PATCH as patchProductById,
  DELETE as deleteProductById,
} from '../products/[id]/route';
import { POST as publishProduct } from '../products/[id]/publish/route';
import { POST as archiveProduct } from '../products/[id]/archive/route';
import { GET as checkPublication } from '../products/[id]/check-publish/route';
import { GET as getVariants, POST as postVariant } from '../products/[id]/variants/route';
import { POST as postImage } from '../products/[id]/images/route';
import {
  GET as getVariantById,
  PATCH as patchVariantById,
  DELETE as deleteVariantById,
} from '../variants/[id]/route';
import { GET as getPriceHistory } from '../variants/[id]/price-history/route';

describe('BFF Admin Product & Variant Route Handlers (Phase 4B)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Products BFF Routes', () => {
    it('forwards GET /api/admin/products with search and pagination params', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/products?search=macbook&status=PUBLISHED&page=1',
        { method: 'GET' },
      );

      const res = await getProducts(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain(
        '/api/v1/admin/products?search=macbook&status=PUBLISHED&page=1',
      );
    });

    it('enforces Origin check and forwards POST /api/admin/products', async () => {
      let forwardedBody = '';
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        forwardedBody = init.body as string;
        return new Response(JSON.stringify({ success: true, data: { id: 'p1' } }), { status: 201 });
      });

      // 1. Without origin: 403 Forbidden
      const badReq = new NextRequest('http://localhost:3000/api/admin/products', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      });
      const badRes = await postProduct(badReq);
      expect(badRes.status).toBe(403);

      // 2. With valid origin: 201
      const goodReq = new NextRequest('http://localhost:3000/api/admin/products', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({ name: 'MacBook', categoryId: 'cat1' }),
      });
      const goodRes = await postProduct(goodReq);
      expect(goodRes.status).toBe(201);
      expect(forwardedBody).toContain('MacBook');
    });

    it('forwards GET, PATCH, DELETE for product by ID', async () => {
      let forwardedMethod = '';
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        forwardedMethod = init.method || 'GET';
        return new Response(JSON.stringify({ success: true, data: { id: 'p123' } }), {
          status: 200,
        });
      });

      const params = Promise.resolve({ id: 'p123' });

      // GET
      const getReq = new NextRequest('http://localhost:3000/api/admin/products/p123', {
        method: 'GET',
      });
      const getRes = await getProductById(getReq, { params });
      expect(getRes.status).toBe(200);
      expect(forwardedMethod).toBe('GET');

      // PATCH
      const patchReq = new NextRequest('http://localhost:3000/api/admin/products/p123', {
        method: 'PATCH',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({ summary: 'Updated summary' }),
      });
      const patchRes = await patchProductById(patchReq, { params });
      expect(patchRes.status).toBe(200);
      expect(forwardedMethod).toBe('PATCH');

      // DELETE
      const deleteReq = new NextRequest('http://localhost:3000/api/admin/products/p123', {
        method: 'DELETE',
        headers: { origin: 'http://localhost:3000' },
      });
      const deleteRes = await deleteProductById(deleteReq, { params });
      expect(deleteRes.status).toBe(200);
      expect(forwardedMethod).toBe('DELETE');
    });

    it('forwards publish, archive, and check-publish requests', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      });

      const params = Promise.resolve({ id: 'prod-456' });

      // check-publish
      const checkReq = new NextRequest(
        'http://localhost:3000/api/admin/products/prod-456/check-publish',
        { method: 'GET' },
      );
      await checkPublication(checkReq, { params });
      expect(forwardedUrl).toContain('/api/v1/admin/products/prod-456/check-publish');

      // publish
      const pubReq = new NextRequest('http://localhost:3000/api/admin/products/prod-456/publish', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
      });
      await publishProduct(pubReq, { params });
      expect(forwardedUrl).toContain('/api/v1/admin/products/prod-456/publish');

      // archive
      const archReq = new NextRequest('http://localhost:3000/api/admin/products/prod-456/archive', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
      });
      await archiveProduct(archReq, { params });
      expect(forwardedUrl).toContain('/api/v1/admin/products/prod-456/archive');
    });
  });

  describe('Variants & Price History BFF Routes', () => {
    it('forwards variant list, create, update, delete, and price history', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      });

      const productParams = Promise.resolve({ id: 'prod-789' });
      const variantParams = Promise.resolve({ id: 'var-999' });

      // List variants
      const listReq = new NextRequest(
        'http://localhost:3000/api/admin/products/prod-789/variants',
        { method: 'GET' },
      );
      await getVariants(listReq, { params: productParams });
      expect(forwardedUrl).toContain('/api/v1/admin/products/prod-789/variants');

      // Create variant
      const createReq = new NextRequest(
        'http://localhost:3000/api/admin/products/prod-789/variants',
        {
          method: 'POST',
          headers: { origin: 'http://localhost:3000' },
          body: JSON.stringify({ sku: 'VAR-1', price: 1000 }),
        },
      );
      await postVariant(createReq, { params: productParams });
      expect(forwardedUrl).toContain('/api/v1/admin/products/prod-789/variants');

      // Get variant by ID
      const getVarReq = new NextRequest('http://localhost:3000/api/admin/variants/var-999', {
        method: 'GET',
      });
      await getVariantById(getVarReq, { params: variantParams });
      expect(forwardedUrl).toContain('/api/v1/admin/variants/var-999');

      // Update variant
      const updateReq = new NextRequest('http://localhost:3000/api/admin/variants/var-999', {
        method: 'PATCH',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({ price: 1200 }),
      });
      await patchVariantById(updateReq, { params: variantParams });
      expect(forwardedUrl).toContain('/api/v1/admin/variants/var-999');

      // Get price history
      const historyReq = new NextRequest(
        'http://localhost:3000/api/admin/variants/var-999/price-history',
        { method: 'GET' },
      );
      await getPriceHistory(historyReq, { params: variantParams });
      expect(forwardedUrl).toContain('/api/v1/admin/variants/var-999/price-history');

      // Delete variant
      const delReq = new NextRequest('http://localhost:3000/api/admin/variants/var-999', {
        method: 'DELETE',
        headers: { origin: 'http://localhost:3000' },
      });
      await deleteVariantById(delReq, { params: variantParams });
      expect(forwardedUrl).toContain('/api/v1/admin/variants/var-999');
    });

    it('forwards product image creation', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(JSON.stringify({ success: true, data: { id: 'img-1' } }), {
          status: 201,
        });
      });

      const params = Promise.resolve({ id: 'prod-img-test' });
      const req = new NextRequest('http://localhost:3000/api/admin/products/prod-img-test/images', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({ url: 'https://cloudinary.com/test.jpg' }),
      });

      const res = await postImage(req, { params });
      expect(res.status).toBe(201);
      expect(forwardedUrl).toContain('/api/v1/admin/products/prod-img-test/images');
    });
  });
});
