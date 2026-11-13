import type { Prisma } from '../../generated/client/client.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import type { OrderStockItem } from './order.types.js';
import { orderCouponService } from './order-coupon.service.js';

export class InventoryReservationService {
  /**
   * Sorts stock items by variantId ascending to guarantee deterministic row lock acquisition
   * order across all concurrent transactions, preventing database deadlocks.
   */
  private sortItems(items: OrderStockItem[]): OrderStockItem[] {
    return [...items].sort((a, b) => a.variantId.localeCompare(b.variantId));
  }

  /**
   * Reserves inventory for an online order (e.g. SSLCommerz).
   * Increments reservedQuantity without decrementing physical quantity.
   */
  async reserveStock(tx: Prisma.TransactionClient, items: OrderStockItem[]): Promise<void> {
    const sorted = this.sortItems(items);

    for (const item of sorted) {
      await tx.$executeRaw`SELECT id FROM "InventoryItem" WHERE "variantId" = ${item.variantId} FOR UPDATE`;

      const inventory = await tx.inventoryItem.findUnique({
        where: { variantId: item.variantId },
      });

      if (!inventory) {
        throw new NotFoundError(
          'INVENTORY_ITEM_NOT_FOUND',
          `Inventory record not found for variant ${item.variantId}`,
        );
      }

      const available = inventory.quantity - inventory.reservedQuantity;
      if (available < item.quantity) {
        throw new BadRequestError(
          'INSUFFICIENT_STOCK',
          `Insufficient available stock for variant ${item.variantId}. Available: ${available}, requested: ${item.quantity}`,
        );
      }

      await tx.inventoryItem.update({
        where: { id: inventory.id },
        data: {
          reservedQuantity: { increment: item.quantity },
        },
      });
    }
  }

  /**
   * Immediately commits physical stock for Cash on Delivery (COD) orders.
   * Decrements physical quantity and creates an ORDER_FULFILLMENT InventoryAdjustment audit log.
   */
  async commitPhysicalStockImmediate(
    tx: Prisma.TransactionClient,
    params: {
      items: OrderStockItem[];
      orderId: string;
      userId: string;
      orderNumber: string;
      adjustedByUserId?: string;
    },
  ): Promise<void> {
    const sorted = this.sortItems(params.items);

    for (const item of sorted) {
      await tx.$executeRaw`SELECT id FROM "InventoryItem" WHERE "variantId" = ${item.variantId} FOR UPDATE`;

      const inventory = await tx.inventoryItem.findUnique({
        where: { variantId: item.variantId },
      });

      if (!inventory) {
        throw new NotFoundError(
          'INVENTORY_ITEM_NOT_FOUND',
          `Inventory record not found for variant ${item.variantId}`,
        );
      }

      const available = inventory.quantity - inventory.reservedQuantity;
      if (available < item.quantity) {
        throw new BadRequestError(
          'INSUFFICIENT_STOCK',
          `Insufficient available stock for variant ${item.variantId}. Available: ${available}, requested: ${item.quantity}`,
        );
      }

      const newQuantity = inventory.quantity - item.quantity;

      await tx.inventoryItem.update({
        where: { id: inventory.id },
        data: { quantity: newQuantity },
      });

      await tx.inventoryAdjustment.create({
        data: {
          inventoryItemId: inventory.id,
          type: 'ORDER_FULFILLMENT',
          quantityDelta: -item.quantity,
          oldQuantity: inventory.quantity,
          newQuantity,
          reason: `Order ${params.orderNumber} fulfillment (Cash on Delivery)`,
          adjustedByUserId: params.adjustedByUserId ?? params.userId,
        },
      });
    }
  }

  /**
   * Commits previously reserved stock upon successful online payment.
   * Decrements physical quantity and releases reservedQuantity, logging ORDER_FULFILLMENT.
   */
  async commitReservedStock(
    tx: Prisma.TransactionClient,
    params: {
      items: OrderStockItem[];
      orderId: string;
      userId: string;
      orderNumber: string;
      adjustedByUserId?: string;
    },
  ): Promise<void> {
    const sorted = this.sortItems(params.items);

    for (const item of sorted) {
      await tx.$executeRaw`SELECT id FROM "InventoryItem" WHERE "variantId" = ${item.variantId} FOR UPDATE`;

      const inventory = await tx.inventoryItem.findUnique({
        where: { variantId: item.variantId },
      });

      if (!inventory) {
        throw new NotFoundError(
          'INVENTORY_ITEM_NOT_FOUND',
          `Inventory record not found for variant ${item.variantId}`,
        );
      }

      const newQuantity = inventory.quantity - item.quantity;
      const newReserved = Math.max(0, inventory.reservedQuantity - item.quantity);

      await tx.inventoryItem.update({
        where: { id: inventory.id },
        data: {
          quantity: newQuantity,
          reservedQuantity: newReserved,
        },
      });

      await tx.inventoryAdjustment.create({
        data: {
          inventoryItemId: inventory.id,
          type: 'ORDER_FULFILLMENT',
          quantityDelta: -item.quantity,
          oldQuantity: inventory.quantity,
          newQuantity,
          reason: `Order ${params.orderNumber} fulfillment (Online payment confirmed)`,
          adjustedByUserId: params.adjustedByUserId ?? params.userId,
        },
      });
    }
  }

  /**
   * Releases stock reservation without altering physical stock quantity.
   * Used for expired reservations or failed payment initiations.
   */
  async releaseReservedStock(tx: Prisma.TransactionClient, items: OrderStockItem[]): Promise<void> {
    const sorted = this.sortItems(items);

    for (const item of sorted) {
      await tx.$executeRaw`SELECT id FROM "InventoryItem" WHERE "variantId" = ${item.variantId} FOR UPDATE`;

      const inventory = await tx.inventoryItem.findUnique({
        where: { variantId: item.variantId },
      });

      if (!inventory) {
        continue;
      }

      const newReserved = Math.max(0, inventory.reservedQuantity - item.quantity);

      await tx.inventoryItem.update({
        where: { id: inventory.id },
        data: {
          reservedQuantity: newReserved,
        },
      });
    }
  }

  /**
   * Restores physical stock when an order whose stock was already deducted is cancelled.
   * Increments physical quantity and creates an ORDER_CANCELLATION InventoryAdjustment audit log.
   */
  async restorePhysicalStock(
    tx: Prisma.TransactionClient,
    params: {
      items: OrderStockItem[];
      orderId: string;
      userId: string;
      orderNumber: string;
      reason: string;
      adjustedByUserId: string;
    },
  ): Promise<void> {
    const sorted = this.sortItems(params.items);

    for (const item of sorted) {
      await tx.$executeRaw`SELECT id FROM "InventoryItem" WHERE "variantId" = ${item.variantId} FOR UPDATE`;

      const inventory = await tx.inventoryItem.findUnique({
        where: { variantId: item.variantId },
      });

      if (!inventory) {
        throw new NotFoundError(
          'INVENTORY_ITEM_NOT_FOUND',
          `Inventory record not found for variant ${item.variantId}`,
        );
      }

      const newQuantity = inventory.quantity + item.quantity;

      await tx.inventoryItem.update({
        where: { id: inventory.id },
        data: { quantity: newQuantity },
      });

      await tx.inventoryAdjustment.create({
        data: {
          inventoryItemId: inventory.id,
          type: 'ORDER_CANCELLATION',
          quantityDelta: item.quantity,
          oldQuantity: inventory.quantity,
          newQuantity,
          reason: params.reason || `Order ${params.orderNumber} cancellation`,
          adjustedByUserId: params.adjustedByUserId,
        },
      });
    }
  }

  /**
   * Idempotent and concurrency-safe cleanup of expired online payment reservations.
   * Uses FOR UPDATE SKIP LOCKED to prevent conflicting transaction locks.
   * Updates Order status to CANCELLED, Payment to CANCELLED, releases reserved stock,
   * idempotently releases coupon usage, and appends OrderStatusHistory.
   */
  async cleanupExpiredReservations(
    tx: Prisma.TransactionClient,
    now = new Date(),
  ): Promise<number> {
    const expiredRows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Order"
      WHERE status = 'PENDING'
        AND "paymentMethod" = 'SSLCOMMERZ'
        AND "paymentExpiresAt" IS NOT NULL
        AND "paymentExpiresAt" <= ${now}
      FOR UPDATE SKIP LOCKED
    `;

    if (!expiredRows || expiredRows.length === 0) {
      return 0;
    }

    let cleanedCount = 0;

    for (const row of expiredRows) {
      const order = await tx.order.findUnique({
        where: { id: row.id },
        include: { items: true },
      });

      if (!order || order.status !== 'PENDING') {
        continue;
      }

      // 1. Release reserved stock
      const stockItems: OrderStockItem[] = order.items
        .filter((item): item is typeof item & { variantId: string } => item.variantId !== null)
        .map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
        }));

      await this.releaseReservedStock(tx, stockItems);

      // 2. Idempotently release coupon if one was consumed
      await orderCouponService.releaseCoupon(tx, order.id);

      // 3. Mark order as CANCELLED
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          paymentStatus: 'CANCELLED',
          cancelledAt: now,
          cancellationReason: 'Payment reservation expired',
        },
      });

      // 4. Mark pending payments as CANCELLED
      await tx.payment.updateMany({
        where: {
          orderId: order.id,
          status: 'PENDING',
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
        },
      });

      // 5. Append status history audit
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: 'PENDING',
          toStatus: 'CANCELLED',
          reason: 'Payment reservation expired (30-minute window elapsed)',
          changedByUserId: null,
        },
      });

      cleanedCount++;
    }

    return cleanedCount;
  }
}

export const inventoryReservationService = new InventoryReservationService();
