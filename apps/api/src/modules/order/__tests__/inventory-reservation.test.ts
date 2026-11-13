import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool } from '../../../test/setup.js';
import { inventoryReservationService } from '../inventory-reservation.service.js';
import { generateOrderNumber } from '../order.utils.js';

describe('InventoryReservationService', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPool.end();
  });

  async function createTestFixture(initialStock = 10, initialReserved = 0) {
    const timestamp = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const user = await prisma.user.create({
      data: {
        email: `cust-${timestamp}@example.com`,
        passwordHash: 'dummyhash',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    const category = await prisma.category.create({
      data: {
        name: `Cat ${timestamp}`,
        slug: `cat-${timestamp}`,
        isActive: true,
      },
    });

    const product = await prisma.product.create({
      data: {
        name: `Product ${timestamp}`,
        slug: `prod-${timestamp}`,
        categoryId: category.id,
        status: 'PUBLISHED',
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `SKU-${timestamp}`,
        name: 'Default',
        price: 50000,
        isActive: true,
      },
    });

    const inventoryItem = await prisma.inventoryItem.create({
      data: {
        variantId: variant.id,
        quantity: initialStock,
        reservedQuantity: initialReserved,
      },
    });

    return { user, category, product, variant, inventoryItem };
  }

  describe('reserveStock', () => {
    it('successfully increments reservedQuantity without modifying physical quantity', async () => {
      const { variant } = await createTestFixture(10, 0);

      await prisma.$transaction(async (tx) => {
        await inventoryReservationService.reserveStock(tx, [
          { variantId: variant.id, quantity: 3 },
        ]);
      });

      const updated = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });

      expect(updated.quantity).toBe(10);
      expect(updated.reservedQuantity).toBe(3);
    });

    it('rejects reservation if available stock is insufficient', async () => {
      const { variant } = await createTestFixture(10, 8); // Only 2 available

      await expect(
        prisma.$transaction(async (tx) => {
          await inventoryReservationService.reserveStock(tx, [
            { variantId: variant.id, quantity: 3 },
          ]);
        }),
      ).rejects.toThrow('Insufficient available stock');

      const unchanged = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(unchanged.quantity).toBe(10);
      expect(unchanged.reservedQuantity).toBe(8);
    });
  });

  describe('commitPhysicalStockImmediate (COD)', () => {
    it('decrements physical quantity and creates ORDER_FULFILLMENT audit record', async () => {
      const { user, variant } = await createTestFixture(10, 0);
      const orderNumber = generateOrderNumber();

      await prisma.$transaction(async (tx) => {
        await inventoryReservationService.commitPhysicalStockImmediate(tx, {
          items: [{ variantId: variant.id, quantity: 4 }],
          orderId: 'dummy-order-id',
          userId: user.id,
          orderNumber,
        });
      });

      const updated = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(updated.quantity).toBe(6);
      expect(updated.reservedQuantity).toBe(0);

      const adjustments = await prisma.inventoryAdjustment.findMany({
        where: { inventoryItemId: updated.id },
      });
      expect(adjustments).toHaveLength(1);
      expect(adjustments[0].type).toBe('ORDER_FULFILLMENT');
      expect(adjustments[0].quantityDelta).toBe(-4);
      expect(adjustments[0].oldQuantity).toBe(10);
      expect(adjustments[0].newQuantity).toBe(6);
      expect(adjustments[0].adjustedByUserId).toBe(user.id);
      expect(adjustments[0].reason).toContain(orderNumber);
    });
  });

  describe('commitReservedStock (Online Payment Success)', () => {
    it('decrements physical quantity and releases reservedQuantity with audit', async () => {
      const { user, variant } = await createTestFixture(10, 3);
      const orderNumber = generateOrderNumber();

      await prisma.$transaction(async (tx) => {
        await inventoryReservationService.commitReservedStock(tx, {
          items: [{ variantId: variant.id, quantity: 3 }],
          orderId: 'dummy-order-id',
          userId: user.id,
          orderNumber,
        });
      });

      const updated = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(updated.quantity).toBe(7);
      expect(updated.reservedQuantity).toBe(0);

      const adjustments = await prisma.inventoryAdjustment.findMany({
        where: { inventoryItemId: updated.id },
      });
      expect(adjustments).toHaveLength(1);
      expect(adjustments[0].type).toBe('ORDER_FULFILLMENT');
      expect(adjustments[0].quantityDelta).toBe(-3);
      expect(adjustments[0].oldQuantity).toBe(10);
      expect(adjustments[0].newQuantity).toBe(7);
    });
  });

  describe('releaseReservedStock', () => {
    it('releases reservedQuantity without touching physical stock', async () => {
      const { variant } = await createTestFixture(10, 4);

      await prisma.$transaction(async (tx) => {
        await inventoryReservationService.releaseReservedStock(tx, [
          { variantId: variant.id, quantity: 4 },
        ]);
      });

      const updated = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(updated.quantity).toBe(10);
      expect(updated.reservedQuantity).toBe(0);

      const adjustments = await prisma.inventoryAdjustment.findMany({
        where: { inventoryItemId: updated.id },
      });
      expect(adjustments).toHaveLength(0); // No adjustment record for reserved release
    });
  });

  describe('restorePhysicalStock (Cancellation)', () => {
    it('restores physical quantity with ORDER_CANCELLATION audit log', async () => {
      const { user, variant } = await createTestFixture(6, 0);
      const orderNumber = generateOrderNumber();

      await prisma.$transaction(async (tx) => {
        await inventoryReservationService.restorePhysicalStock(tx, {
          items: [{ variantId: variant.id, quantity: 4 }],
          orderId: 'dummy-order-id',
          userId: user.id,
          orderNumber,
          reason: 'Customer requested cancellation',
          adjustedByUserId: user.id,
        });
      });

      const updated = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(updated.quantity).toBe(10);
      expect(updated.reservedQuantity).toBe(0);

      const adjustments = await prisma.inventoryAdjustment.findMany({
        where: { inventoryItemId: updated.id },
      });
      expect(adjustments).toHaveLength(1);
      expect(adjustments[0].type).toBe('ORDER_CANCELLATION');
      expect(adjustments[0].quantityDelta).toBe(4);
      expect(adjustments[0].oldQuantity).toBe(6);
      expect(adjustments[0].newQuantity).toBe(10);
      expect(adjustments[0].reason).toBe('Customer requested cancellation');
      expect(adjustments[0].adjustedByUserId).toBe(user.id);
    });
  });

  describe('cleanupExpiredReservations', () => {
    it('cancels expired online orders, releases reserved stock, and leaves active orders intact', async () => {
      const { user, product, variant } = await createTestFixture(10, 2);

      const pastDate = new Date(Date.now() - 5 * 60 * 1000); // 5 mins ago
      const futureDate = new Date(Date.now() + 25 * 60 * 1000); // in 25 mins

      // Expired online order
      const expiredOrder = await prisma.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          userId: user.id,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          paymentMethod: 'SSLCOMMERZ',
          merchandiseSubtotal: 50000,
          discountAmount: 0,
          shippingFee: 6000,
          totalPayable: 56000,
          shippingRecipientName: 'Tanvir',
          shippingPhone: '+8801700000000',
          shippingDivisionId: 'DHAKA',
          shippingDistrictId: 'DHAKA',
          shippingUpazila: 'Dhanmondi',
          shippingStreetAddress: 'Road 27',
          paymentExpiresAt: pastDate,
          items: {
            create: {
              productId: product.id,
              variantId: variant.id,
              productName: product.name,
              variantTitle: variant.name,
              sku: variant.sku,
              unitPrice: variant.price,
              quantity: 2,
              lineTotal: 2 * variant.price,
            },
          },
          payments: {
            create: {
              transactionId: `TXN-EXP-${Date.now()}`,
              method: 'SSLCOMMERZ',
              status: 'PENDING',
              amount: 56000,
            },
          },
        },
      });

      // Active online order
      const activeOrder = await prisma.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          userId: user.id,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          paymentMethod: 'SSLCOMMERZ',
          merchandiseSubtotal: 50000,
          discountAmount: 0,
          shippingFee: 6000,
          totalPayable: 56000,
          shippingRecipientName: 'Tanvir',
          shippingPhone: '+8801700000000',
          shippingDivisionId: 'DHAKA',
          shippingDistrictId: 'DHAKA',
          shippingUpazila: 'Dhanmondi',
          shippingStreetAddress: 'Road 27',
          paymentExpiresAt: futureDate,
        },
      });

      const cleaned = await prisma.$transaction(async (tx) => {
        return await inventoryReservationService.cleanupExpiredReservations(tx);
      });

      expect(cleaned).toBe(1);

      // Verify expired order updated
      const reloadedExpired = await prisma.order.findUniqueOrThrow({
        where: { id: expiredOrder.id },
        include: { payments: true, statusHistory: true },
      });
      expect(reloadedExpired.status).toBe('CANCELLED');
      expect(reloadedExpired.paymentStatus).toBe('CANCELLED');
      expect(reloadedExpired.payments[0].status).toBe('CANCELLED');
      expect(reloadedExpired.statusHistory).toHaveLength(1);
      expect(reloadedExpired.statusHistory[0].toStatus).toBe('CANCELLED');

      // Verify reserved stock released
      const updatedInv = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(updatedInv.reservedQuantity).toBe(0);

      // Verify active order unchanged
      const reloadedActive = await prisma.order.findUniqueOrThrow({
        where: { id: activeOrder.id },
      });
      expect(reloadedActive.status).toBe('PENDING');
    });
  });
});
