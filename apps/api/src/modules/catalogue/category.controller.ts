import type { Request, Response } from 'express';
import { categoryService } from './category.service.js';
import {
  createCategorySchema,
  updateCategorySchema,
  reorderCategoriesSchema,
  categoryFilterSchema,
} from './catalogue.schemas.js';

export class CategoryController {
  // -------------------------------------------------------------
  // Public Storefront Endpoints
  // -------------------------------------------------------------

  /**
   * GET /api/v1/categories/tree
   * Returns active categories structured as a hierarchical tree.
   */
  async getPublicTree(_req: Request, res: Response): Promise<void> {
    const data = await categoryService.getTree({ onlyActive: true });
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * GET /api/v1/categories/:slug
   * Returns an active category by its slug with parent breadcrumb and active children.
   */
  async getPublicBySlug(req: Request, res: Response): Promise<void> {
    const slug = req.params.slug as string;
    const data = await categoryService.getBySlug(slug, { onlyActive: true });
    res.status(200).json({
      success: true,
      data,
    });
  }

  // -------------------------------------------------------------
  // Admin Operations Endpoints
  // -------------------------------------------------------------

  /**
   * GET /api/v1/admin/categories/tree
   * Returns the entire category tree (including inactive categories).
   */
  async getAdminTree(_req: Request, res: Response): Promise<void> {
    const data = await categoryService.getTree({ onlyActive: false });
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * GET /api/v1/admin/categories
   * Returns a paginated list of categories with search and filter capabilities.
   */
  async listAdmin(req: Request, res: Response): Promise<void> {
    const filter = categoryFilterSchema.parse(req.query);
    const data = await categoryService.list(filter);
    res.status(200).json({
      success: true,
      data: data.items,
      pagination: data.pagination,
    });
  }

  /**
   * GET /api/v1/admin/categories/:id
   * Returns category details by ID.
   */
  async getAdminById(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const data = await categoryService.getById(id);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * POST /api/v1/admin/categories
   * Creates a new category.
   */
  async create(req: Request, res: Response): Promise<void> {
    const input = createCategorySchema.parse(req.body);
    const category = await categoryService.create(input);
    res.status(201).json({
      success: true,
      data: category,
    });
  }

  /**
   * PATCH /api/v1/admin/categories/reorder
   * Bulk updates category display orders.
   */
  async reorder(req: Request, res: Response): Promise<void> {
    const input = reorderCategoriesSchema.parse(req.body);
    const data = await categoryService.reorder(input);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * PATCH /api/v1/admin/categories/:id
   * Updates an existing category with cycle prevention.
   */
  async update(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = updateCategorySchema.parse(req.body);
    const category = await categoryService.update(id, input);
    res.status(200).json({
      success: true,
      data: category,
    });
  }

  /**
   * DELETE /api/v1/admin/categories/:id
   * Deletes a category if it has no child categories.
   */
  async delete(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const data = await categoryService.delete(id);
    res.status(200).json({
      success: true,
      data,
    });
  }
}

export const categoryController = new CategoryController();
