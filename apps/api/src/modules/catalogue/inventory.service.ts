import { prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import type {
  AdjustStockInput,
  InventoryFilterInput,
  InventoryHistoryFilterInput,
  UpdateThresholdInput,
} from './inventory.schemas.js';
import type { Prisma } from '../../generated/client/client.js';

export class InventoryService {
  /**
   * Retrieves a paginated list of inventory items with search, status filters, and summary metrics.
   */
  async list(filter: Partial<InventoryFilterInput> = {}) {
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryItemWhereInput = {};

    if (filter.search) {
      const term = filter.search.trim();
      where.variant = {
        OR: [
          { sku: { contains: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
          { product: { name: { contains: term, mode: 'insensitive' } } },
        ],
      };
    }

    if (filter.categoryId) {
      where.variant = {
        ...(where.variant as Prisma.ProductVariantWhereInput),
        product: {
          categoryId: filter.categoryId,
        },
      };
    }

    if (filter.stockStatus === 'out_of_stock') {
      where.quantity = { lte: 0 };
    } else if (filter.stockStatus === 'in_stock') {
      where.quantity = { gt: 0 };
    }

    let orderBy: Prisma.InventoryItemOrderByWithRelationInput = { updatedAt: 'desc' };
    if (filter.sortBy === 'stock_asc') {
      orderBy = { quantity: 'asc' };
    } else if (filter.sortBy === 'stock_desc') {
      orderBy = { quantity: 'desc' };
    } else if (filter.sortBy === 'sku_asc') {
      orderBy = { variant: { sku: 'asc' } };
    } else if (filter.sortBy === 'name_asc') {
      orderBy = { variant: { name: 'asc' } };
    }

    const [rawItems, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          variant: {
            select: {
              id: true,
              sku: true,
              name: true,
              price: true,
              isDefault: true,
              isActive: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  status: true,
                  category: { select: { id: true, name: true } },
                  images: {
                    where: { isPrimary: true },
                    select: { url: true },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    // Calculate aggregated inventory summary metrics across the store
    const [totalTracked, onHandAggregate, outOfStockCount] = await Promise.all([
      prisma.inventoryItem.count(),
      prisma.inventoryItem.aggregate({ _sum: { quantity: true } }),
      prisma.inventoryItem.count({ where: { quantity: { lte: 0 } } }),
    ]);

    const items = rawItems.map((item) => {
      const available = item.quantity - item.reservedQuantity;
      const threshold = item.lowStockThreshold ?? 5;
      const isOutOfStock = available <= 0;
      const isLowStock = !isOutOfStock && available <= threshold;

      return {
        ...item,
        available,
        isLowStock,
        isOutOfStock,
      };
    });

    // In-memory filter for low_stock if explicitly selected
    const filteredItems =
      filter.stockStatus === 'low_stock' ? items.filter((i) => i.isLowStock) : items;

    // Estimate low-stock count across the store
    const lowStockSample = await prisma.inventoryItem.findMany({
      where: { quantity: { gt: 0 } },
      select: { quantity: true, reservedQuantity: true, lowStockThreshold: true },
    });
    const lowStockCount = lowStockSample.filter((i) => {
      const avail = i.quantity - i.reservedQuantity;
      const th = i.lowStockThreshold ?? 5;
      return avail > 0 && avail <= th;
    }).length;

    return {
      items: filteredItems,
      pagination: {
        page,
        limit,
        total: filter.stockStatus === 'low_stock' ? filteredItems.length : total,
        totalPages: Math.ceil(
          (filter.stockStatus === 'low_stock' ? filteredItems.length : total) / limit,
        ),
      },
      summary: {
        totalTrackedVariants: totalTracked,
        totalOnHandUnits: onHandAggregate._sum.quantity || 0,
        lowStockCount,
        outOfStockCount,
      },
    };
  }

  /**
   * Retrieves stock details for a single variant.
   */
  async getByVariantId(variantId: string) {
    const item = await prisma.inventoryItem.findUnique({
      where: { variantId },
      include: {
        variant: {
          select: {
            id: true,
            sku: true,
            name: true,
            price: true,
            isDefault: true,
            isActive: true,
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                category: { select: { id: true, name: true } },
                images: {
                  where: { isPrimary: true },
                  select: { url: true },
                  take: 1,
                },
              },
            },
          },
        },
        _count: { select: { adjustments: true } },
      },
    });

    if (!item) {
      throw new NotFoundError(
        'INVENTORY_ITEM_NOT_FOUND',
        'Inventory record not found for the specified variant',
      );
    }

    const available = item.quantity - item.reservedQuantity;
    const threshold = item.lowStockThreshold ?? 5;
    const isOutOfStock = available <= 0;
    const isLowStock = !isOutOfStock && available <= threshold;

    return {
      ...item,
      available,
      isLowStock,
      isOutOfStock,
    };
  }

  /**
   * Performs an atomic stock adjustment serialized via PostgreSQL row locking.
   * Enforces non-negative stock and non-negative available stock.
   * Records an immutable audit log entry in the same transaction.
   */
  async adjust(input: AdjustStockInput, userId?: string) {
    return await prisma.$transaction(async (tx) => {
      // Step 1: Acquire exclusive row lock on the InventoryItem row
      await tx.$executeRaw`SELECT id FROM "InventoryItem" WHERE "variantId" = ${input.variantId} FOR UPDATE`;

      // Step 2: Read latest quantities within the locked transaction
      const current = await tx.inventoryItem.findUnique({
        where: { variantId: input.variantId },
      });

      if (!current) {
        throw new NotFoundError(
          'INVENTORY_ITEM_NOT_FOUND',
          'Inventory record not found for the specified variant',
        );
      }

      // Step 3: Compute new quantity and validate invariants
      const newQuantity = current.quantity + input.quantityDelta;

      if (newQuantity < 0) {
        throw new BadRequestError(
          'INSUFFICIENT_STOCK',
          `Adjustment would result in negative on-hand stock. Current on-hand: ${current.quantity}, requested change: ${input.quantityDelta}`,
        );
      }

      const newAvailable = newQuantity - current.reservedQuantity;
      if (newAvailable < 0) {
        throw new BadRequestError(
          'INSUFFICIENT_AVAILABLE_STOCK',
          `Adjustment would result in negative available stock. Reserved: ${current.reservedQuantity}, new on-hand: ${newQuantity}`,
        );
      }

      // Step 4: Update inventory item
      const updated = await tx.inventoryItem.update({
        where: { id: current.id },
        data: { quantity: newQuantity },
        include: {
          variant: {
            select: {
              id: true,
              sku: true,
              name: true,
              product: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      });

      // Step 5: Insert immutable adjustment audit record
      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          inventoryItemId: current.id,
          type: input.type,
          quantityDelta: input.quantityDelta,
          oldQuantity: current.quantity,
          newQuantity,
          reason: input.reason.trim(),
          adjustedByUserId: userId ?? null,
        },
        include: {
          adjustedByUser: {
            select: {
              id: true,
              email: true,
              profile: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      return {
        item: {
          ...updated,
          available: newAvailable,
          isLowStock: newAvailable <= (updated.lowStockThreshold ?? 5) && newAvailable > 0,
          isOutOfStock: newAvailable <= 0,
        },
        adjustment,
      };
    });
  }

  /**
   * Updates the low-stock alert threshold for a variant.
   */
  async updateThreshold(variantId: string, input: UpdateThresholdInput) {
    const item = await prisma.inventoryItem.findUnique({
      where: { variantId },
      select: { id: true },
    });

    if (!item) {
      throw new NotFoundError(
        'INVENTORY_ITEM_NOT_FOUND',
        'Inventory record not found for the specified variant',
      );
    }

    return await prisma.inventoryItem.update({
      where: { variantId },
      data: { lowStockThreshold: input.lowStockThreshold },
    });
  }

  /**
   * Retrieves the paginated adjustment audit trail for a specific variant.
   */
  async getVariantHistory(variantId: string, filter: Partial<InventoryHistoryFilterInput> = {}) {
    const item = await prisma.inventoryItem.findUnique({
      where: { variantId },
      select: { id: true },
    });

    if (!item) {
      throw new NotFoundError(
        'INVENTORY_ITEM_NOT_FOUND',
        'Inventory record not found for the specified variant',
      );
    }

    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryAdjustmentWhereInput = {
      inventoryItemId: item.id,
      ...(filter.type && { type: filter.type }),
    };

    const [adjustments, total] = await Promise.all([
      prisma.inventoryAdjustment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          adjustedByUser: {
            select: {
              id: true,
              email: true,
              profile: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      prisma.inventoryAdjustment.count({ where }),
    ]);

    return {
      adjustments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves a global stock adjustment history log across all inventory items.
   */
  async getGlobalHistory(filter: Partial<InventoryHistoryFilterInput> = {}) {
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryAdjustmentWhereInput = {
      ...(filter.type && { type: filter.type }),
    };

    const [adjustments, total] = await Promise.all([
      prisma.inventoryAdjustment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          adjustedByUser: {
            select: {
              id: true,
              email: true,
              profile: { select: { firstName: true, lastName: true } },
            },
          },
          inventoryItem: {
            select: {
              id: true,
              variant: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  product: { select: { id: true, name: true, slug: true } },
                },
              },
            },
          },
        },
      }),
      prisma.inventoryAdjustment.count({ where }),
    ]);

    return {
      adjustments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const inventoryService = new InventoryService();
