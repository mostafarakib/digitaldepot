import type { Request, Response } from 'express';
import { brandService } from './brand.service.js';
import { createBrandSchema, updateBrandSchema, brandFilterSchema } from './catalogue.schemas.js';

export class BrandController {
  // -------------------------------------------------------------
  // Public Storefront Endpoints
  // -------------------------------------------------------------

  /**
   * GET /api/v1/brands
   * Returns active brands list.
   */
  async getPublicBrands(_req: Request, res: Response): Promise<void> {
    const data = await brandService.getActiveBrands();
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * GET /api/v1/brands/:slug
   * Returns active brand details by slug.
   */
  async getPublicBySlug(req: Request, res: Response): Promise<void> {
    const slug = req.params.slug as string;
    const data = await brandService.getBySlug(slug, { onlyActive: true });
    res.status(200).json({
      success: true,
      data,
    });
  }

  // -------------------------------------------------------------
  // Admin Operations Endpoints
  // -------------------------------------------------------------

  /**
   * GET /api/v1/admin/brands
   * Returns a paginated list of brands with search and active filters.
   */
  async listAdmin(req: Request, res: Response): Promise<void> {
    const filter = brandFilterSchema.parse(req.query);
    const data = await brandService.list(filter);
    res.status(200).json({
      success: true,
      data: data.items,
      pagination: data.pagination,
    });
  }

  /**
   * GET /api/v1/admin/brands/:id
   * Returns brand details by ID.
   */
  async getAdminById(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const data = await brandService.getById(id);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * POST /api/v1/admin/brands
   * Creates a new brand.
   */
  async create(req: Request, res: Response): Promise<void> {
    const input = createBrandSchema.parse(req.body);
    const brand = await brandService.create(input);
    res.status(201).json({
      success: true,
      data: brand,
    });
  }

  /**
   * PATCH /api/v1/admin/brands/:id
   * Updates an existing brand.
   */
  async update(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = updateBrandSchema.parse(req.body);
    const brand = await brandService.update(id, input);
    res.status(200).json({
      success: true,
      data: brand,
    });
  }

  /**
   * DELETE /api/v1/admin/brands/:id
   * Deletes a brand.
   */
  async delete(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const data = await brandService.delete(id);
    res.status(200).json({
      success: true,
      data,
    });
  }
}

export const brandController = new BrandController();
