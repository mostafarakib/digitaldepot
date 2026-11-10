import { prisma } from '../../lib/prisma.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import {
  normalizeSku,
  type CreateVariantInput,
  type UpdateVariantInput,
} from './catalogue.schemas.js';
import type { Prisma } from '../../generated/client/client.js';

export class VariantService {
  /**
   * Retrieves all variants for a given product with their price histories.
   */
  async listByProduct(productId: string) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found');
    }

    return await prisma.productVariant.findMany({
      where: { productId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: {
        _count: { select: { priceHistory: true } },
        inventoryItem: {
          select: {
            id: true,
            quantity: true,
            reservedQuantity: true,
            lowStockThreshold: true,
          },
        },
      },
    });
  }

  /**
   * Retrieves a single variant by ID.
   */
  async getById(id: string) {
    const variant = await prisma.productVariant.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true, slug: true } },
        inventoryItem: {
          select: {
            id: true,
            quantity: true,
            reservedQuantity: true,
            lowStockThreshold: true,
          },
        },
        priceHistory: {
          orderBy: { createdAt: 'desc' },
          include: {
            changedByUser: {
              select: {
                id: true,
                email: true,
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });

    if (!variant) {
      throw new NotFoundError('VARIANT_NOT_FOUND', 'Product variant not found');
    }

    return variant;
  }

  /**
   * Retrieves the immutable price history audit trail for a variant.
   */
  async getPriceHistory(variantId: string) {
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true },
    });

    if (!variant) {
      throw new NotFoundError('VARIANT_NOT_FOUND', 'Product variant not found');
    }

    return await prisma.priceHistory.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
      include: {
        changedByUser: {
          select: {
            id: true,
            email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
  }

  /**
   * Creates a new variant with store-wide unique normalized SKU and default invariant checks.
   */
  async create(productId: string, input: CreateVariantInput, userId?: string) {
    const sku = normalizeSku(input.sku);

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found');
    }

    const existingSku = await prisma.productVariant.findUnique({
      where: { sku },
      select: { id: true },
    });

    if (existingSku) {
      throw new ConflictError('SKU_ALREADY_EXISTS', `The SKU "${sku}" is already in use`);
    }

    const isActive = input.isActive ?? true;

    // Default variant invariant: inactive variant cannot be default
    if (input.isDefault && !isActive) {
      throw new BadRequestError(
        'DEFAULT_VARIANT_MUST_BE_ACTIVE',
        'An inactive variant cannot be designated as the default variant',
      );
    }

    return await prisma.$transaction(async (tx) => {
      // Acquire exclusive lock on the owning Product row to serialize concurrent default creations
      await tx.$executeRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;

      const existingVariants = await tx.productVariant.findMany({
        where: { productId },
        select: { id: true, isDefault: true, isActive: true },
      });

      // If this is the first variant, it must be the active default variant
      const shouldBeDefault = input.isDefault || existingVariants.length === 0;

      if (shouldBeDefault && !isActive) {
        throw new BadRequestError(
          'DEFAULT_VARIANT_MUST_BE_ACTIVE',
          'The default variant of a product must be active',
        );
      }

      // If new variant is default, demote any existing default
      if (shouldBeDefault && existingVariants.length > 0) {
        await tx.productVariant.updateMany({
          where: { productId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const variant = await tx.productVariant.create({
        data: {
          productId,
          sku,
          name: input.name,
          price: input.price,
          compareAtPrice: input.compareAtPrice ?? null,
          costPrice: input.costPrice ?? null,
          barcode: input.barcode ?? null,
          attributes: (input.attributes as Prisma.InputJsonValue) ?? {},
          isDefault: shouldBeDefault,
          isActive,
        },
      });

      // Initial price history record
      await tx.priceHistory.create({
        data: {
          variantId: variant.id,
          oldPrice: 0,
          newPrice: input.price,
          oldCompareAt: null,
          newCompareAt: input.compareAtPrice ?? null,
          oldCostPrice: null,
          newCostPrice: input.costPrice ?? null,
          reason: 'Initial variant creation',
          changedByUserId: userId ?? null,
        },
      });

      // Initial inventory item creation
      const initialStock = input.initialStock ?? 0;
      const lowStockThreshold = input.lowStockThreshold ?? 5;

      const inventoryItem = await tx.inventoryItem.create({
        data: {
          variantId: variant.id,
          quantity: initialStock,
          reservedQuantity: 0,
          lowStockThreshold,
        },
      });

      // Requirement 1: If non-zero initialStock, create corresponding audit record in same transaction
      if (initialStock > 0) {
        await tx.inventoryAdjustment.create({
          data: {
            inventoryItemId: inventoryItem.id,
            type: 'RECEIVE',
            quantityDelta: initialStock,
            oldQuantity: 0,
            newQuantity: initialStock,
            reason: 'Initial stock on variant creation',
            adjustedByUserId: userId ?? null,
          },
        });
      }

      return variant;
    });
  }

  /**
   * Updates an existing variant with price-history audit logging and default invariant enforcement.
   */
  async update(id: string, input: UpdateVariantInput, userId?: string) {
    const existing = await prisma.productVariant.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('VARIANT_NOT_FOUND', 'Product variant not found');
    }

    let sku = existing.sku;
    if (input.sku !== undefined) {
      const normalized = normalizeSku(input.sku);
      if (normalized !== existing.sku) {
        const conflict = await prisma.productVariant.findUnique({
          where: { sku: normalized },
          select: { id: true },
        });

        if (conflict && conflict.id !== id) {
          throw new ConflictError(
            'SKU_ALREADY_EXISTS',
            `The SKU "${normalized}" is already in use`,
          );
        }
        sku = normalized;
      }
    }

    const newIsActive = input.isActive !== undefined ? input.isActive : existing.isActive;

    // Inactive variant cannot be explicitly designated as default
    if (input.isDefault === true && !newIsActive) {
      throw new BadRequestError(
        'DEFAULT_VARIANT_MUST_BE_ACTIVE',
        'An inactive variant cannot be designated as the default variant',
      );
    }

    const newIsDefault =
      existing.isDefault && !newIsActive
        ? false
        : input.isDefault !== undefined
          ? input.isDefault
          : existing.isDefault;

    return await prisma.$transaction(async (tx) => {
      // Acquire exclusive lock on the owning Product row to serialize concurrent default promotions/deactivations
      await tx.$executeRaw`SELECT id FROM "Product" WHERE id = ${existing.productId} FOR UPDATE`;

      // 1. Invariant: Handle deactivation of the current default variant
      if (existing.isDefault && !newIsActive) {
        // Find another active variant to promote
        const nextActive = await tx.productVariant.findFirst({
          where: {
            productId: existing.productId,
            id: { not: id },
            isActive: true,
          },
          orderBy: { createdAt: 'asc' },
        });

        if (!nextActive) {
          throw new BadRequestError(
            'CANNOT_DEACTIVATE_SOLE_ACTIVE_DEFAULT',
            'Cannot deactivate the only active default variant. A product must have at least one active default variant.',
          );
        }

        // Promote the next active variant to default
        await tx.productVariant.update({
          where: { id: nextActive.id },
          data: { isDefault: true },
        });
      }

      // 2. Invariant: Handle explicit promotion to default
      if (newIsDefault && !existing.isDefault) {
        await tx.productVariant.updateMany({
          where: { productId: existing.productId, isDefault: true },
          data: { isDefault: false },
        });
      }

      // 3. Invariant: Handle explicit demotion of current default without promoting another
      if (existing.isDefault && input.isDefault === false && newIsActive) {
        const nextActive = await tx.productVariant.findFirst({
          where: {
            productId: existing.productId,
            id: { not: id },
            isActive: true,
          },
          orderBy: { createdAt: 'asc' },
        });

        if (!nextActive) {
          throw new BadRequestError(
            'PRODUCT_REQUIRES_DEFAULT_VARIANT',
            'Cannot demote the only default variant without designating another active variant as default',
          );
        }

        await tx.productVariant.update({
          where: { id: nextActive.id },
          data: { isDefault: true },
        });
      }

      // 4. Price history audit tracking
      const newPrice = input.price !== undefined ? input.price : existing.price;
      const newCompareAt =
        input.compareAtPrice !== undefined ? input.compareAtPrice : existing.compareAtPrice;
      const newCostPrice = input.costPrice !== undefined ? input.costPrice : existing.costPrice;

      const priceChanged =
        newPrice !== existing.price ||
        newCompareAt !== existing.compareAtPrice ||
        newCostPrice !== existing.costPrice;

      if (priceChanged) {
        await tx.priceHistory.create({
          data: {
            variantId: id,
            oldPrice: existing.price,
            newPrice,
            oldCompareAt: existing.compareAtPrice,
            newCompareAt,
            oldCostPrice: existing.costPrice,
            newCostPrice,
            reason: input.reason?.trim() || 'Admin price update',
            changedByUserId: userId ?? null,
          },
        });
      }

      // Update variant
      return await tx.productVariant.update({
        where: { id },
        data: {
          sku,
          ...(input.name !== undefined && { name: input.name }),
          ...(input.price !== undefined && { price: input.price }),
          ...(input.compareAtPrice !== undefined && { compareAtPrice: input.compareAtPrice }),
          ...(input.costPrice !== undefined && { costPrice: input.costPrice }),
          ...(input.barcode !== undefined && { barcode: input.barcode }),
          ...(input.attributes !== undefined && {
            attributes: input.attributes as Prisma.InputJsonValue,
          }),
          isDefault: existing.isDefault && !newIsActive ? false : newIsDefault,
          isActive: newIsActive,
        },
      });
    });
  }

  /**
   * Deletes a variant.
   * Enforces:
   * 1. Cannot delete last remaining variant.
   * 2. Cannot delete variant that has price-history records (Requirement 2).
   * 3. Deleting default automatically promotes another active variant.
   */
  async delete(id: string) {
    const existing = await prisma.productVariant.findUnique({
      where: { id },
      include: {
        _count: { select: { priceHistory: true } },
        inventoryItem: {
          include: {
            _count: { select: { adjustments: true } },
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError('VARIANT_NOT_FOUND', 'Product variant not found');
    }

    // Restrict deletion of variants with price-history records
    if (existing._count.priceHistory > 1) {
      // More than the initial creation audit record
      throw new ConflictError(
        'VARIANT_HAS_PRICE_HISTORY',
        'Cannot delete variant that has historical price change audit records. Deactivate the variant or archive the product instead.',
      );
    }

    // Restrict deletion if inventory adjustment audit records exist
    const adjustmentsCount = existing.inventoryItem?._count.adjustments ?? 0;
    if (adjustmentsCount > 0) {
      throw new ConflictError(
        'VARIANT_HAS_INVENTORY_HISTORY',
        'Cannot delete variant that has stock adjustment audit records. Deactivate the variant or archive the product instead.',
      );
    }

    return await prisma.$transaction(async (tx) => {
      // Acquire exclusive lock on the owning Product row to serialize deletion and default promotion
      await tx.$executeRaw`SELECT id FROM "Product" WHERE id = ${existing.productId} FOR UPDATE`;

      const allVariants = await tx.productVariant.findMany({
        where: { productId: existing.productId },
        select: { id: true, isDefault: true, isActive: true },
      });

      if (allVariants.length <= 1) {
        throw new BadRequestError(
          'CANNOT_DELETE_LAST_VARIANT',
          'Cannot delete the only variant of a product. Archive the product instead.',
        );
      }

      // If deleting the default variant, promote another active variant
      if (existing.isDefault) {
        const nextActive = allVariants.find((v) => v.id !== id && v.isActive);

        if (!nextActive) {
          throw new BadRequestError(
            'CANNOT_DELETE_DEFAULT_WITHOUT_ACTIVE_VARIANT',
            'Cannot delete default variant when no other active variant exists to become default. Activate another variant first.',
          );
        }

        await tx.productVariant.update({
          where: { id: nextActive.id },
          data: { isDefault: true },
        });
      }

      // Clean up inventory item if present (safe because adjustmentsCount is 0)
      if (existing.inventoryItem) {
        await tx.inventoryItem.delete({
          where: { id: existing.inventoryItem.id },
        });
      }

      // Clean up the initial creation price history record if exactly 1
      await tx.priceHistory.deleteMany({
        where: { variantId: id },
      });

      await tx.productVariant.delete({
        where: { id },
      });

      return { success: true, message: 'Variant deleted successfully' };
    });
  }
}

export const variantService = new VariantService();
