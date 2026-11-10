import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { cloudinaryService } from './cloudinary.service.js';
import type { CreateImageInput, ReorderImagesInput } from './catalogue.schemas.js';

export class ImageService {
  /**
   * Adds an image to a product. If marked as primary or if it is the first image,
   * ensures exactly one primary image exists for the product.
   */
  async add(productId: string, input: CreateImageInput) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found');
    }

    return await prisma.$transaction(async (tx) => {
      // Row-level lock on owning product to serialize concurrent image operations
      await tx.$executeRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;

      const existingImages = await tx.productImage.findMany({
        where: { productId },
        select: { id: true, isPrimary: true },
      });

      const shouldBePrimary = input.isPrimary || existingImages.length === 0;

      if (shouldBePrimary && existingImages.length > 0) {
        await tx.productImage.updateMany({
          where: { productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return await tx.productImage.create({
        data: {
          productId,
          url: input.url,
          publicId: input.publicId ?? null,
          altText: input.altText ?? null,
          displayOrder: input.displayOrder ?? existingImages.length,
          isPrimary: shouldBePrimary,
        },
      });
    });
  }

  /**
   * Designates a specific image as primary and demotes any existing primary image atomically.
   */
  async setPrimary(productId: string, imageId: string) {
    return await prisma.$transaction(async (tx) => {
      // Row-level lock on owning product to serialize concurrent primary image changes
      await tx.$executeRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;

      const targetImage = await tx.productImage.findFirst({
        where: { id: imageId, productId },
      });

      if (!targetImage) {
        throw new NotFoundError('IMAGE_NOT_FOUND', 'Product image not found');
      }

      // Demote current primary
      await tx.productImage.updateMany({
        where: { productId, isPrimary: true },
        data: { isPrimary: false },
      });

      // Promote target
      return await tx.productImage.update({
        where: { id: imageId },
        data: { isPrimary: true },
      });
    });
  }

  /**
   * Reorders product images within a transaction.
   */
  async reorder(productId: string, input: ReorderImagesInput) {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;

      for (const item of input.items) {
        await tx.productImage.updateMany({
          where: { id: item.id, productId },
          data: { displayOrder: item.displayOrder },
        });
      }
      return { success: true, count: input.items.length };
    });
  }

  /**
   * Deletes a product image and triggers post-commit Cloudinary asset removal.
   */
  async delete(productId: string, imageId: string) {
    const existing = await prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });

    if (!existing) {
      throw new NotFoundError('IMAGE_NOT_FOUND', 'Product image not found');
    }

    const publicIdToDelete = existing.publicId;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;

      await tx.productImage.delete({
        where: { id: imageId },
      });

      // If the deleted image was primary, promote the next available image
      if (existing.isPrimary) {
        const nextImage = await tx.productImage.findFirst({
          where: { productId },
          orderBy: { displayOrder: 'asc' },
        });

        if (nextImage) {
          await tx.productImage.update({
            where: { id: nextImage.id },
            data: { isPrimary: true },
          });
        }
      }
    });

    // POST-COMMIT: Trigger external asset cleanup only after database transaction succeeds
    if (publicIdToDelete) {
      try {
        await cloudinaryService.deleteAsset(publicIdToDelete);
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : err, publicId: publicIdToDelete },
          'Post-commit Cloudinary asset deletion encountered an operational error',
        );
      }
    }

    return { success: true, message: 'Image deleted successfully' };
  }
}

export const imageService = new ImageService();
