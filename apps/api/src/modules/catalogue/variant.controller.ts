import type { Request, Response } from 'express';
import { variantService } from './variant.service.js';
import { createVariantSchema, updateVariantSchema } from './catalogue.schemas.js';

export class VariantController {
  /**
   * GET /api/v1/admin/products/:productId/variants
   * Retrieves all variants for a product.
   */
  async listByProduct(req: Request, res: Response): Promise<void> {
    const productId = req.params.productId as string;
    const data = await variantService.listByProduct(productId);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * GET /api/v1/admin/variants/:id
   * Retrieves a single variant by ID.
   */
  async getById(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const data = await variantService.getById(id);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * GET /api/v1/admin/variants/:id/price-history
   * Retrieves the immutable price history audit trail for a variant.
   */
  async getPriceHistory(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const data = await variantService.getPriceHistory(id);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * POST /api/v1/admin/products/:productId/variants
   * Creates a new variant with store-wide unique normalized SKU.
   */
  async create(req: Request, res: Response): Promise<void> {
    const productId = req.params.productId as string;
    const input = createVariantSchema.parse(req.body);
    const userId = req.user?.id;
    const data = await variantService.create(productId, input, userId);
    res.status(201).json({
      success: true,
      data,
    });
  }

  /**
   * PATCH /api/v1/admin/variants/:id
   * Updates a variant with price-history audit logging.
   */
  async update(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = updateVariantSchema.parse(req.body);
    const userId = req.user?.id;
    const data = await variantService.update(id, input, userId);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * DELETE /api/v1/admin/variants/:id
   * Deletes a variant if no price-history records exist and not the only variant.
   */
  async delete(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const result = await variantService.delete(id);
    res.status(200).json(result);
  }
}

export const variantController = new VariantController();
