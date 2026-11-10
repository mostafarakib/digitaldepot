import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool } from '../../../test/setup.js';
import { categoryService } from '../category.service.js';
import { brandService } from '../brand.service.js';
import { productService } from '../product.service.js';
import { variantService } from '../variant.service.js';
import { imageService } from '../image.service.js';

describe('Public Storefront Catalogue & Product Detail API (Phase 4D)', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPool.end();
  });

  async function createPublishedProduct(params: {
    name: string;
    slug?: string;
    categoryId: string;
    brandId?: string | null;
    status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    featured?: boolean;
    sku: string;
    price: number;
    compareAtPrice?: number | null;
    initialStock?: number;
    reservedQuantity?: number;
    summary?: string;
    description?: string;
    warranty?: string;
    specifications?: Array<{ group: string; name: string; value: string }>;
  }) {
    const product = await productService.create({
      name: params.name,
      slug: params.slug,
      summary: params.summary ?? `${params.name} summary`,
      description: params.description ?? `${params.name} description`,
      categoryId: params.categoryId,
      brandId: params.brandId ?? null,
      featured: params.featured ?? false,
      warranty: params.warranty ?? '1 Year Warranty',
      specifications: params.specifications ?? [
        { group: 'General', name: 'Color', value: 'Black' },
      ],
      initialVariant: {
        sku: params.sku,
        price: params.price,
        compareAtPrice: params.compareAtPrice ?? null,
        initialStock: params.initialStock ?? 10,
      },
    });

    // Add primary image
    await imageService.add(product.id, {
      url: `https://res.cloudinary.com/demo/image/upload/v1/${params.sku.toLowerCase()}.jpg`,
      altText: params.name,
      isPrimary: true,
    });

    // If reserved quantity is specified, update the inventory item directly
    if (params.reservedQuantity && params.reservedQuantity > 0) {
      const variant = product.variants[0];
      await prisma.inventoryItem.update({
        where: { variantId: variant.id },
        data: { reservedQuantity: params.reservedQuantity },
      });
    }

    if (params.status === 'PUBLISHED' || params.status === undefined) {
      await productService.publish(product.id);
    } else if (params.status === 'ARCHIVED') {
      await productService.publish(product.id);
      await productService.archive(product.id);
    }

    return await productService.getById(product.id);
  }

  describe('Requirement 4: Public Visibility Constraints', () => {
    it('returns only PUBLISHED products in listing and hides DRAFT or ARCHIVED products', async () => {
      const category = await categoryService.create({ name: 'Laptops', slug: 'laptops' });

      // 1 published product
      await createPublishedProduct({
        name: 'MacBook Pro',
        sku: 'MBP-PUB',
        price: 25000000,
        categoryId: category.id,
        status: 'PUBLISHED',
      });

      // 1 draft product
      await createPublishedProduct({
        name: 'MacBook Air Draft',
        sku: 'MBA-DRAFT',
        price: 15000000,
        categoryId: category.id,
        status: 'DRAFT',
      });

      // 1 archived product
      await createPublishedProduct({
        name: 'MacBook 12 Archived',
        sku: 'MB12-ARCH',
        price: 12000000,
        categoryId: category.id,
        status: 'ARCHIVED',
      });

      const res = await request(app).get('/api/v1/products');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('MacBook Pro');
      expect(res.body.pagination.total).toBe(1);
    });

    it('excludes published products whose assigned category is inactive', async () => {
      const activeCategory = await categoryService.create({
        name: 'Smartphones',
        slug: 'smartphones',
        isActive: true,
      });
      const inactiveCategory = await categoryService.create({
        name: 'Old Gadgets',
        slug: 'old-gadgets',
        isActive: true,
      });

      await createPublishedProduct({
        name: 'iPhone 15',
        sku: 'IPHONE15',
        price: 12000000,
        categoryId: activeCategory.id,
      });

      const hiddenProduct = await createPublishedProduct({
        name: 'Retro Radio',
        sku: 'RETRO-01',
        price: 500000,
        categoryId: inactiveCategory.id,
      });

      // Deactivate the category
      await categoryService.update(inactiveCategory.id, { isActive: false });

      const res = await request(app).get('/api/v1/products');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('iPhone 15');

      // Product detail by slug must also reject with 404
      const detailRes = await request(app).get(`/api/v1/products/${hiddenProduct.slug}`);
      expect(detailRes.status).toBe(404);
      expect(detailRes.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('excludes published products whose assigned brand is deactivated', async () => {
      const category = await categoryService.create({ name: 'Audio', slug: 'audio' });
      const brand = await brandService.create({ name: 'Sony', slug: 'sony', isActive: true });

      const product = await createPublishedProduct({
        name: 'Sony WH-1000XM5',
        sku: 'SONY-XM5',
        price: 3500000,
        categoryId: category.id,
        brandId: brand.id,
      });

      // Verify visible
      let res = await request(app).get('/api/v1/products');
      expect(res.body.data).toHaveLength(1);

      // Deactivate brand
      await brandService.update(brand.id, { isActive: false });

      // Must be excluded from listing
      res = await request(app).get('/api/v1/products');
      expect(res.body.data).toHaveLength(0);

      // Detail must return 404
      const detailRes = await request(app).get(`/api/v1/products/${product.slug}`);
      expect(detailRes.status).toBe(404);
      expect(detailRes.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('excludes products if all their variants are deactivated', async () => {
      const category = await categoryService.create({ name: 'Tablets', slug: 'tablets' });
      const product = await createPublishedProduct({
        name: 'iPad Pro',
        sku: 'IPAD-PRO',
        price: 11000000,
        categoryId: category.id,
      });

      // Directly deactivate all variants at DB level
      await prisma.productVariant.updateMany({
        where: { productId: product.id },
        data: { isActive: false },
      });

      const res = await request(app).get('/api/v1/products');
      expect(res.body.data).toHaveLength(0);

      const detailRes = await request(app).get(`/api/v1/products/${product.slug}`);
      expect(detailRes.status).toBe(404);
    });
  });

  describe('Requirement 1: Available-Stock Filtering', () => {
    it('treats available stock strictly as (quantity - reservedQuantity) and not quantity > 0', async () => {
      const category = await categoryService.create({ name: 'Storage', slug: 'storage' });

      // Product 1: physical stock 10, reserved 10 -> available stock 0 (OUT OF STOCK)
      await createPublishedProduct({
        name: 'SSD 1TB Fully Reserved',
        sku: 'SSD-1TB-RES',
        price: 800000,
        categoryId: category.id,
        initialStock: 10,
        reservedQuantity: 10,
      });

      // Product 2: physical stock 10, reserved 2 -> available stock 8 (IN STOCK)
      await createPublishedProduct({
        name: 'SSD 2TB Available',
        sku: 'SSD-2TB-AVAIL',
        price: 1500000,
        categoryId: category.id,
        initialStock: 10,
        reservedQuantity: 2,
      });

      // Query without stock filter: both appear
      let res = await request(app).get('/api/v1/products');
      expect(res.body.data).toHaveLength(2);

      // Query with inStock=true: strictly filters using quantity > reservedQuantity
      res = await request(app).get('/api/v1/products?inStock=true');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('SSD 2TB Available');
      expect(res.body.data[0].isInStock).toBe(true);
      expect(res.body.data[0].totalAvailableStock).toBe(8); // 10 - 2 = 8
    });
  });

  describe('Requirement 2: Search and Brand Filter Composition', () => {
    it('without a brand filter, includes both unbranded products and products with active brands', async () => {
      const category = await categoryService.create({ name: 'Accessories', slug: 'accessories' });
      const activeBrand = await brandService.create({ name: 'Logitech', slug: 'logitech' });
      const brandToDeactivate = await brandService.create({
        name: 'Defunct Brand',
        slug: 'defunct',
        isActive: true,
      });

      // 1 unbranded product
      await createPublishedProduct({
        name: 'Generic Mousepad',
        sku: 'GEN-PAD',
        price: 50000,
        categoryId: category.id,
        brandId: null,
      });

      // 1 branded product (active brand)
      await createPublishedProduct({
        name: 'Logitech MX Master 3S',
        sku: 'LOGI-MX3S',
        price: 1100000,
        categoryId: category.id,
        brandId: activeBrand.id,
      });

      // 1 product published with active brand, which is later deactivated
      await createPublishedProduct({
        name: 'Defunct Keyboard',
        sku: 'DEF-KB',
        price: 200000,
        categoryId: category.id,
        brandId: brandToDeactivate.id,
      });

      // Deactivate the brand post-publication
      await brandService.update(brandToDeactivate.id, { isActive: false });

      const res = await request(app).get('/api/v1/products');
      expect(res.body.data).toHaveLength(2);
      const names = res.body.data.map((p: { name: string }) => p.name);
      expect(names).toContain('Generic Mousepad');
      expect(names).toContain('Logitech MX Master 3S');
      expect(names).not.toContain('Defunct Keyboard');
    });

    it('with a brand filter, includes only matching active brands and excludes unbranded products', async () => {
      const category = await categoryService.create({ name: 'Monitors', slug: 'monitors' });
      const dell = await brandService.create({ name: 'Dell', slug: 'dell' });
      const lg = await brandService.create({ name: 'LG', slug: 'lg' });

      await createPublishedProduct({
        name: 'Dell UltraSharp 27',
        sku: 'DELL-U27',
        price: 4500000,
        categoryId: category.id,
        brandId: dell.id,
      });

      await createPublishedProduct({
        name: 'LG UltraFine 32',
        sku: 'LG-32',
        price: 5500000,
        categoryId: category.id,
        brandId: lg.id,
      });

      await createPublishedProduct({
        name: 'Generic Monitor Stand',
        sku: 'GEN-STAND',
        price: 300000,
        categoryId: category.id,
        brandId: null,
      });

      const res = await request(app).get('/api/v1/products?brand=dell');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Dell UltraSharp 27');
    });

    it('combines search and brand filter using an explicit AND structure without clobbering OR conditions', async () => {
      const category = await categoryService.create({ name: 'Laptops', slug: 'laptops' });
      const apple = await brandService.create({ name: 'Apple', slug: 'apple' });
      const asus = await brandService.create({ name: 'ASUS', slug: 'asus' });

      await createPublishedProduct({
        name: 'Apple MacBook Pro M3',
        summary: 'Pro laptop with extreme battery life',
        sku: 'MBP-M3',
        price: 22000000,
        categoryId: category.id,
        brandId: apple.id,
      });

      await createPublishedProduct({
        name: 'ASUS ZenBook 14 OLED',
        summary: 'Thin laptop with bright OLED display',
        sku: 'ZEN-14',
        price: 13000000,
        categoryId: category.id,
        brandId: asus.id,
      });

      // Search for "laptop" within brand=apple
      const res = await request(app).get('/api/v1/products?q=laptop&brand=apple');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Apple MacBook Pro M3');
    });
  });

  describe('Search Coverage & Leak Prevention Audit', () => {
    it('searches case-insensitively across product name', async () => {
      const category = await categoryService.create({ name: 'Audio', slug: 'audio' });
      await createPublishedProduct({
        name: 'Noise Cancelling Headphones',
        summary: 'Great audio device',
        description: 'Over-ear design',
        sku: 'NCH-001',
        price: 500000,
        categoryId: category.id,
      });

      // Uppercase search
      const upperRes = await request(app).get('/api/v1/products?q=HEADPHONES');
      expect(upperRes.body.data).toHaveLength(1);
      expect(upperRes.body.data[0].name).toBe('Noise Cancelling Headphones');

      // Lowercase search
      const lowerRes = await request(app).get('/api/v1/products?q=cancelling');
      expect(lowerRes.body.data).toHaveLength(1);
    });

    it('searches case-insensitively across product summary', async () => {
      const category = await categoryService.create({ name: 'Wearables', slug: 'wearables' });
      await createPublishedProduct({
        name: 'Fitness Tracker',
        summary: 'Monitors your cardiovascular health constantly',
        description: 'Water resistant design',
        sku: 'FIT-001',
        price: 300000,
        categoryId: category.id,
      });

      const res = await request(app).get('/api/v1/products?q=CARDIOVASCULAR');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Fitness Tracker');
    });

    it('searches case-insensitively across product description', async () => {
      const category = await categoryService.create({
        name: 'Accessories Cat',
        slug: 'accessories-cat',
      });
      await createPublishedProduct({
        name: 'USB-C Cable',
        summary: 'High durability cable',
        description: 'Crafted with braided kevlar fiber for extreme tensile strength',
        sku: 'CABLE-001',
        price: 15000,
        categoryId: category.id,
      });

      const res = await request(app).get('/api/v1/products?q=KEVLAR');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('USB-C Cable');
    });

    it('searches case-insensitively across active variant SKU', async () => {
      const category = await categoryService.create({
        name: 'Components Cat',
        slug: 'components-cat',
      });
      const product = await createPublishedProduct({
        name: 'Graphics Card',
        summary: 'High performance gaming GPU',
        description: '16GB VRAM',
        sku: 'RTX-4080-BASE',
        price: 12000000,
        categoryId: category.id,
      });

      // Add a secondary active variant with distinct SKU
      await variantService.create(product.id, {
        sku: 'RTX-4080-OC-WHITE',
        name: 'White OC Edition',
        price: 13500000,
        initialStock: 5,
        isActive: true,
      });

      // Search by partial secondary variant SKU
      const res = await request(app).get('/api/v1/products?q=oc-white');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Graphics Card');
    });

    it('searches case-insensitively across brand name', async () => {
      const category = await categoryService.create({
        name: 'Keyboards Cat',
        slug: 'keyboards-cat',
      });
      const brand = await brandService.create({ name: 'Keychron', slug: 'keychron' });

      await createPublishedProduct({
        name: 'Custom Mechanical Board',
        summary: 'Hot swappable switches',
        description: 'Aluminum frame',
        sku: 'KCH-K2',
        price: 900000,
        categoryId: category.id,
        brandId: brand.id,
      });

      const res = await request(app).get('/api/v1/products?q=keychron');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Custom Mechanical Board');
    });

    it('does NOT match on inactive variant SKU', async () => {
      const category = await categoryService.create({ name: 'Drives Cat', slug: 'drives-cat' });
      const product = await createPublishedProduct({
        name: 'NVMe Drive',
        summary: 'Fast SSD storage',
        description: 'PCIe 4.0 storage',
        sku: 'NVME-BASE-1TB',
        price: 800000,
        categoryId: category.id,
      });

      // Add an inactive variant with a unique SKU
      await variantService.create(product.id, {
        sku: 'SECRET-DISCONTINUED-SKU',
        name: 'Discontinued 4TB',
        price: 3000000,
        initialStock: 0,
        isActive: false,
      });

      // Search for the inactive variant's SKU
      const res = await request(app).get('/api/v1/products?q=SECRET-DISCONTINUED');
      expect(res.body.data).toHaveLength(0);
    });

    it('does NOT leak products with inactive brands during brand search', async () => {
      const category = await categoryService.create({ name: 'Displays Cat', slug: 'displays-cat' });
      const brand = await brandService.create({
        name: 'VintageMonitors',
        slug: 'vintage-monitors',
      });

      await createPublishedProduct({
        name: 'CRT Display 19',
        summary: 'Retro CRT monitor',
        description: 'Classic phosphor display',
        sku: 'CRT-19',
        price: 400000,
        categoryId: category.id,
        brandId: brand.id,
      });

      // Deactivate the brand
      await brandService.update(brand.id, { isActive: false });

      // Search for the inactive brand name
      const res = await request(app).get('/api/v1/products?q=VintageMonitors');
      expect(res.body.data).toHaveLength(0);
    });

    it('does NOT leak unpublished (DRAFT or ARCHIVED) products during search', async () => {
      const category = await categoryService.create({ name: 'Hardware Cat', slug: 'hardware-cat' });

      // Draft product
      await createPublishedProduct({
        name: 'Unreleased Prototype Secret',
        summary: 'Secret hardware',
        description: 'Classified',
        sku: 'PROTO-X',
        price: 999999,
        categoryId: category.id,
        status: 'DRAFT',
      });

      // Archived product
      await createPublishedProduct({
        name: 'Archived Obsolete Secret',
        summary: 'Obsolete hardware',
        description: 'Classified',
        sku: 'OBSOLETE-Y',
        price: 111111,
        categoryId: category.id,
        status: 'ARCHIVED',
      });

      const res = await request(app).get('/api/v1/products?q=Secret');
      expect(res.body.data).toHaveLength(0);
    });

    it('composes search correctly with category, price range, and inStock filters', async () => {
      const catA = await categoryService.create({
        name: 'Laptops Cat Search',
        slug: 'laptops-cat-search',
      });
      const catB = await categoryService.create({
        name: 'Desktops Cat Search',
        slug: 'desktops-cat-search',
      });

      // Product 1: In Cat A, price 25,000 poisha, in stock
      await createPublishedProduct({
        name: 'Gaming Rig Laptop',
        summary: 'Portable gaming machine',
        description: 'Fast CPU',
        sku: 'RIG-LAP',
        price: 2500000,
        categoryId: catA.id,
        initialStock: 10,
        reservedQuantity: 2,
      });

      // Product 2: In Cat A, price 50,000 poisha, in stock
      await createPublishedProduct({
        name: 'Extreme Rig Laptop',
        summary: 'Ultra high end gaming',
        description: 'Fast CPU',
        sku: 'EXT-LAP',
        price: 5000000,
        categoryId: catA.id,
        initialStock: 5,
        reservedQuantity: 0,
      });

      // Product 3: In Cat A, price 25,000 poisha, OUT OF STOCK (reserved = initial)
      await createPublishedProduct({
        name: 'Sold Out Rig Laptop',
        summary: 'Budget gaming',
        description: 'Fast CPU',
        sku: 'SOL-LAP',
        price: 2500000,
        categoryId: catA.id,
        initialStock: 5,
        reservedQuantity: 5,
      });

      // Product 4: In Cat B (wrong category), price 25,000 poisha, in stock
      await createPublishedProduct({
        name: 'Desk Rig Desktop',
        summary: 'Gaming tower',
        description: 'Fast CPU',
        sku: 'DSK-RIG',
        price: 2500000,
        categoryId: catB.id,
        initialStock: 10,
        reservedQuantity: 0,
      });

      // Search 'Rig' + category 'laptops-cat-search' + minPrice 2,000,000 + maxPrice 3,000,000 + inStock true
      const query =
        '/api/v1/products?q=Rig&category=laptops-cat-search&minPrice=2000000&maxPrice=3000000&inStock=true';
      const res = await request(app).get(query);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Gaming Rig Laptop');
    });
  });

  describe('Requirement 3: Featured Filter', () => {
    it('filters products by featured=true or featured=false', async () => {
      const category = await categoryService.create({ name: 'Mobiles', slug: 'mobiles' });

      await createPublishedProduct({
        name: 'Featured Flagship',
        sku: 'FLAG-01',
        price: 10000000,
        categoryId: category.id,
        featured: true,
      });

      await createPublishedProduct({
        name: 'Standard Phone',
        sku: 'STD-01',
        price: 4000000,
        categoryId: category.id,
        featured: false,
      });

      const featRes = await request(app).get('/api/v1/products?featured=true');
      expect(featRes.body.data).toHaveLength(1);
      expect(featRes.body.data[0].name).toBe('Featured Flagship');

      const nonFeatRes = await request(app).get('/api/v1/products?featured=false');
      expect(nonFeatRes.body.data).toHaveLength(1);
      expect(nonFeatRes.body.data[0].name).toBe('Standard Phone');
    });
  });

  describe('Requirement 5: Price Filtering, Aggregation & Database Sorting', () => {
    it('matches products when at least one active variant satisfies the price range and calculates price min/max from active variants only', async () => {
      const category = await categoryService.create({ name: 'PCs', slug: 'pcs' });

      // Product with 2 active variants: 10,000 poisha and 30,000 poisha
      const product = await createPublishedProduct({
        name: 'Custom Desktop PC',
        sku: 'PC-BASE',
        price: 1000000, // ৳10,000
        categoryId: category.id,
      });

      // Add a higher-tier active variant
      await variantService.create(product.id, {
        sku: 'PC-PRO',
        name: 'Pro Tier',
        price: 3000000, // ৳30,000
        initialStock: 5,
        isActive: true,
      });

      // Add an inactive variant with extreme price (should be ignored in aggregation)
      await variantService.create(product.id, {
        sku: 'PC-EXTREME',
        name: 'Extreme Tier (Deactivated)',
        price: 90000000, // ৳900,000
        initialStock: 1,
        isActive: false,
      });

      // Request price range matching only the second variant
      const res = await request(app).get('/api/v1/products?minPrice=2000000&maxPrice=4000000');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].minPrice).toBe(1000000);
      expect(res.body.data[0].maxPrice).toBe(3000000); // 30,000, not 900,000 from inactive variant!
    });

    it('sorts products by price-asc and price-desc at the database level', async () => {
      const category = await categoryService.create({ name: 'Components', slug: 'components' });

      await createPublishedProduct({
        name: 'Mid PC',
        sku: 'MID-PC',
        price: 5000000, // ৳50,000
        categoryId: category.id,
      });

      await createPublishedProduct({
        name: 'Budget PC',
        sku: 'BUDGET-PC',
        price: 2000000, // ৳20,000
        categoryId: category.id,
      });

      await createPublishedProduct({
        name: 'High-End PC',
        sku: 'HIGH-PC',
        price: 9000000, // ৳90,000
        categoryId: category.id,
      });

      // Sort price-asc
      const ascRes = await request(app).get('/api/v1/products?sort=price-asc');
      expect(ascRes.body.data.map((p: { name: string }) => p.name)).toEqual([
        'Budget PC',
        'Mid PC',
        'High-End PC',
      ]);

      // Sort price-desc
      const descRes = await request(app).get('/api/v1/products?sort=price-desc');
      expect(descRes.body.data.map((p: { name: string }) => p.name)).toEqual([
        'High-End PC',
        'Mid PC',
        'Budget PC',
      ]);
    });
  });

  describe('Category Hierarchy Resolution', () => {
    it('includes products in descendant categories when querying parent category slug', async () => {
      // Create root category: Computing
      const computing = await categoryService.create({ name: 'Computing', slug: 'computing' });

      // Create child category: Laptops
      const laptops = await categoryService.create({
        name: 'Laptops',
        slug: 'laptops',
        parentId: computing.id,
      });

      // Create grandchild category: Ultrabooks
      const ultrabooks = await categoryService.create({
        name: 'Ultrabooks',
        slug: 'ultrabooks',
        parentId: laptops.id,
      });

      await createPublishedProduct({
        name: 'General Desktop',
        sku: 'COMP-01',
        price: 4000000,
        categoryId: computing.id,
      });

      await createPublishedProduct({
        name: 'Work Laptop',
        sku: 'LAP-01',
        price: 7000000,
        categoryId: laptops.id,
      });

      await createPublishedProduct({
        name: 'Zen Ultrabook',
        sku: 'ULTRA-01',
        price: 9000000,
        categoryId: ultrabooks.id,
      });

      // Query root category 'computing': must return all 3 products
      const rootRes = await request(app).get('/api/v1/products?category=computing');
      expect(rootRes.body.data).toHaveLength(3);

      // Query subcategory 'laptops': must return Laptops and Ultrabooks (2 products)
      const subRes = await request(app).get('/api/v1/products?category=laptops');
      expect(subRes.body.data).toHaveLength(2);
      const subNames = subRes.body.data.map((p: { name: string }) => p.name);
      expect(subNames).toContain('Work Laptop');
      expect(subNames).toContain('Zen Ultrabook');

      // Query leaf category 'ultrabooks': must return only 1
      const leafRes = await request(app).get('/api/v1/products?category=ultrabooks');
      expect(leafRes.body.data).toHaveLength(1);
      expect(leafRes.body.data[0].name).toBe('Zen Ultrabook');
    });
  });

  describe('Public Product Detail Endpoint (GET /api/v1/products/:slug)', () => {
    it('returns full product details with breadcrumbs, active variants, available stock, and specifications', async () => {
      const parent = await categoryService.create({ name: 'Electronics', slug: 'electronics' });
      const category = await categoryService.create({
        name: 'Cameras',
        slug: 'cameras',
        parentId: parent.id,
      });
      const brand = await brandService.create({ name: 'Canon', slug: 'canon' });

      const product = await createPublishedProduct({
        name: 'Canon EOS R5',
        slug: 'canon-eos-r5',
        categoryId: category.id,
        brandId: brand.id,
        sku: 'R5-BODY',
        price: 34000000,
        compareAtPrice: 38000000,
        initialStock: 12,
        warranty: '2 Years Manufacturer Warranty',
        specifications: [
          { group: 'Sensor', name: 'Megapixels', value: '45MP' },
          { group: 'Video', name: 'Max Resolution', value: '8K RAW' },
        ],
      });

      const res = await request(app).get('/api/v1/products/canon-eos-r5');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.name).toBe('Canon EOS R5');
      expect(data.slug).toBe('canon-eos-r5');
      expect(data.warranty).toBe('2 Years Manufacturer Warranty');
      expect(data.specifications).toHaveLength(2);

      // Breadcrumbs check
      expect(data.category.breadcrumbs).toHaveLength(2);
      expect(data.category.breadcrumbs[0].slug).toBe('electronics');
      expect(data.category.breadcrumbs[1].slug).toBe('cameras');

      // Brand check
      expect(data.brand.name).toBe('Canon');

      // Variants check
      expect(data.variants).toHaveLength(1);
      expect(data.variants[0].sku).toBe('R5-BODY');
      expect(data.variants[0].availableStock).toBe(12);
      expect(data.variants[0].isOutOfStock).toBe(false);
      expect(data.isInStock).toBe(true);
      expect(data.defaultVariantId).toBe(product.variants[0].id);
    });

    it('returns 404 for un-published product or non-existent slug', async () => {
      const res = await request(app).get('/api/v1/products/non-existent-product');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });
  });
});
