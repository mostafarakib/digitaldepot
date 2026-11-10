import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool } from '../../../test/setup.js';
import { productService } from '../product.service.js';
import { variantService } from '../variant.service.js';
import { imageService } from '../image.service.js';
import { categoryService } from '../category.service.js';
import { brandService } from '../brand.service.js';
import { cloudinaryService } from '../cloudinary.service.js';
import { BadRequestError, ConflictError } from '../../../lib/errors.js';

describe('Product, Variant & PriceHistory Service Tests (Phase 4B)', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPool.end();
  });

  async function createCategoryAndBrand(categoryActive = true, brandActive = true) {
    const category = await categoryService.create({
      name: 'Smartphones',
      slug: 'smartphones',
      isActive: categoryActive,
    });

    const brand = await brandService.create({
      name: 'Apple',
      slug: 'apple',
      isActive: brandActive,
    });

    return { category, brand };
  }

  describe('Product Creation & Lifecycle', () => {
    it('creates product with slug and optional initial variant in integer poisha', async () => {
      const { category, brand } = await createCategoryAndBrand();

      const product = await productService.create({
        name: 'iPhone 16 Pro',
        categoryId: category.id,
        brandId: brand.id,
        summary: 'Latest titanium flagship phone',
        warranty: '1 Year Official',
        featured: true,
        initialVariant: {
          sku: 'iph16p-128-blk', // Lowercase; should normalize to uppercase
          price: 15999900, // ৳159,999 in poisha
        },
      });

      expect(product).toBeDefined();
      expect(product.slug).toBe('iphone-16-pro');
      expect(product.status).toBe('DRAFT');
      expect(product.featured).toBe(true);
      expect(product.variants).toHaveLength(1);

      const variant = product.variants[0];
      expect(variant.sku).toBe('IPH16P-128-BLK');
      expect(variant.price).toBe(15999900);
      expect(variant.isDefault).toBe(true);
      expect(variant.isActive).toBe(true);

      // Verify initial price history record was created
      const history = await variantService.getPriceHistory(variant.id);
      expect(history).toHaveLength(1);
      expect(history[0].oldPrice).toBe(0);
      expect(history[0].newPrice).toBe(15999900);
      expect(history[0].reason).toBe('Initial variant creation');
    });

    it('rejects duplicate product slugs', async () => {
      const { category } = await createCategoryAndBrand();

      await productService.create({
        name: 'Galaxy S24',
        slug: 'galaxy-s24',
        categoryId: category.id,
      });

      await expect(
        productService.create({
          name: 'Galaxy S24 Duplicate',
          slug: 'galaxy-s24',
          categoryId: category.id,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it('archives a product successfully', async () => {
      const { category } = await createCategoryAndBrand();

      const product = await productService.create({
        name: 'Pixel 9 Pro',
        categoryId: category.id,
      });

      const archived = await productService.archive(product.id);
      expect(archived.status).toBe('ARCHIVED');
    });
  });

  describe('Variant Management & Default Invariants', () => {
    it('normalizes SKU to uppercase and enforces store-wide uniqueness', async () => {
      const { category } = await createCategoryAndBrand();

      const p1 = await productService.create({
        name: 'Laptop 1',
        categoryId: category.id,
      });

      const p2 = await productService.create({
        name: 'Laptop 2',
        categoryId: category.id,
      });

      const v1 = await variantService.create(p1.id, {
        sku: 'mac-m3-16gb',
        name: '16GB Model',
        price: 20000000,
      });
      expect(v1.sku).toBe('MAC-M3-16GB');

      // Attempt creating variant on p2 with same SKU (case-insensitive)
      await expect(
        variantService.create(p2.id, {
          sku: 'MAC-M3-16gb',
          name: 'Another Model',
          price: 21000000,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it('rejects designating an inactive variant as the default variant', async () => {
      const { category } = await createCategoryAndBrand();
      const product = await productService.create({
        name: 'Tablet',
        categoryId: category.id,
      });

      await expect(
        variantService.create(product.id, {
          sku: 'TAB-001',
          name: 'Inactive Default Attempt',
          price: 5000000,
          isActive: false,
          isDefault: true,
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it('atomically demotes previous default when a new variant is designated default', async () => {
      const { category } = await createCategoryAndBrand();
      const product = await productService.create({
        name: 'Monitor',
        categoryId: category.id,
      });

      // First variant becomes default automatically
      const v1 = await variantService.create(product.id, {
        sku: 'MON-27-FHD',
        name: '27 inch FHD',
        price: 3000000,
      });
      expect(v1.isDefault).toBe(true);

      // Second variant created with isDefault: true
      const v2 = await variantService.create(product.id, {
        sku: 'MON-32-4K',
        name: '32 inch 4K',
        price: 6000000,
        isDefault: true,
      });
      expect(v2.isDefault).toBe(true);

      // Verify v1 is now demoted
      const reloadedV1 = await variantService.getById(v1.id);
      expect(reloadedV1.isDefault).toBe(false);
    });

    it('promotes another active variant when current default is deactivated', async () => {
      const { category } = await createCategoryAndBrand();
      const product = await productService.create({
        name: 'Headphones',
        categoryId: category.id,
      });

      const v1 = await variantService.create(product.id, {
        sku: 'HP-BLK',
        name: 'Black',
        price: 1000000,
        isDefault: true,
      });

      const v2 = await variantService.create(product.id, {
        sku: 'HP-WHT',
        name: 'White',
        price: 1000000,
        isDefault: false,
        isActive: true,
      });

      // Deactivate v1
      await variantService.update(v1.id, { isActive: false });

      // v2 must have been promoted to default
      const reloadedV2 = await variantService.getById(v2.id);
      expect(reloadedV2.isDefault).toBe(true);
    });

    it('rejects deleting the only variant of a product', async () => {
      const { category } = await createCategoryAndBrand();
      const product = await productService.create({
        name: 'Mouse',
        categoryId: category.id,
      });

      const v1 = await variantService.create(product.id, {
        sku: 'MOU-001',
        name: 'Wireless Mouse',
        price: 150000,
      });

      await expect(variantService.delete(v1.id)).rejects.toThrow(BadRequestError);
    });
  });

  describe('PriceHistory Immutability & Audit Tracking', () => {
    it('creates an immutable audit record whenever price or compareAtPrice changes', async () => {
      const { category } = await createCategoryAndBrand();
      const product = await productService.create({
        name: 'Keyboard',
        categoryId: category.id,
      });

      const variant = await variantService.create(product.id, {
        sku: 'KB-MECH',
        name: 'Mechanical Keyboard',
        price: 800000, // ৳8,000
      });

      // Update price with reason
      await variantService.update(variant.id, {
        price: 750000, // ৳7,500
        compareAtPrice: 800000,
        reason: 'Holiday Promotion',
      });

      const history = await variantService.getPriceHistory(variant.id);
      expect(history).toHaveLength(2);

      // Latest record
      expect(history[0].oldPrice).toBe(800000);
      expect(history[0].newPrice).toBe(750000);
      expect(history[0].newCompareAt).toBe(800000);
      expect(history[0].reason).toBe('Holiday Promotion');
    });

    it('restricts deleting a variant that has price change history', async () => {
      const { category } = await createCategoryAndBrand();
      const product = await productService.create({
        name: 'Camera',
        categoryId: category.id,
      });

      const v1 = await variantService.create(product.id, {
        sku: 'CAM-BODY',
        name: 'Body Only',
        price: 12000000,
      });

      await variantService.create(product.id, {
        sku: 'CAM-KIT',
        name: 'Kit Lens',
        price: 15000000,
      });

      // Change v1's price to create second audit entry
      await variantService.update(v1.id, {
        price: 11500000,
        reason: 'Price drop',
      });

      // Attempt deleting v1 must fail due to historical price records
      await expect(variantService.delete(v1.id)).rejects.toThrow(ConflictError);
    });

    it('restricts deleting a product whose variants have price change history', async () => {
      const { category } = await createCategoryAndBrand();
      const product = await productService.create({
        name: 'Lens',
        categoryId: category.id,
      });

      const v = await variantService.create(product.id, {
        sku: 'LENS-50MM',
        name: '50mm f/1.8',
        price: 2000000,
      });

      await variantService.update(v.id, {
        price: 1900000,
        reason: 'Price match',
      });

      await expect(productService.delete(product.id)).rejects.toThrow(ConflictError);
    });
  });

  describe('Brand and Category Deletion Safeguards (Requirement 1 & Phase 4A)', () => {
    it('prevents hard deletion of a brand that has referenced products', async () => {
      const { category, brand } = await createCategoryAndBrand();

      await productService.create({
        name: 'MacBook Air',
        categoryId: category.id,
        brandId: brand.id,
      });

      await expect(brandService.delete(brand.id)).rejects.toThrow(ConflictError);
    });

    it('prevents hard deletion of a category that has referenced products', async () => {
      const { category } = await createCategoryAndBrand();

      await productService.create({
        name: 'MacBook Pro',
        categoryId: category.id,
      });

      await expect(categoryService.delete(category.id)).rejects.toThrow(ConflictError);
    });
  });

  describe('Image Service & Primary Invariant', () => {
    it('maintains exactly one primary image when adding and deleting images', async () => {
      const { category } = await createCategoryAndBrand();
      const product = await productService.create({
        name: 'Smart Watch',
        categoryId: category.id,
      });

      // First image becomes primary automatically
      const img1 = await imageService.add(product.id, {
        url: 'https://res.cloudinary.com/demo/image/upload/v1/watch1.jpg',
        publicId: 'watch1',
      });
      expect(img1.isPrimary).toBe(true);

      // Second image marked primary demotes first
      const img2 = await imageService.add(product.id, {
        url: 'https://res.cloudinary.com/demo/image/upload/v1/watch2.jpg',
        publicId: 'watch2',
        isPrimary: true,
      });
      expect(img2.isPrimary).toBe(true);

      const reloadedImg1 = await prisma.productImage.findUnique({ where: { id: img1.id } });
      expect(reloadedImg1!.isPrimary).toBe(false);

      // Deleting primary image promotes the next available image
      await imageService.delete(product.id, img2.id);

      const reloadedImg1AfterDelete = await prisma.productImage.findUnique({
        where: { id: img1.id },
      });
      expect(reloadedImg1AfterDelete!.isPrimary).toBe(true);
    });
  });

  describe('Publication Validation Gate (7 Rules)', () => {
    it('enforces all 7 publication criteria before publishing a product', async () => {
      const { category, brand } = await createCategoryAndBrand();

      // Product in DRAFT with no variants and no images
      const product = await productService.create({
        name: 'Test Device',
        categoryId: category.id,
        brandId: brand.id,
      });

      // 1. Initial check: fails because no variants and no images
      let check = await productService.validatePublication(product.id);
      expect(check.canPublish).toBe(false);
      expect(check.errors).toEqual(
        expect.arrayContaining([
          'Product must have at least one active variant',
          'Product must have at least one image',
        ]),
      );

      // Attempting to publish must throw BadRequestError
      await expect(productService.publish(product.id)).rejects.toThrow(BadRequestError);

      // 2. Add an active default variant with positive price
      await variantService.create(product.id, {
        sku: 'TD-001',
        name: 'Standard Edition',
        price: 500000,
        isDefault: true,
        isActive: true,
      });

      // Still fails because no images
      check = await productService.validatePublication(product.id);
      expect(check.canPublish).toBe(false);
      expect(check.errors).toContain('Product must have at least one image');

      // 3. Add an image as primary
      await imageService.add(product.id, {
        url: 'https://res.cloudinary.com/demo/image/upload/v1/td.jpg',
        isPrimary: true,
      });

      // Now all 7 criteria are met!
      check = await productService.validatePublication(product.id);
      expect(check.canPublish).toBe(true);
      expect(check.errors).toHaveLength(0);

      // Publish succeeds
      const published = await productService.publish(product.id);
      expect(published.status).toBe('PUBLISHED');
      expect(published.publishedAt).toBeInstanceOf(Date);
    });

    it('fails publication if assigned category is deactivated', async () => {
      const { category } = await createCategoryAndBrand();
      const product = await productService.create({
        name: 'Router',
        categoryId: category.id,
        initialVariant: {
          sku: 'ROUTER-WIFI6',
          price: 850000,
        },
      });

      await imageService.add(product.id, {
        url: 'https://res.cloudinary.com/demo/image/upload/v1/router.jpg',
        isPrimary: true,
      });

      // Deactivate category
      await categoryService.update(category.id, { isActive: false });

      const check = await productService.validatePublication(product.id);
      expect(check.canPublish).toBe(false);
      expect(check.errors).toContain('Assigned category must be active');
    });

    it('fails publication if assigned brand is deactivated', async () => {
      const { category, brand } = await createCategoryAndBrand();
      const product = await productService.create({
        name: 'Smartphone 2',
        categoryId: category.id,
        brandId: brand.id,
        initialVariant: {
          sku: 'SP-002',
          price: 990000,
        },
      });

      await imageService.add(product.id, {
        url: 'https://res.cloudinary.com/demo/image/upload/v1/sp2.jpg',
        isPrimary: true,
      });

      // Deactivate brand
      await brandService.update(brand.id, { isActive: false });

      const check = await productService.validatePublication(product.id);
      expect(check.canPublish).toBe(false);
      expect(check.errors).toContain('Assigned brand must be active');
    });
  });

  describe('Concurrent Invariant Protection', () => {
    it('serializes concurrent variant default promotions so that exactly one active default variant remains', async () => {
      const { category } = await createCategoryAndBrand();
      const product = await productService.create({
        name: 'Concurrent Variant Test',
        categoryId: category.id,
        initialVariant: {
          sku: 'CV-INIT',
          price: 100000,
        },
      });

      // Create 4 additional active variants (total 5)
      const variantIds = [product.variants[0].id];
      for (let i = 1; i <= 4; i++) {
        const v = await variantService.create(product.id, {
          sku: `CV-VAR-${i}`,
          name: `Variant ${i}`,
          price: 100000 + i * 1000,
          isActive: true,
          isDefault: false,
        });
        variantIds.push(v.id);
      }

      // Concurrently promote all 5 variants
      const results = await Promise.allSettled(
        variantIds.map((id) => variantService.update(id, { isDefault: true })),
      );

      // Verify all resolved successfully without deadlock or unhandled conflicts
      for (const res of results) {
        expect(res.status).toBe('fulfilled');
      }

      // Strictly verify database state: exactly one variant is default
      const defaults = await prisma.productVariant.findMany({
        where: { productId: product.id, isDefault: true },
      });
      expect(defaults).toHaveLength(1);
      expect(defaults[0].isActive).toBe(true);
    });

    it('serializes concurrent primary image designations so that exactly one primary image remains', async () => {
      const { category } = await createCategoryAndBrand();
      const product = await productService.create({
        name: 'Concurrent Image Test',
        categoryId: category.id,
      });

      // Create 5 images
      const imageIds: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const img = await imageService.add(product.id, {
          url: `https://res.cloudinary.com/demo/image/upload/v1/img${i}.jpg`,
          isPrimary: i === 1,
        });
        imageIds.push(img.id);
      }

      // Concurrently set each of the 5 images as primary
      const results = await Promise.allSettled(
        imageIds.map((id) => imageService.setPrimary(product.id, id)),
      );

      for (const res of results) {
        expect(res.status).toBe('fulfilled');
      }

      // Strictly verify database state: exactly one image is primary
      const primaries = await prisma.productImage.findMany({
        where: { productId: product.id, isPrimary: true },
      });
      expect(primaries).toHaveLength(1);
    });

    it('serializes concurrent image additions marked as primary so that exactly one primary image remains', async () => {
      const { category } = await createCategoryAndBrand();
      const product = await productService.create({
        name: 'Concurrent Add Image Test',
        categoryId: category.id,
      });

      // Concurrently add 4 images all requesting isPrimary: true
      const results = await Promise.allSettled(
        [1, 2, 3, 4].map((i) =>
          imageService.add(product.id, {
            url: `https://res.cloudinary.com/demo/image/upload/v1/concurrent${i}.jpg`,
            isPrimary: true,
          }),
        ),
      );

      for (const res of results) {
        expect(res.status).toBe('fulfilled');
      }

      const primaries = await prisma.productImage.findMany({
        where: { productId: product.id, isPrimary: true },
      });
      expect(primaries).toHaveLength(1);
    });
  });

  describe('Post-Commit Cloudinary Resilience', () => {
    it('deletes product and records successfully even if Cloudinary asset deletion throws post-commit', async () => {
      const { category } = await createCategoryAndBrand();
      const product = await productService.create({
        name: 'Cloudinary Delete Failure Test',
        categoryId: category.id,
        initialVariant: {
          sku: 'CLD-FAIL-01',
          price: 50000,
        },
      });

      await imageService.add(product.id, {
        url: 'https://res.cloudinary.com/demo/image/upload/v1/cld1.jpg',
        publicId: 'test_cld_123',
        isPrimary: true,
      });

      // Mock Cloudinary deleteAsset to throw
      const deleteSpy = vi
        .spyOn(cloudinaryService, 'deleteAsset')
        .mockRejectedValueOnce(new Error('Cloudinary API Network Outage'));

      const result = await productService.delete(product.id);
      expect(result.success).toBe(true);

      // Verify product was committed as deleted in the database
      const found = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(found).toBeNull();

      expect(deleteSpy).toHaveBeenCalledWith('test_cld_123');
      deleteSpy.mockRestore();
    });

    it('deletes single image successfully even if Cloudinary asset deletion throws post-commit', async () => {
      const { category } = await createCategoryAndBrand();
      const product = await productService.create({
        name: 'Cloudinary Image Delete Test',
        categoryId: category.id,
      });

      const img = await imageService.add(product.id, {
        url: 'https://res.cloudinary.com/demo/image/upload/v1/cld2.jpg',
        publicId: 'test_cld_img_456',
        isPrimary: true,
      });

      const deleteSpy = vi
        .spyOn(cloudinaryService, 'deleteAsset')
        .mockRejectedValueOnce(new Error('Cloudinary Service Unavailable'));

      const result = await imageService.delete(product.id, img.id);
      expect(result.success).toBe(true);

      const found = await prisma.productImage.findUnique({
        where: { id: img.id },
      });
      expect(found).toBeNull();

      expect(deleteSpy).toHaveBeenCalledWith('test_cld_img_456');
      deleteSpy.mockRestore();
    });
  });
});
