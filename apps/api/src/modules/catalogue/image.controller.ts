import type { Request, Response } from 'express';
import { imageService } from './image.service.js';
import { createImageSchema, reorderImagesSchema } from './catalogue.schemas.js';

export class ImageController {
  /**
   * POST /api/v1/admin/products/:productId/images
   * Adds an image to a product.
   */
  async add(req: Request, res: Response): Promise<void> {
    const productId = req.params.productId as string;
    const input = createImageSchema.parse(req.body);
    const data = await imageService.add(productId, input);
    res.status(201).json({
      success: true,
      data,
    });
  }

  /**
   * PATCH /api/v1/admin/products/:productId/images/reorder
   * Reorders product images.
   */
  async reorder(req: Request, res: Response): Promise<void> {
    const productId = req.params.productId as string;
    const input = reorderImagesSchema.parse(req.body);
    const result = await imageService.reorder(productId, input);
    res.status(200).json(result);
  }

  /**
   * PATCH /api/v1/admin/products/:productId/images/:id/primary
   * Sets an image as primary and demotes other primary images.
   */
  async setPrimary(req: Request, res: Response): Promise<void> {
    const productId = req.params.productId as string;
    const id = req.params.id as string;
    const data = await imageService.setPrimary(productId, id);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * DELETE /api/v1/admin/products/:productId/images/:id
   * Deletes an image and triggers post-commit Cloudinary asset cleanup.
   */
  async delete(req: Request, res: Response): Promise<void> {
    const productId = req.params.productId as string;
    const id = req.params.id as string;
    const result = await imageService.delete(productId, id);
    res.status(200).json(result);
  }
}

export const imageController = new ImageController();
