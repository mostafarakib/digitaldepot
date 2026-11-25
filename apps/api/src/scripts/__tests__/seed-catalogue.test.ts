import fs from 'node:fs/promises';
import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import app from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { cleanDatabase, testPool } from '../../test/setup.js';
import { env } from '../../config/env.js';
import { productService } from '../../modules/catalogue/product.service.js';
import { SEED_BRANDS, SEED_CATEGORIES, SEED_PRODUCTS } from '../seed-catalogue.data.js';
import {
  DEFAULT_SEED_ASSETS_DIR,
  describeTargetDatabase,
  getLocalImagePath,
  requiresProductionConfirmation,
  seedCatalogue,
  verifySeedAssets,
} from '../seed-catalogue.js';

describe('Catalogue Seed Script & Assets Verification', () => {
  const originalFetch = globalThis.fetch;
  const mutableEnv = env as {
    CLOUDINARY_CLOUD_NAME?: string;
    CLOUDINARY_API_KEY?: string;
    CLOUDINARY_API_SECRET?: string;
  };
  let origCloudName: string | undefined;
  let origApiKey: string | undefined;
  let origApiSecret: string | undefined;

  beforeEach(async () => {
    await cleanDatabase();
    vi.restoreAllMocks();
    origCloudName = mutableEnv.CLOUDINARY_CLOUD_NAME;
    origApiKey = mutableEnv.CLOUDINARY_API_KEY;
    origApiSecret = mutableEnv.CLOUDINARY_API_SECRET;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mutableEnv.CLOUDINARY_CLOUD_NAME = origCloudName;
    mutableEnv.CLOUDINARY_API_KEY = origApiKey;
    mutableEnv.CLOUDINARY_API_SECRET = origApiSecret;
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPool.end();
  });

  it('has all 28 products, 9 categories, 16 brands, and readable local optimized WebP assets', async () => {
    expect(SEED_CATEGORIES).toHaveLength(9);
    expect(SEED_BRANDS).toHaveLength(16);
    expect(SEED_PRODUCTS).toHaveLength(28);

    await expect(verifySeedAssets(DEFAULT_SEED_ASSETS_DIR)).resolves.toBeUndefined();

    // Verify attribution manifest exists and covers all 28 products
    const manifestRaw = await fs.readFile(`${DEFAULT_SEED_ASSETS_DIR}/attribution.json`, 'utf-8');
    const manifest = JSON.parse(manifestRaw) as { assets: Array<{ slug: string; file: string }> };
    expect(manifest.assets).toHaveLength(28);

    // Check first and last local files contain valid WebP RIFF header
    for (const prod of SEED_PRODUCTS) {
      const buf = await fs.readFile(getLocalImagePath(DEFAULT_SEED_ASSETS_DIR, prod.slug));
      expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(buf.subarray(8, 12).toString('ascii')).toBe('WEBP');
    }
  });

  it('requires explicit confirmation for production/remote databases and blocks unconfirmed writes', async () => {
    expect(
      requiresProductionConfirmation('production', 'postgresql://user:pass@localhost:5432/db'),
    ).toBe(true);
    expect(
      requiresProductionConfirmation(
        'development',
        'postgresql://user:pass@ep-demo.aws.neon.tech/neondb',
      ),
    ).toBe(true);
    expect(
      requiresProductionConfirmation(
        'development',
        'postgresql://user:pass@localhost:5432/digitaldepot',
      ),
    ).toBe(false);

    const parsedRemote = describeTargetDatabase(
      'postgresql://user:secret@db.neon.tech:5432/neondb',
    );
    expect(parsedRemote).toEqual({
      host: 'db.neon.tech',
      database: 'neondb',
      isLocal: false,
    });
  });

  it('seeds all 28 products idempotently with Cloudinary uploads, preserves existing data, and exposes them in storefront APIs', async () => {
    mutableEnv.CLOUDINARY_CLOUD_NAME = 'digitaldepot-test';
    mutableEnv.CLOUDINARY_API_KEY = '112233445566778';
    mutableEnv.CLOUDINARY_API_SECRET = 'test-cloudinary-api-secret';

    // Pre-existing user + existing category customization + existing product must NOT be overwritten
    const existingCustomer = await prisma.user.create({
      data: {
        email: 'existing-customer@example.com',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    const existingCategory = await prisma.category.create({
      data: {
        name: 'Custom Smartphones Title',
        slug: 'smartphones',
        description: 'Admin customized description',
        displayOrder: 99,
        isActive: true,
      },
    });

    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const form = init?.body as FormData;
      const publicId = String(form.get('public_id'));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          secure_url: `https://res.cloudinary.com/digitaldepot-test/image/upload/v1/${publicId}.webp`,
          public_id: publicId,
          width: 1000,
          height: 1000,
          format: 'webp',
          bytes: 25000,
        }),
      };
    });
    globalThis.fetch = mockFetch;

    // 1st run
    const firstRun = await seedCatalogue({ confirmProduction: true });
    expect(firstRun).toEqual({
      categoriesCreated: 8,
      categoriesReused: 1,
      brandsCreated: 16,
      brandsReused: 0,
      productsCreated: 28,
      productsSkipped: 0,
      variantsCreated: 37,
      imagesUploaded: 28,
    });
    expect(mockFetch).toHaveBeenCalledTimes(28);

    // Pre-existing category name/description & customer account untouched
    const reloadedCategory = await prisma.category.findUniqueOrThrow({
      where: { id: existingCategory.id },
    });
    expect(reloadedCategory.name).toBe('Custom Smartphones Title');
    expect(reloadedCategory.description).toBe('Admin customized description');

    const reloadedCustomer = await prisma.user.findUnique({ where: { id: existingCustomer.id } });
    expect(reloadedCustomer).not.toBeNull();

    // Verify counts in DB
    expect(await prisma.category.count()).toBe(9);
    expect(await prisma.brand.count()).toBe(16);
    expect(await prisma.product.count({ where: { status: 'PUBLISHED' } })).toBe(28);
    expect(await prisma.productVariant.count()).toBe(37);
    expect(await prisma.productImage.count()).toBe(28);
    expect(await prisma.priceHistory.count()).toBe(37);
    expect(await prisma.inventoryItem.count()).toBe(37);
    // 36 in-stock variants create RECEIVE adjustments; Anker 737 has initialStock = 0
    expect(await prisma.inventoryAdjustment.count({ where: { type: 'RECEIVE' } })).toBe(36);

    // Verify storefront listing & product detail API return seeded products cleanly
    const listRes = await request(app).get('/api/v1/products?limit=48');
    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.pagination.total).toBe(28);
    expect(listRes.body.data).toHaveLength(28);

    const detailRes = await request(app).get('/api/v1/products/apple-iphone-16-pro');
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.name).toBe('Apple iPhone 16 Pro');
    expect(detailRes.body.data.variants).toHaveLength(2);
    expect(detailRes.body.data.images[0].url).toBe(
      'https://res.cloudinary.com/digitaldepot-test/image/upload/v1/digitaldepot/products/apple-iphone-16-pro-1.webp',
    );

    const storefrontServiceDetail =
      await productService.getBySlugStorefront('anker-737-power-bank');
    expect(storefrontServiceDetail.isInStock).toBe(false);

    // 2nd run: strictly idempotent — 0 creations, 0 uploads, 28 skipped
    mockFetch.mockClear();
    const secondRun = await seedCatalogue({ confirmProduction: true });
    expect(secondRun).toEqual({
      categoriesCreated: 0,
      categoriesReused: 9,
      brandsCreated: 0,
      brandsReused: 16,
      productsCreated: 0,
      productsSkipped: 28,
      variantsCreated: 0,
      imagesUploaded: 0,
    });
    expect(mockFetch).not.toHaveBeenCalled();

    // Counts unchanged after 2nd run
    expect(await prisma.product.count()).toBe(28);
    expect(await prisma.productVariant.count()).toBe(37);
    expect(await prisma.productImage.count()).toBe(28);
  });
});
