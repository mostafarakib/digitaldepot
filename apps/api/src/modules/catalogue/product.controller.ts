import type { Request, Response } from 'express';
import { productService } from './product.service.js';
import {
  createProductSchema,
  updateProductSchema,
  productFilterSchema,
  storefrontProductFilterSchema,
} from './catalogue.schemas.js';

export class ProductController {
  /**
   * GET /api/v1/products
   * Returns a paginated storefront catalogue with filters, facets, and sorting.
   */
  async getStorefrontListing(req: Request, res: Response): Promise<void> {
    const filter = storefrontProductFilterSchema.parse(req.query);
    const data = await productService.listStorefront(filter);
    res.status(200).json({
      success: true,
      data: data.products,
      facets: data.facets,
      pagination: data.pagination,
    });
  }

  /**
   * GET /api/v1/products/:slug
   * Returns complete published product details for storefront display.
   */
  async getStorefrontBySlug(req: Request, res: Response): Promise<void> {
    const slug = req.params.slug as string;
    const data = await productService.getBySlugStorefront(slug);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * GET /api/v1/admin/products
   * Returns a paginated list of products with search and filtering.
   */
  async listAdmin(req: Request, res: Response): Promise<void> {
    const filter = productFilterSchema.parse(req.query);
    const data = await productService.list(filter);
    res.status(200).json({
      success: true,
      data: data.items,
      pagination: data.pagination,
    });
  }

  /**
   * GET /api/v1/admin/products/:id
   * Returns full product details by ID.
   */
  async getAdminById(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const data = await productService.getById(id);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * GET /api/v1/admin/products/:id/check-publish
   * Runs the 7 publication rules and returns validation status.
   */
  async checkPublication(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const data = await productService.validatePublication(id);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * POST /api/v1/admin/products
   * Creates a new product in DRAFT status.
   */
  async create(req: Request, res: Response): Promise<void> {
    const input = createProductSchema.parse(req.body);
    const userId = req.user?.id;
    const data = await productService.create(input, userId);
    res.status(201).json({
      success: true,
      data,
    });
  }

  /**
   * PATCH /api/v1/admin/products/:id
   * Updates product metadata.
   */
  async update(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const input = updateProductSchema.parse(req.body);
    const data = await productService.update(id, input);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * POST /api/v1/admin/products/:id/publish
   * Enforces publication gate and changes status to PUBLISHED.
   */
  async publish(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const data = await productService.publish(id);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * POST /api/v1/admin/products/:id/archive
   * Archives a product.
   */
  async archive(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const data = await productService.archive(id);
    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * DELETE /api/v1/admin/products/:id
   * Deletes a product if no immutable audit history is violated.
   */
  async delete(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const result = await productService.delete(id);
    res.status(200).json(result);
  }
}

export const productController = new ProductController();
