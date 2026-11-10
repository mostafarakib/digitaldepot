import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool } from '../../../test/setup.js';
import { inventoryService } from '../inventory.service.js';
import { productService } from '../product.service.js';
import { variantService } from '../variant.service.js';
import { categoryService } from '../category.service.js';
import { brandService } from '../brand.service.js';
import { BadRequestError, ConflictError } from '../../../lib/errors.js';

describe('Inventory Service Tests (Phase 4C)', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPool.end();
  });

  async function setupTestProduct(initialStock = 0) {
    const category = await categoryService.create({
      name: 'Laptops',
      slug: 'laptops',
    });

    const brand = await brandService.create({
      name: 'Apple',
      slug: 'apple',
    });

    const product = await productService.create({
      name: 'MacBook Pro 16',
      categoryId: category.id,
      brandId: brand.id,
      initialVariant: {
        sku: 'MBP16-M3-36GB',
        price: 34999900,
        initialStock,
      },
    });

    const variant = product.variants[0];
    return { category, brand, product, variant };
  }

  describe('Inventory Provisioning & Initial Stock Auditing (Requirement 1)', () => {
    it('automatically provisions an InventoryItem with 0 stock and no adjustments when initialStock is 0', async () => {
      const { variant } = await setupTestProduct(0);

      const item = await inventoryService.getByVariantId(variant.id);
      expect(item).toBeDefined();
      expect(item.quantity).toBe(0);
      expect(item.reservedQuantity).toBe(0);
      expect(item.available).toBe(0);
      expect(item.isOutOfStock).toBe(true);
      expect(item.lowStockThreshold).toBe(5);

      const history = await inventoryService.getVariantHistory(variant.id, {});
      expect(history.adjustments).toHaveLength(0);
    });

    it('creates an initial InventoryAdjustment audit record when variant is created with non-zero initialStock', async () => {
      const { variant } = await setupTestProduct(25);

      const item = await inventoryService.getByVariantId(variant.id);
      expect(item.quantity).toBe(25);
      expect(item.available).toBe(25);
      expect(item.isOutOfStock).toBe(false);
      expect(item.isLowStock).toBe(false);

      const history = await inventoryService.getVariantHistory(variant.id, {});
      expect(history.adjustments).toHaveLength(1);
      const adj = history.adjustments[0];
      expect(adj.type).toBe('RECEIVE');
      expect(adj.quantityDelta).toBe(25);
      expect(adj.oldQuantity).toBe(0);
      expect(adj.newQuantity).toBe(25);
      expect(adj.reason).toBe('Initial stock on variant creation');
    });

    it('creates an initial audit record when variant is created via variantService with non-zero initialStock', async () => {
      const { product } = await setupTestProduct(0);

      const newVariant = await variantService.create(product.id, {
        sku: 'MBP16-M3-48GB',
        name: 'Space Black / 48GB',
        price: 39999900,
        initialStock: 15,
        lowStockThreshold: 3,
      });

      const item = await inventoryService.getByVariantId(newVariant.id);
      expect(item.quantity).toBe(15);
      expect(item.lowStockThreshold).toBe(3);

      const history = await inventoryService.getVariantHistory(newVariant.id, {});
      expect(history.adjustments).toHaveLength(1);
      expect(history.adjustments[0].quantityDelta).toBe(15);
    });
  });

  describe('Atomic Stock Adjustments & Validation Rules (Requirement 2 & 3)', () => {
    it('executes a positive RECEIVE adjustment and creates immutable audit record', async () => {
      const { variant } = await setupTestProduct(10);

      const result = await inventoryService.adjust({
        variantId: variant.id,
        type: 'RECEIVE',
        quantityDelta: 20,
        reason: 'Shipment PO-9002 received',
      });

      expect(result.item.quantity).toBe(30);
      expect(result.item.available).toBe(30);
      expect(result.adjustment.oldQuantity).toBe(10);
      expect(result.adjustment.newQuantity).toBe(30);
      expect(result.adjustment.quantityDelta).toBe(20);
      expect(result.adjustment.type).toBe('RECEIVE');
      expect(result.adjustment.reason).toBe('Shipment PO-9002 received');
    });

    it('executes a negative DAMAGE adjustment and updates stock', async () => {
      const { variant } = await setupTestProduct(10);

      const result = await inventoryService.adjust({
        variantId: variant.id,
        type: 'DAMAGE',
        quantityDelta: -3,
        reason: 'Damaged in transit inspection',
      });

      expect(result.item.quantity).toBe(7);
      expect(result.adjustment.oldQuantity).toBe(10);
      expect(result.adjustment.newQuantity).toBe(7);
      expect(result.adjustment.quantityDelta).toBe(-3);
      expect(result.adjustment.type).toBe('DAMAGE');
    });

    it('executes THEFT_LOSS adjustment', async () => {
      const { variant } = await setupTestProduct(10);

      const result = await inventoryService.adjust({
        variantId: variant.id,
        type: 'THEFT_LOSS',
        quantityDelta: -2,
        reason: 'Missing from shelf during count',
      });

      expect(result.item.quantity).toBe(8);
      expect(result.adjustment.type).toBe('THEFT_LOSS');
    });

    it('executes RETURN_RESTOCK adjustment', async () => {
      const { variant } = await setupTestProduct(10);

      const result = await inventoryService.adjust({
        variantId: variant.id,
        type: 'RETURN_RESTOCK',
        quantityDelta: 2,
        reason: 'Customer return inspected and restocked',
      });

      expect(result.item.quantity).toBe(12);
      expect(result.adjustment.type).toBe('RETURN_RESTOCK');
    });

    it('executes CORRECTION adjustment with both positive and negative deltas', async () => {
      const { variant } = await setupTestProduct(10);

      // Positive correction
      const res1 = await inventoryService.adjust({
        variantId: variant.id,
        type: 'CORRECTION',
        quantityDelta: 5,
        reason: 'Physical count found 5 extra units',
      });
      expect(res1.item.quantity).toBe(15);

      // Negative correction
      const res2 = await inventoryService.adjust({
        variantId: variant.id,
        type: 'CORRECTION',
        quantityDelta: -4,
        reason: 'Physical count recount discrepancy',
      });
      expect(res2.item.quantity).toBe(11);
    });

    it('strictly prevents negative stock and rolls back transaction with INSUFFICIENT_STOCK', async () => {
      const { variant } = await setupTestProduct(5);

      await expect(
        inventoryService.adjust({
          variantId: variant.id,
          type: 'DAMAGE',
          quantityDelta: -10, // Requesting 10 when only 5 exist
          reason: 'Excessive breakage',
        }),
      ).rejects.toThrow(BadRequestError);

      // Confirm stock in database remains exactly 5
      const item = await inventoryService.getByVariantId(variant.id);
      expect(item.quantity).toBe(5);
    });

    it('enforces PostgreSQL check constraint if negative stock is forced', async () => {
      const { variant } = await setupTestProduct(0);

      // Direct SQL attempt to set negative quantity must fail via check constraint
      await expect(
        prisma.$executeRaw`UPDATE "InventoryItem" SET quantity = -5 WHERE "variantId" = ${variant.id}`,
      ).rejects.toThrow();
    });
  });

  describe('Concurrent Invariant Protection & Serialization', () => {
    it('serializes concurrent stock adjustments without lost updates', async () => {
      const { variant } = await setupTestProduct(100);

      // Fire 10 concurrent adjustments simultaneously (+10, -5, +20, -10, etc.)
      const deltas = [10, -5, 20, -15, 30, -10, 5, -2, 8, -6];
      const expectedTotal = 100 + deltas.reduce((acc, d) => acc + d, 0); // 135

      const results = await Promise.allSettled(
        deltas.map((delta, i) =>
          inventoryService.adjust({
            variantId: variant.id,
            type: delta > 0 ? 'RECEIVE' : 'DAMAGE',
            quantityDelta: delta,
            reason: `Concurrent adjustment #${i + 1}`,
          }),
        ),
      );

      // All 10 requests should fulfill successfully
      for (const res of results) {
        expect(res.status).toBe('fulfilled');
      }

      // Check final database state: exactly equals expected total
      const finalItem = await inventoryService.getByVariantId(variant.id);
      expect(finalItem.quantity).toBe(expectedTotal);

      // Check that all 10 adjustments plus the 1 initial creation adjustment exist in audit history
      const history = await inventoryService.getVariantHistory(variant.id, { limit: 50 });
      expect(history.adjustments).toHaveLength(11);
    });

    it('safely handles concurrent boundary race conditions without negative stock', async () => {
      const { variant } = await setupTestProduct(20);

      // 5 concurrent requests all trying to deduct 10 units (total 50 units requested, only 20 available)
      const results = await Promise.allSettled(
        [1, 2, 3, 4, 5].map((idx) =>
          inventoryService.adjust({
            variantId: variant.id,
            type: 'DAMAGE',
            quantityDelta: -10,
            reason: `Concurrent boundary test #${idx}`,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly 2 must succeed (20 - 10 - 10 = 0)
      expect(fulfilled).toHaveLength(2);
      // Exactly 3 must be rejected due to insufficient stock
      expect(rejected).toHaveLength(3);

      const finalItem = await inventoryService.getByVariantId(variant.id);
      expect(finalItem.quantity).toBe(0);
      expect(finalItem.isOutOfStock).toBe(true);
    });
  });

  describe('Inventory Queries, Filtering & Thresholds', () => {
    it('returns overview listing with search, category filter, and calculated metrics', async () => {
      const { category, variant } = await setupTestProduct(3); // low stock (3 <= 5)

      const overview = await inventoryService.list({
        search: 'MBP16',
        categoryId: category.id,
        stockStatus: 'all',
        page: 1,
        limit: 10,
        sortBy: 'updated_at_desc',
      });

      expect(overview.items).toHaveLength(1);
      expect(overview.items[0].variantId).toBe(variant.id);
      expect(overview.items[0].isLowStock).toBe(true);
      expect(overview.items[0].isOutOfStock).toBe(false);
      expect(overview.summary.totalTrackedVariants).toBeGreaterThanOrEqual(1);
      expect(overview.summary.lowStockCount).toBeGreaterThanOrEqual(1);
    });

    it('updates low-stock threshold and recalculates isLowStock', async () => {
      const { variant } = await setupTestProduct(8);

      let item = await inventoryService.getByVariantId(variant.id);
      expect(item.isLowStock).toBe(false); // 8 > default 5

      // Increase threshold to 10
      await inventoryService.updateThreshold(variant.id, { lowStockThreshold: 10 });

      item = await inventoryService.getByVariantId(variant.id);
      expect(item.lowStockThreshold).toBe(10);
      expect(item.isLowStock).toBe(true); // 8 <= 10
    });

    it('retrieves global history across all inventory adjustments', async () => {
      const { variant } = await setupTestProduct(10);

      await inventoryService.adjust({
        variantId: variant.id,
        type: 'RECEIVE',
        quantityDelta: 5,
        reason: 'Restocking batch',
      });

      const global = await inventoryService.getGlobalHistory({ limit: 10 });
      expect(global.adjustments.length).toBeGreaterThanOrEqual(2);
      expect(global.adjustments[0].type).toBe('RECEIVE');
      expect(global.adjustments[0].inventoryItem).toBeDefined();
    });
  });

  describe('Variant & Product Deletion Safeguards with Inventory History', () => {
    it('restricts deleting a variant with exactly 1 inventory adjustment from initialStock', async () => {
      const { product } = await setupTestProduct(0);

      // Create a second variant with initialStock: 10 (creates exactly 1 initial adjustment)
      const variant2 = await variantService.create(product.id, {
        sku: 'MBP16-EXACTLY-ONE-INIT',
        name: 'Second Variant with Stock',
        price: 29999900,
        initialStock: 10,
      });

      const history = await inventoryService.getVariantHistory(variant2.id, {});
      expect(history.adjustments).toHaveLength(1);

      // Attempting to delete variant2 must throw ConflictError
      await expect(variantService.delete(variant2.id)).rejects.toThrow(ConflictError);
      await expect(variantService.delete(variant2.id)).rejects.toMatchObject({
        code: 'VARIANT_HAS_INVENTORY_HISTORY',
      });
    });

    it('restricts deleting a variant with exactly 1 post-creation inventory adjustment', async () => {
      const { product } = await setupTestProduct(0);

      // Create a second variant with initialStock: 0 (0 adjustments)
      const variant2 = await variantService.create(product.id, {
        sku: 'MBP16-EXACTLY-ONE-POST',
        name: 'Second Variant Zero Stock',
        price: 29999900,
        initialStock: 0,
      });

      let history = await inventoryService.getVariantHistory(variant2.id, {});
      expect(history.adjustments).toHaveLength(0);

      // Add a single adjustment
      await inventoryService.adjust({
        variantId: variant2.id,
        type: 'RECEIVE',
        quantityDelta: 5,
        reason: 'Single received batch',
      });

      history = await inventoryService.getVariantHistory(variant2.id, {});
      expect(history.adjustments).toHaveLength(1);

      // Attempting to delete variant2 must throw ConflictError
      await expect(variantService.delete(variant2.id)).rejects.toThrow(ConflictError);
      await expect(variantService.delete(variant2.id)).rejects.toMatchObject({
        code: 'VARIANT_HAS_INVENTORY_HISTORY',
      });
    });

    it('allows deleting a variant with 0 inventory adjustments', async () => {
      const { product } = await setupTestProduct(0);

      // Create a second variant with initialStock: 0 (0 adjustments)
      const variant2 = await variantService.create(product.id, {
        sku: 'MBP16-ZERO-ADJ',
        name: 'Second Variant Clean',
        price: 29999900,
        initialStock: 0,
      });

      const history = await inventoryService.getVariantHistory(variant2.id, {});
      expect(history.adjustments).toHaveLength(0);

      // Deleting variant2 should succeed
      const result = await variantService.delete(variant2.id);
      expect(result.success).toBe(true);

      const found = await prisma.productVariant.findUnique({
        where: { id: variant2.id },
      });
      expect(found).toBeNull();
    });

    it('restricts deleting a product when a variant has even 1 inventory adjustment', async () => {
      const { product } = await setupTestProduct(10); // initialStock: 10 creates 1 adjustment

      // Attempting to delete product must throw ConflictError
      await expect(productService.delete(product.id)).rejects.toThrow(ConflictError);
      await expect(productService.delete(product.id)).rejects.toMatchObject({
        code: 'PRODUCT_HAS_INVENTORY_HISTORY',
      });
    });

    it('allows deleting a product when all variants have 0 inventory adjustments and no extra price history', async () => {
      const { product } = await setupTestProduct(0); // initialStock: 0 -> 0 adjustments

      const result = await productService.delete(product.id);
      expect(result.success).toBe(true);

      const found = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(found).toBeNull();
    });
  });
});
