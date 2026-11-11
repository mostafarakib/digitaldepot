import { prisma } from '../../lib/prisma.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import {
  generateSlug,
  normalizeSku,
  type CreateProductInput,
  type UpdateProductInput,
  type ProductFilterInput,
  type StorefrontProductFilterInput,
} from './catalogue.schemas.js';
import { cloudinaryService } from './cloudinary.service.js';
import { categoryService } from './category.service.js';
import { Prisma, type ProductStatus } from '../../generated/client/client.js';

export interface PublicationCheckResult {
  canPublish: boolean;
  errors: string[];
}

export interface StorefrontProductSummary {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  featured: boolean;
  publishedAt: Date | null;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  brand: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
  } | null;
  primaryImage: {
    id: string;
    url: string;
    altText: string | null;
  } | null;
  minPrice: number; // in integer poisha
  maxPrice: number; // in integer poisha
  compareAtPrice: number | null;
  isInStock: boolean;
  totalAvailableStock: number;
  variantCount: number;
}

export interface StorefrontProductDetail {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  description: string | null;
  warranty: string | null;
  specifications: Array<{ group: string; name: string; value: string }>;
  featured: boolean;
  publishedAt: Date | null;
  category: {
    id: string;
    name: string;
    slug: string;
    breadcrumbs: Array<{ id: string; name: string; slug: string }>;
  };
  brand: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    websiteUrl: string | null;
  } | null;
  images: Array<{
    id: string;
    url: string;
    altText: string | null;
    displayOrder: number;
    isPrimary: boolean;
  }>;
  variants: Array<{
    id: string;
    sku: string;
    name: string;
    price: number;
    compareAtPrice: number | null;
    attributes: Record<string, string>;
    isDefault: boolean;
    availableStock: number;
    isOutOfStock: boolean;
  }>;
  isInStock: boolean;
  defaultVariantId: string;
}

export class ProductService {
  /**
   * Retrieves a paginated list of products for admin management with search and filters.
   */
  async list(filter: ProductFilterInput) {
    const where: Prisma.ProductWhereInput = {};

    if (filter.search) {
      const term = filter.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { summary: { contains: term, mode: 'insensitive' } },
        { slug: { contains: term, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: term.toUpperCase() } } } },
      ];
    }

    if (filter.categoryId) {
      where.categoryId = filter.categoryId;
    }

    if (filter.brandId) {
      where.brandId = filter.brandId;
    }

    if (filter.status) {
      where.status = filter.status as ProductStatus;
    }

    if (filter.featured !== undefined) {
      where.featured = filter.featured;
    }

    const skip = (filter.page - 1) * filter.limit;

    const [total, items] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: filter.limit,
        orderBy: { [filter.sortBy]: filter.sortOrder },
        include: {
          category: { select: { id: true, name: true, slug: true, isActive: true } },
          brand: { select: { id: true, name: true, slug: true, isActive: true } },
          images: {
            orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
            take: 1,
          },
          variants: {
            where: { isDefault: true },
            take: 1,
            select: {
              id: true,
              sku: true,
              price: true,
              compareAtPrice: true,
              isActive: true,
              isDefault: true,
            },
          },
          _count: {
            select: {
              variants: true,
              images: true,
            },
          },
        },
      }),
    ]);

    return {
      items,
      pagination: {
        total,
        page: filter.page,
        limit: filter.limit,
        totalPages: Math.ceil(total / filter.limit),
      },
    };
  }

  /**
   * Retrieves full product details by ID, including its category, brand, variants, and images.
   */
  async getById(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, slug: true, isActive: true } },
        brand: { select: { id: true, name: true, slug: true, isActive: true } },
        variants: {
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
        },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
        },
      },
    });

    if (!product) {
      throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found');
    }

    return product;
  }

  /**
   * Retrieves full product details by slug.
   */
  async getBySlug(slug: string) {
    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        category: { select: { id: true, name: true, slug: true, isActive: true } },
        brand: { select: { id: true, name: true, slug: true, isActive: true } },
        variants: {
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
        },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
        },
      },
    });

    if (!product) {
      throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found');
    }

    return product;
  }

  /**
   * Validates whether a product fulfills all 7 publication criteria:
   * 1. Name, slug, and category are defined.
   * 2. Assigned category is active.
   * 3. Assigned brand (if any) is active.
   * 4. Product has at least one active variant.
   * 5. All active variants have a positive price (> 0 poisha).
   * 6. Exactly one active variant is designated as the default variant.
   * 7. Product has at least one image, and exactly one image is designated as primary.
   */
  async validatePublication(productId: string): Promise<PublicationCheckResult> {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
        brand: true,
        variants: true,
        images: true,
      },
    });

    if (!product) {
      throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found');
    }

    const errors: string[] = [];

    // 1. Name, slug, category
    if (!product.name?.trim() || !product.slug?.trim() || !product.categoryId) {
      errors.push('Product name, slug, and category must be defined');
    }

    // 2. Category is active
    if (!product.category || !product.category.isActive) {
      errors.push('Assigned category must be active');
    }

    // 3. Brand is active if assigned
    if (product.brandId && (!product.brand || !product.brand.isActive)) {
      errors.push('Assigned brand must be active');
    }

    // 4. At least one active variant
    const activeVariants = product.variants.filter((v) => v.isActive);
    if (activeVariants.length === 0) {
      errors.push('Product must have at least one active variant');
    }

    // 5. Positive price on all active variants
    const hasInvalidPrice = activeVariants.some((v) => v.price <= 0);
    if (hasInvalidPrice) {
      errors.push('All active variants must have a price greater than zero');
    }

    // 6. Exactly one active variant is designated as the default variant
    const activeDefaults = activeVariants.filter((v) => v.isDefault);
    if (activeDefaults.length !== 1) {
      errors.push('Product must have exactly one active variant designated as the default');
    }

    // 7. At least one image and exactly one primary image
    if (product.images.length === 0) {
      errors.push('Product must have at least one image');
    } else {
      const primaryImages = product.images.filter((img) => img.isPrimary);
      if (primaryImages.length !== 1) {
        errors.push('Product must have exactly one image designated as primary');
      }
    }

    return {
      canPublish: errors.length === 0,
      errors,
    };
  }

  /**
   * Creates a new product in DRAFT status, optionally creating an initial default variant.
   */
  async create(input: CreateProductInput, userId?: string) {
    const rawSlug = input.slug?.trim() || generateSlug(input.name);
    const slug = rawSlug || `product-${Date.now()}`;

    // Verify slug uniqueness
    const existingSlug = await prisma.product.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existingSlug) {
      throw new ConflictError('SLUG_ALREADY_EXISTS', `The slug "${slug}" is already in use`);
    }

    // Verify category exists
    const category = await prisma.category.findUnique({
      where: { id: input.categoryId },
      select: { id: true, isActive: true },
    });

    if (!category) {
      throw new NotFoundError('CATEGORY_NOT_FOUND', 'The specified category does not exist');
    }

    // Verify brand exists if provided
    if (input.brandId) {
      const brand = await prisma.brand.findUnique({
        where: { id: input.brandId },
        select: { id: true, isActive: true },
      });

      if (!brand) {
        throw new NotFoundError('BRAND_NOT_FOUND', 'The specified brand does not exist');
      }
    }

    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: input.name,
          slug,
          summary: input.summary ?? null,
          description: input.description ?? null,
          categoryId: input.categoryId,
          brandId: input.brandId ?? null,
          featured: input.featured ?? false,
          warranty: input.warranty ?? null,
          specifications: (input.specifications as Prisma.InputJsonValue) ?? null,
          status: 'DRAFT',
        },
      });

      // If initial variant data is provided, create it as the active default variant
      if (input.initialVariant) {
        const variantSku = input.initialVariant.sku
          ? normalizeSku(input.initialVariant.sku)
          : `${slug.toUpperCase().slice(0, 15)}-DEF`;

        // Check SKU uniqueness
        const skuCheck = await tx.productVariant.findUnique({
          where: { sku: variantSku },
          select: { id: true },
        });

        if (skuCheck) {
          throw new ConflictError(
            'SKU_ALREADY_EXISTS',
            `The initial SKU "${variantSku}" is already in use`,
          );
        }

        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            sku: variantSku,
            name: 'Default',
            price: input.initialVariant.price,
            compareAtPrice: input.initialVariant.compareAtPrice ?? null,
            costPrice: input.initialVariant.costPrice ?? null,
            barcode: input.initialVariant.barcode ?? null,
            isDefault: true,
            isActive: true,
          },
        });

        // Create initial price history
        await tx.priceHistory.create({
          data: {
            variantId: variant.id,
            oldPrice: 0,
            newPrice: input.initialVariant.price,
            oldCompareAt: null,
            newCompareAt: input.initialVariant.compareAtPrice ?? null,
            oldCostPrice: null,
            newCostPrice: input.initialVariant.costPrice ?? null,
            reason: 'Initial variant creation',
            changedByUserId: userId ?? null,
          },
        });

        // Create initial inventory item
        const initialStock = input.initialVariant.initialStock ?? 0;
        const lowStockThreshold = input.initialVariant.lowStockThreshold ?? 5;

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
      }

      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: {
          category: { select: { id: true, name: true, slug: true, isActive: true } },
          brand: { select: { id: true, name: true, slug: true, isActive: true } },
          variants: true,
          images: true,
        },
      });
    });
  }

  /**
   * Updates product metadata. If transitioning status to PUBLISHED, enforces publication gate.
   */
  async update(id: string, input: UpdateProductInput) {
    const existing = await prisma.product.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found');
    }

    let slug = existing.slug;
    if (input.slug !== undefined) {
      const rawSlug = input.slug.trim() || generateSlug(input.name || existing.name);
      if (rawSlug !== existing.slug) {
        const conflict = await prisma.product.findUnique({
          where: { slug: rawSlug },
          select: { id: true },
        });

        if (conflict && conflict.id !== id) {
          throw new ConflictError('SLUG_ALREADY_EXISTS', `The slug "${rawSlug}" is already in use`);
        }
        slug = rawSlug;
      }
    }

    if (input.categoryId !== undefined) {
      const category = await prisma.category.findUnique({
        where: { id: input.categoryId },
        select: { id: true },
      });

      if (!category) {
        throw new NotFoundError('CATEGORY_NOT_FOUND', 'The specified category does not exist');
      }
    }

    if (input.brandId !== undefined && input.brandId !== null) {
      const brand = await prisma.brand.findUnique({
        where: { id: input.brandId },
        select: { id: true },
      });

      if (!brand) {
        throw new NotFoundError('BRAND_NOT_FOUND', 'The specified brand does not exist');
      }
    }

    // Publication gate check if status is directly set to PUBLISHED
    if (input.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
      const check = await this.validatePublication(id);
      if (!check.canPublish) {
        throw new BadRequestError(
          'PRODUCT_PUBLICATION_FAILED',
          `Cannot publish product: ${check.errors.join('; ')}`,
        );
      }
    }

    return await prisma.product.update({
      where: { id },
      data: {
        slug,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.summary !== undefined && { summary: input.summary }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.brandId !== undefined && { brandId: input.brandId }),
        ...(input.featured !== undefined && { featured: input.featured }),
        ...(input.warranty !== undefined && { warranty: input.warranty }),
        ...(input.specifications !== undefined && {
          specifications: input.specifications as Prisma.InputJsonValue,
        }),
        ...(input.status !== undefined && {
          status: input.status,
          ...(input.status === 'PUBLISHED' && !existing.publishedAt && { publishedAt: new Date() }),
        }),
      },
      include: {
        category: { select: { id: true, name: true, slug: true, isActive: true } },
        brand: { select: { id: true, name: true, slug: true, isActive: true } },
        variants: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
        },
      },
    });
  }

  /**
   * Publishes a product after running the 7 publication rules.
   */
  async publish(id: string) {
    const existing = await prisma.product.findUnique({
      where: { id },
      select: { id: true, status: true, publishedAt: true },
    });

    if (!existing) {
      throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found');
    }

    const check = await this.validatePublication(id);
    if (!check.canPublish) {
      throw new BadRequestError(
        'PRODUCT_PUBLICATION_FAILED',
        `Cannot publish product: ${check.errors.join('; ')}`,
      );
    }

    return await prisma.product.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: existing.publishedAt || new Date(),
      },
      include: {
        category: { select: { id: true, name: true, slug: true, isActive: true } },
        brand: { select: { id: true, name: true, slug: true, isActive: true } },
        variants: true,
        images: true,
      },
    });
  }

  /**
   * Archives a product (preferred lifecycle transition over hard deletion).
   */
  async archive(id: string) {
    const existing = await prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found');
    }

    return await prisma.product.update({
      where: { id },
      data: { status: 'ARCHIVED' },
      include: {
        category: { select: { id: true, name: true, slug: true, isActive: true } },
        brand: { select: { id: true, name: true, slug: true, isActive: true } },
        variants: true,
        images: true,
      },
    });
  }

  /**
   * Deletes a product.
   * Enforces:
   * 1. Cannot delete product if any variant has price history audit records beyond initial creation.
   * 2. Post-commit Cloudinary asset cleanup for associated images.
   */
  async delete(id: string) {
    const existing = await prisma.product.findUnique({
      where: { id },
      include: {
        _count: { select: { reviews: true } },
        variants: {
          include: {
            _count: { select: { priceHistory: true } },
            inventoryItem: {
              include: {
                _count: { select: { adjustments: true } },
              },
            },
          },
        },
        images: {
          select: { id: true, publicId: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found');
    }

    // Safeguard: Check if product has existing customer reviews (Clarification #2)
    if (existing._count.reviews > 0) {
      throw new ConflictError(
        'PRODUCT_HAS_REVIEWS',
        'Cannot delete product because it has customer reviews. Archive the product instead to preserve review history.',
      );
    }

    // Check if any variant has multiple price-history records
    const hasAuditHistory = existing.variants.some((v) => v._count.priceHistory > 1);
    if (hasAuditHistory) {
      throw new ConflictError(
        'PRODUCT_HAS_PRICE_HISTORY',
        'Cannot delete product because one or more variants have price change history. Archive the product instead to preserve audit records.',
      );
    }

    // Check if any variant has inventory adjustment records
    const hasInventoryHistory = existing.variants.some(
      (v) => (v.inventoryItem?._count.adjustments ?? 0) > 0,
    );
    if (hasInventoryHistory) {
      throw new ConflictError(
        'PRODUCT_HAS_INVENTORY_HISTORY',
        'Cannot delete product because one or more variants have inventory adjustment history. Archive the product instead to preserve audit records.',
      );
    }

    const publicIdsToDelete = existing.images
      .map((img) => img.publicId)
      .filter((id): id is string => Boolean(id));

    await prisma.$transaction(async (tx) => {
      // Row-level lock on product row to serialize concurrent modifications
      await tx.$executeRaw`SELECT id FROM "Product" WHERE id = ${id} FOR UPDATE`;

      // Clean up inventory items (safe because all variants have 0 adjustments)
      const inventoryItemIds = existing.variants
        .map((v) => v.inventoryItem?.id)
        .filter((id): id is string => Boolean(id));

      if (inventoryItemIds.length > 0) {
        await tx.inventoryItem.deleteMany({
          where: { id: { in: inventoryItemIds } },
        });
      }

      // Delete any initial price history records to allow cascade delete without FK constraint violation
      const variantIds = existing.variants.map((v) => v.id);
      if (variantIds.length > 0) {
        await tx.priceHistory.deleteMany({
          where: { variantId: { in: variantIds } },
        });
      }

      await tx.productImage.deleteMany({
        where: { productId: id },
      });

      await tx.wishlistItem.deleteMany({
        where: { productId: id },
      });

      await tx.productVariant.deleteMany({
        where: { productId: id },
      });

      await tx.product.delete({
        where: { id },
      });
    });

    // POST-COMMIT: Delete external Cloudinary assets
    for (const publicId of publicIdsToDelete) {
      try {
        await cloudinaryService.deleteAsset(publicId);
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : err, publicId },
          'Post-commit Cloudinary asset deletion encountered an operational error',
        );
      }
    }

    return { success: true, message: 'Product deleted successfully' };
  }

  /**
   * Retrieves a paginated list of published products for public storefront discovery.
   * Enforces all publication visibility constraints, available-stock filtering,
   * category hierarchy resolution, and database-level sorting/pagination.
   */
  async listStorefront(filter: StorefrontProductFilterInput) {
    const andConditions: Prisma.ProductWhereInput[] = [
      // 1. Published only
      { status: 'PUBLISHED' },
      // 2. Category must be active
      { category: { isActive: true } },
      // 3. At least one active variant
      { variants: { some: { isActive: true } } },
    ];

    // Brand filter composition (Requirement 2 & 4):
    if (filter.brand && filter.brand.trim().length > 0) {
      const brandSlugs = filter.brand
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      if (brandSlugs.length > 0) {
        andConditions.push({
          brand: {
            isActive: true,
            slug: { in: brandSlugs },
          },
        });
      }
    } else {
      // Without a brand filter, include unbranded products and products assigned to active brands
      andConditions.push({
        OR: [{ brandId: null }, { brand: { isActive: true } }],
      });
    }

    // Category hierarchy filter:
    if (filter.category && filter.category.trim().length > 0) {
      const descendantIds = await categoryService.getDescendantCategoryIds(
        filter.category.trim(),
        true,
      );

      if (descendantIds.length === 0) {
        // Target category is inactive or non-existent
        return {
          products: [],
          facets: {
            categories: [],
            brands: [],
            priceRange: { min: 0, max: 0 },
          },
          pagination: {
            page: filter.page,
            limit: filter.limit,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false,
          },
        };
      }

      andConditions.push({
        categoryId: { in: descendantIds },
      });
    }

    // Featured filter (Requirement 3):
    if (filter.featured !== undefined) {
      andConditions.push({
        featured: filter.featured,
      });
    }

    // Price range filtering (Requirement 5):
    if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
      andConditions.push({
        variants: {
          some: {
            isActive: true,
            ...(filter.minPrice !== undefined ? { price: { gte: filter.minPrice } } : {}),
            ...(filter.maxPrice !== undefined ? { price: { lte: filter.maxPrice } } : {}),
          },
        },
      });
    }

    // Available-stock filtering (Requirement 1):
    // In-stock means quantity > reservedQuantity. Do not use quantity > 0 as the database filter.
    if (filter.inStock) {
      const inStockProductIds = await prisma.$queryRaw<{ productId: string }[]>`
        SELECT DISTINCT pv."productId"
        FROM "ProductVariant" pv
        INNER JOIN "InventoryItem" ii ON ii."variantId" = pv.id
        WHERE pv."isActive" = true
          AND ii."quantity" > ii."reservedQuantity"
      `;
      const ids = inStockProductIds.map((r) => r.productId);
      andConditions.push({
        id: { in: ids },
      });
    }

    // Search filter (Requirement 2):
    if (filter.q && filter.q.trim().length > 0) {
      const term = filter.q.trim();
      andConditions.push({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { summary: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { brand: { isActive: true, name: { contains: term, mode: 'insensitive' } } },
          { variants: { some: { isActive: true, sku: { contains: term, mode: 'insensitive' } } } },
        ],
      });
    }

    const where: Prisma.ProductWhereInput = {
      AND: andConditions,
    };

    const skip = (filter.page - 1) * filter.limit;

    type LoadedStorefrontProduct = Prisma.ProductGetPayload<{
      include: {
        category: { select: { id: true; name: true; slug: true } };
        brand: { select: { id: true; name: true; slug: true; logoUrl: true } };
        images: true;
        variants: {
          include: { inventoryItem: true };
        };
      };
    }>;

    let total = 0;
    let orderedProducts: LoadedStorefrontProduct[] = [];

    if (filter.sort === 'price-asc' || filter.sort === 'price-desc') {
      const matching = await prisma.product.findMany({
        where,
        select: { id: true },
      });

      total = matching.length;

      if (total > 0) {
        const matchingIds = matching.map((m) => m.id);
        const sortDirection = filter.sort === 'price-asc' ? 'ASC' : 'DESC';

        const pageIdRows = await prisma.$queryRaw<{ productId: string }[]>`
          SELECT pv."productId"
          FROM "ProductVariant" pv
          WHERE pv."productId" IN (${Prisma.join(matchingIds)})
            AND pv."isActive" = true
          GROUP BY pv."productId"
          ORDER BY MIN(pv."price") ${Prisma.raw(sortDirection)}
          LIMIT ${filter.limit} OFFSET ${skip}
        `;

        const pageIds = pageIdRows.map((r) => r.productId);

        const loadedProducts = await prisma.product.findMany({
          where: { id: { in: pageIds } },
          include: {
            category: { select: { id: true, name: true, slug: true } },
            brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
            images: { orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }] },
            variants: {
              where: { isActive: true },
              include: { inventoryItem: true },
              orderBy: [{ isDefault: 'desc' }, { price: 'asc' }],
            },
          },
        });

        const productMap = new Map(loadedProducts.map((p) => [p.id, p]));
        orderedProducts = pageIds
          .map((id) => productMap.get(id))
          .filter(Boolean) as LoadedStorefrontProduct[];
      }
    } else {
      let orderBy: Prisma.ProductOrderByWithRelationInput[];
      if (filter.sort === 'newest') {
        orderBy = [{ publishedAt: 'desc' }, { createdAt: 'desc' }];
      } else if (filter.sort === 'name-asc') {
        orderBy = [{ name: 'asc' }];
      } else if (filter.sort === 'name-desc') {
        orderBy = [{ name: 'desc' }];
      } else {
        // 'featured'
        orderBy = [{ featured: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }];
      }

      const [countResult, productsResult] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          skip,
          take: filter.limit,
          orderBy,
          include: {
            category: { select: { id: true, name: true, slug: true } },
            brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
            images: { orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }] },
            variants: {
              where: { isActive: true },
              include: { inventoryItem: true },
              orderBy: [{ isDefault: 'desc' }, { price: 'asc' }],
            },
          },
        }),
      ]);
      total = countResult;
      orderedProducts = productsResult;
    }

    const transformedProducts: StorefrontProductSummary[] = orderedProducts.map((p) => {
      const activeVariants = p.variants;
      const prices = activeVariants.map((v) => v.price);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

      const defaultVariant = activeVariants.find((v) => v.isDefault) ?? activeVariants[0];
      const compareAtPrice = defaultVariant?.compareAtPrice ?? null;

      const totalAvailableStock = activeVariants.reduce(
        (sum: number, v) =>
          sum +
          Math.max(0, (v.inventoryItem?.quantity ?? 0) - (v.inventoryItem?.reservedQuantity ?? 0)),
        0,
      );

      const isInStock = activeVariants.some(
        (v) => (v.inventoryItem?.quantity ?? 0) > (v.inventoryItem?.reservedQuantity ?? 0),
      );

      const primaryImage = p.images.find((img) => img.isPrimary) ?? p.images[0] ?? null;

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        summary: p.summary,
        featured: p.featured,
        publishedAt: p.publishedAt,
        category: p.category,
        brand: p.brand,
        primaryImage: primaryImage
          ? {
              id: primaryImage.id,
              url: primaryImage.url,
              altText: primaryImage.altText,
            }
          : null,
        minPrice,
        maxPrice,
        compareAtPrice,
        isInStock,
        totalAvailableStock,
        variantCount: activeVariants.length,
        defaultVariantId: defaultVariant?.id ?? null,
      };
    });

    // Compute facets
    const [categoryFacets, brandFacets, priceBounds] = await Promise.all([
      prisma.category.findMany({
        where: {
          isActive: true,
          products: {
            some: {
              status: 'PUBLISHED',
              variants: { some: { isActive: true } },
            },
          },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          _count: {
            select: {
              products: {
                where: {
                  status: 'PUBLISHED',
                  variants: { some: { isActive: true } },
                },
              },
            },
          },
        },
        orderBy: { displayOrder: 'asc' },
      }),
      prisma.brand.findMany({
        where: {
          isActive: true,
          products: {
            some: {
              status: 'PUBLISHED',
              variants: { some: { isActive: true } },
            },
          },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          _count: {
            select: {
              products: {
                where: {
                  status: 'PUBLISHED',
                  variants: { some: { isActive: true } },
                },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.productVariant.aggregate({
        where: {
          isActive: true,
          product: {
            status: 'PUBLISHED',
            category: { isActive: true },
            OR: [{ brandId: null }, { brand: { isActive: true } }],
          },
        },
        _min: { price: true },
        _max: { price: true },
      }),
    ]);

    const totalPages = Math.ceil(total / filter.limit);

    return {
      products: transformedProducts,
      facets: {
        categories: categoryFacets.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          count: c._count.products,
        })),
        brands: brandFacets.map((b) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          count: b._count.products,
        })),
        priceRange: {
          min: priceBounds._min.price ?? 0,
          max: priceBounds._max.price ?? 0,
        },
      },
      pagination: {
        page: filter.page,
        limit: filter.limit,
        total,
        totalPages,
        hasNextPage: filter.page < totalPages,
        hasPrevPage: filter.page > 1,
      },
    };
  }

  /**
   * Retrieves a single published product by slug for the storefront product detail experience.
   * Enforces all publication visibility constraints (Requirement 4) and returns full details.
   */
  async getBySlugStorefront(slug: string): Promise<StorefrontProductDetail> {
    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        category: {
          select: { id: true, name: true, slug: true, isActive: true },
        },
        brand: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            websiteUrl: true,
            isActive: true,
          },
        },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
          select: { id: true, url: true, altText: true, displayOrder: true, isPrimary: true },
        },
        variants: {
          where: { isActive: true },
          include: { inventoryItem: true },
          orderBy: [{ isDefault: 'desc' }, { price: 'asc' }],
        },
      },
    });

    if (!product) {
      throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found');
    }

    // Visibility enforcement (Requirement 4)
    if (product.status !== 'PUBLISHED') {
      throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found');
    }

    if (!product.category.isActive) {
      throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found');
    }

    if (product.brand && !product.brand.isActive) {
      throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found');
    }

    if (product.variants.length === 0) {
      throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found');
    }

    const breadcrumbs = await categoryService.getBreadcrumbs(product.category.id);

    const transformedVariants = product.variants.map((v) => {
      const availableStock = Math.max(
        0,
        (v.inventoryItem?.quantity ?? 0) - (v.inventoryItem?.reservedQuantity ?? 0),
      );
      return {
        id: v.id,
        sku: v.sku,
        name: v.name,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        attributes: (v.attributes as Record<string, string>) || {},
        isDefault: v.isDefault,
        availableStock,
        isOutOfStock: availableStock <= 0,
      };
    });

    const defaultVariant = transformedVariants.find((v) => v.isDefault) ?? transformedVariants[0];

    const isInStock = transformedVariants.some((v) => !v.isOutOfStock);

    const specifications = Array.isArray(product.specifications)
      ? (product.specifications as unknown as Array<{
          group: string;
          name: string;
          value: string;
        }>)
      : [];

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      summary: product.summary,
      description: product.description,
      warranty: product.warranty,
      specifications,
      featured: product.featured,
      publishedAt: product.publishedAt,
      category: {
        id: product.category.id,
        name: product.category.name,
        slug: product.category.slug,
        breadcrumbs,
      },
      brand: product.brand
        ? {
            id: product.brand.id,
            name: product.brand.name,
            slug: product.brand.slug,
            logoUrl: product.brand.logoUrl,
            websiteUrl: product.brand.websiteUrl,
          }
        : null,
      images: product.images,
      variants: transformedVariants,
      isInStock,
      defaultVariantId: defaultVariant.id,
    };
  }
}

export const productService = new ProductService();

export const STOREFRONT_PRODUCT_VISIBILITY_WHERE: Prisma.ProductWhereInput = {
  status: 'PUBLISHED',
  category: { isActive: true },
  OR: [{ brandId: null }, { brand: { isActive: true } }],
  variants: { some: { isActive: true } },
};

/**
 * Validates whether a product meets all Phase 4D storefront publication visibility criteria:
 * 1. status is PUBLISHED
 * 2. category.isActive is true
 * 3. brand is null OR brand.isActive is true
 * 4. at least one variant has isActive: true
 *
 * Accepts either productId or slug.
 * Returns the resolved product or throws NotFoundError.
 */
export async function validateStorefrontVisibility(
  idOrSlug: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const product = await tx.product.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      ...STOREFRONT_PRODUCT_VISIBILITY_WHERE,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      categoryId: true,
      brandId: true,
      status: true,
    },
  });

  if (!product) {
    throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found');
  }

  return product;
}
