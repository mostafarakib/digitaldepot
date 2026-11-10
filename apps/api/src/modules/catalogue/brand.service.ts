import { prisma } from '../../lib/prisma.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import {
  generateSlug,
  type CreateBrandInput,
  type UpdateBrandInput,
  type BrandFilterInput,
} from './catalogue.schemas.js';
import type { Prisma } from '../../generated/client/client.js';

export class BrandService {
  /**
   * Retrieves a paginated list of brands with optional search and active filters.
   */
  async list(filter: BrandFilterInput) {
    const where: Prisma.BrandWhereInput = {};

    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { slug: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    if (filter.isActive !== undefined) {
      where.isActive = filter.isActive;
    }

    const skip = (filter.page - 1) * filter.limit;

    const [total, items] = await Promise.all([
      prisma.brand.count({ where }),
      prisma.brand.findMany({
        where,
        skip,
        take: filter.limit,
        orderBy: { [filter.sortBy]: filter.sortOrder },
      }),
    ]);

    return {
      items,
      pagination: {
        page: filter.page,
        limit: filter.limit,
        total,
        totalPages: Math.ceil(total / filter.limit),
      },
    };
  }

  /**
   * Retrieves active brands for public storefront navigation or filtering.
   */
  async getActiveBrands() {
    return await prisma.brand.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        websiteUrl: true,
        description: true,
      },
    });
  }

  /**
   * Retrieves a single brand by ID.
   */
  async getById(id: string) {
    const brand = await prisma.brand.findUnique({
      where: { id },
    });

    if (!brand) {
      throw new NotFoundError('BRAND_NOT_FOUND', 'Brand not found');
    }

    return brand;
  }

  /**
   * Retrieves a brand by slug, optionally enforcing active status.
   */
  async getBySlug(slug: string, options: { onlyActive?: boolean } = {}) {
    const brand = await prisma.brand.findUnique({
      where: { slug },
    });

    if (!brand || (options.onlyActive && !brand.isActive)) {
      throw new NotFoundError('BRAND_NOT_FOUND', 'Brand not found');
    }

    return brand;
  }

  /**
   * Creates a new brand.
   */
  async create(input: CreateBrandInput) {
    const rawSlug = input.slug?.trim() || generateSlug(input.name);
    const slug = rawSlug || `brand-${Date.now()}`;

    // Verify slug uniqueness
    const existing = await prisma.brand.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError('SLUG_ALREADY_EXISTS', `The slug "${slug}" is already in use`);
    }

    return await prisma.brand.create({
      data: {
        name: input.name,
        slug,
        logoUrl: input.logoUrl ? input.logoUrl : null,
        description: input.description ?? null,
        websiteUrl: input.websiteUrl ? input.websiteUrl : null,
        isActive: input.isActive ?? true,
      },
    });
  }

  /**
   * Updates an existing brand.
   */
  async update(id: string, input: UpdateBrandInput) {
    const existing = await prisma.brand.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('BRAND_NOT_FOUND', 'Brand not found');
    }

    let slug = existing.slug;
    if (input.slug !== undefined && input.slug !== existing.slug) {
      const slugCandidate = input.slug.trim() || generateSlug(input.name ?? existing.name);
      const conflict = await prisma.brand.findUnique({
        where: { slug: slugCandidate },
        select: { id: true },
      });

      if (conflict && conflict.id !== id) {
        throw new ConflictError(
          'SLUG_ALREADY_EXISTS',
          `The slug "${slugCandidate}" is already in use`,
        );
      }
      slug = slugCandidate;
    }

    return await prisma.brand.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.slug !== undefined && { slug }),
        ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl ? input.logoUrl : null }),
        ...(input.description !== undefined && { description: input.description ?? null }),
        ...(input.websiteUrl !== undefined && {
          websiteUrl: input.websiteUrl ? input.websiteUrl : null,
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
  }

  /**
   * Deletes a brand.
   */
  async delete(id: string) {
    const existing = await prisma.brand.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true } },
      },
    });

    if (!existing) {
      throw new NotFoundError('BRAND_NOT_FOUND', 'Brand not found');
    }

    if (existing._count.products > 0) {
      throw new ConflictError(
        'BRAND_HAS_PRODUCTS',
        `Cannot delete brand "${existing.name}" because it is referenced by ${existing._count.products} products. You may deactivate the brand instead.`,
      );
    }

    await prisma.brand.delete({
      where: { id },
    });

    return { success: true, message: 'Brand deleted successfully' };
  }
}

export const brandService = new BrandService();
