import { prisma } from '../../lib/prisma.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import {
  generateSlug,
  type CreateCategoryInput,
  type UpdateCategoryInput,
  type CategoryFilterInput,
  type ReorderCategoriesInput,
} from './catalogue.schemas.js';
import type { Prisma } from '../../generated/client/client.js';

export interface CategoryTreeNode {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  imageUrl: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
  children: CategoryTreeNode[];
}

export class CategoryService {
  /**
   * Retrieves the hierarchical category tree.
   * - onlyActive = true for public storefront consumption
   * - onlyActive = false for admin operations
   */
  async getTree(options: { onlyActive?: boolean } = {}): Promise<CategoryTreeNode[]> {
    const where: Prisma.CategoryWhereInput = options.onlyActive ? { isActive: true } : {};

    const categories = await prisma.category.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });

    const categoryMap = new Map<string, CategoryTreeNode>();
    for (const cat of categories) {
      categoryMap.set(cat.id, {
        ...cat,
        children: [],
      });
    }

    const roots: CategoryTreeNode[] = [];

    for (const cat of categories) {
      const node = categoryMap.get(cat.id)!;
      if (cat.parentId && categoryMap.has(cat.parentId)) {
        categoryMap.get(cat.parentId)!.children.push(node);
      } else {
        // Root node or parent is not included in the filtered set
        roots.push(node);
      }
    }

    return roots;
  }

  /**
   * Retrieves a paginated list of categories with optional filters.
   */
  async list(filter: CategoryFilterInput) {
    const where: Prisma.CategoryWhereInput = {};

    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { slug: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    if (filter.parentId !== undefined) {
      if (filter.parentId === 'root' || filter.parentId === 'null') {
        where.parentId = null;
      } else {
        where.parentId = filter.parentId;
      }
    }

    if (filter.isActive !== undefined) {
      where.isActive = filter.isActive;
    }

    const skip = (filter.page - 1) * filter.limit;

    const [total, items] = await Promise.all([
      prisma.category.count({ where }),
      prisma.category.findMany({
        where,
        skip,
        take: filter.limit,
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        include: {
          parent: { select: { id: true, name: true, slug: true } },
          _count: { select: { children: true } },
        },
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
   * Retrieves a single category by ID with its parent and direct children.
   */
  async getById(id: string) {
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: {
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });

    if (!category) {
      throw new NotFoundError('CATEGORY_NOT_FOUND', 'Category not found');
    }

    return category;
  }

  /**
   * Retrieves a category by slug, optionally enforcing active status.
   */
  async getBySlug(slug: string, options: { onlyActive?: boolean } = {}) {
    const category = await prisma.category.findUnique({
      where: { slug },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: {
          where: options.onlyActive ? { isActive: true } : undefined,
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });

    if (!category || (options.onlyActive && !category.isActive)) {
      throw new NotFoundError('CATEGORY_NOT_FOUND', 'Category not found');
    }

    return category;
  }

  /**
   * Creates a new category.
   */
  async create(input: CreateCategoryInput) {
    const rawSlug = input.slug?.trim() || generateSlug(input.name);
    const slug = rawSlug || `category-${Date.now()}`;

    // Verify slug uniqueness
    const existing = await prisma.category.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError('SLUG_ALREADY_EXISTS', `The slug "${slug}" is already in use`);
    }

    // Verify parent exists if provided
    if (input.parentId) {
      const parent = await prisma.category.findUnique({
        where: { id: input.parentId },
        select: { id: true },
      });

      if (!parent) {
        throw new NotFoundError(
          'PARENT_CATEGORY_NOT_FOUND',
          'The specified parent category does not exist',
        );
      }
    }

    return await prisma.category.create({
      data: {
        name: input.name,
        slug,
        description: input.description ?? null,
        parentId: input.parentId ?? null,
        imageUrl: input.imageUrl ? input.imageUrl : null,
        isActive: input.isActive ?? true,
        displayOrder: input.displayOrder ?? 0,
      },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  /**
   * Updates an existing category with cycle prevention.
   */
  async update(id: string, input: UpdateCategoryInput) {
    const existing = await prisma.category.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('CATEGORY_NOT_FOUND', 'Category not found');
    }

    // Handle slug update if provided
    let slug = existing.slug;
    if (input.slug !== undefined && input.slug !== existing.slug) {
      const slugCandidate = input.slug.trim() || generateSlug(input.name ?? existing.name);
      const conflict = await prisma.category.findUnique({
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

    // Handle parent update with cycle prevention
    let parentId = existing.parentId;
    if (input.parentId !== undefined) {
      if (input.parentId === null) {
        parentId = null;
      } else {
        // 1. Self-parenting check
        if (input.parentId === id) {
          throw new BadRequestError(
            'CATEGORY_CYCLE_DETECTED',
            'A category cannot be its own parent',
          );
        }

        // 2. Parent existence check
        const targetParent = await prisma.category.findUnique({
          where: { id: input.parentId },
          select: { id: true, parentId: true },
        });

        if (!targetParent) {
          throw new NotFoundError(
            'PARENT_CATEGORY_NOT_FOUND',
            'The specified parent category does not exist',
          );
        }

        // 3. Descendant cycle check: traverse upwards from targetParent to root
        let currentAncestorId: string | null = targetParent.parentId;
        const visited = new Set<string>([targetParent.id]);

        while (currentAncestorId) {
          if (currentAncestorId === id) {
            throw new BadRequestError(
              'CATEGORY_CYCLE_DETECTED',
              'A category cannot be assigned to one of its own descendants as parent',
            );
          }

          if (visited.has(currentAncestorId)) {
            // Broken existing graph or loop detected in ancestors
            break;
          }
          visited.add(currentAncestorId);

          const ancestor = await prisma.category.findUnique({
            where: { id: currentAncestorId },
            select: { parentId: true },
          });

          currentAncestorId = ancestor?.parentId ?? null;
        }

        parentId = input.parentId;
      }
    }

    const updateData: Prisma.CategoryUncheckedUpdateInput = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.slug !== undefined && { slug }),
      ...(input.description !== undefined && { description: input.description ?? null }),
      ...(input.parentId !== undefined && { parentId }),
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl ? input.imageUrl : null }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.displayOrder !== undefined && { displayOrder: input.displayOrder }),
    };

    return await prisma.category.update({
      where: { id },
      data: updateData,
      include: {
        parent: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  /**
   * Atomically updates display orders for a collection of categories.
   */
  async reorder(input: ReorderCategoriesInput) {
    const ids = input.items.map((item) => item.id);
    const uniqueIds = new Set(ids);

    if (uniqueIds.size !== ids.length) {
      throw new BadRequestError(
        'DUPLICATE_CATEGORY_IDS',
        'Duplicate category IDs found in reorder list',
      );
    }

    // Verify all categories exist
    const foundCategories = await prisma.category.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (foundCategories.length !== ids.length) {
      throw new NotFoundError(
        'CATEGORY_NOT_FOUND',
        'One or more categories in the reorder list do not exist',
      );
    }

    // Update in transaction
    await prisma.$transaction(
      input.items.map((item) =>
        prisma.category.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder },
        }),
      ),
    );

    return { success: true, count: input.items.length };
  }

  /**
   * Deletes a category if it has no child categories.
   */
  async delete(id: string) {
    const existing = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: { select: { children: true, products: true } },
      },
    });

    if (!existing) {
      throw new NotFoundError('CATEGORY_NOT_FOUND', 'Category not found');
    }

    if (existing._count.children > 0) {
      throw new ConflictError(
        'CATEGORY_HAS_CHILDREN',
        `Cannot delete category "${existing.name}" because it contains ${existing._count.children} subcategories. Please reassign or delete subcategories first.`,
      );
    }

    if (existing._count.products > 0) {
      throw new ConflictError(
        'CATEGORY_HAS_PRODUCTS',
        `Cannot delete category "${existing.name}" because it contains ${existing._count.products} products. Please reassign or delete the products first.`,
      );
    }

    await prisma.category.delete({
      where: { id },
    });

    return { success: true, message: 'Category deleted successfully' };
  }

  /**
   * Resolves a category and all its active descendant category IDs.
   * Used for hierarchical category filtering in the public storefront catalogue.
   */
  async getDescendantCategoryIds(slugOrId: string, onlyActive = true): Promise<string[]> {
    const initial = await prisma.category.findFirst({
      where: {
        OR: [{ id: slugOrId }, { slug: slugOrId }],
        ...(onlyActive ? { isActive: true } : {}),
      },
      select: { id: true },
    });

    if (!initial) {
      return [];
    }

    const rows = await prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE CategoryTree AS (
        SELECT id, "parentId", "isActive"
        FROM "Category"
        WHERE id = ${initial.id}
        UNION ALL
        SELECT c.id, c."parentId", c."isActive"
        FROM "Category" c
        INNER JOIN CategoryTree ct ON c."parentId" = ct.id
        WHERE (${onlyActive} = false OR c."isActive" = true)
      )
      SELECT id FROM CategoryTree;
    `;

    return rows.map((r) => r.id);
  }

  /**
   * Walks up the category parent hierarchy to generate ordered breadcrumbs.
   */
  async getBreadcrumbs(
    categoryId: string,
  ): Promise<Array<{ id: string; name: string; slug: string }>> {
    const breadcrumbs: Array<{ id: string; name: string; slug: string }> = [];
    let currentId: string | null = categoryId;
    let depth = 0;

    // Safety guard against cycles with max depth of 10
    while (currentId && depth < 10) {
      depth++;
      const cat: { id: string; name: string; slug: string; parentId: string | null } | null =
        await prisma.category.findUnique({
          where: { id: currentId },
          select: { id: true, name: true, slug: true, parentId: true },
        });

      if (!cat) break;
      breadcrumbs.unshift({ id: cat.id, name: cat.name, slug: cat.slug });
      currentId = cat.parentId;
    }

    return breadcrumbs;
  }
}

export const categoryService = new CategoryService();
