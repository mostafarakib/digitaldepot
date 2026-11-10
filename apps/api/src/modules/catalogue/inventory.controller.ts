import type { Request, Response } from 'express';
import { inventoryService } from './inventory.service.js';
import {
  adjustStockSchema,
  inventoryFilterSchema,
  inventoryHistoryFilterSchema,
  updateThresholdSchema,
} from './inventory.schemas.js';

export class InventoryController {
  /**
   * GET /api/v1/admin/inventory
   * Retrieves paginated inventory overview with search, filters, and metrics.
   */
  async list(req: Request, res: Response): Promise<void> {
    const filter = inventoryFilterSchema.parse(req.query);
    const data = await inventoryService.list(filter);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * GET /api/v1/admin/inventory/history
   * Retrieves global stock adjustments history across all inventory items.
   */
  async getGlobalHistory(req: Request, res: Response): Promise<void> {
    const filter = inventoryHistoryFilterSchema.parse(req.query);
    const data = await inventoryService.getGlobalHistory(filter);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * GET /api/v1/admin/inventory/variant/:variantId
   * Retrieves stock details for a specific variant.
   */
  async getByVariantId(req: Request, res: Response): Promise<void> {
    const variantId = req.params.variantId as string;
    const data = await inventoryService.getByVariantId(variantId);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * GET /api/v1/admin/inventory/variant/:variantId/history
   * Retrieves paginated adjustment audit trail for a specific variant.
   */
  async getVariantHistory(req: Request, res: Response): Promise<void> {
    const variantId = req.params.variantId as string;
    const filter = inventoryHistoryFilterSchema.parse(req.query);
    const data = await inventoryService.getVariantHistory(variantId, filter);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * POST /api/v1/admin/inventory/adjust
   * Atomically adjusts stock with concurrency serialization and audit recording.
   */
  async adjust(req: Request, res: Response): Promise<void> {
    const input = adjustStockSchema.parse(req.body);
    const data = await inventoryService.adjust(input, req.user?.id);
    res.status(200).json({
      success: true,
      data,
      message: 'Stock adjusted successfully',
    });
  }

  /**
   * PATCH /api/v1/admin/inventory/variant/:variantId/threshold
   * Updates low-stock alert threshold.
   */
  async updateThreshold(req: Request, res: Response): Promise<void> {
    const variantId = req.params.variantId as string;
    const input = updateThresholdSchema.parse(req.body);
    const data = await inventoryService.updateThreshold(variantId, input);
    res.status(200).json({
      success: true,
      data,
      message: 'Threshold updated successfully',
    });
  }
}

export const inventoryController = new InventoryController();
