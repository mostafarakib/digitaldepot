import { z } from 'zod';

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Normalizes an arbitrary text string into a URL-friendly lowercase kebab-case slug.
 */
export function generateSlug(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// -------------------------------------------------------------
// Category Schemas
// -------------------------------------------------------------

export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must not exceed 100 characters'),
  slug: z
    .string()
    .trim()
    .regex(SLUG_REGEX, 'Slug must be lowercase alphanumeric characters separated by single hyphens')
    .max(120, 'Slug must not exceed 120 characters')
    .optional(),
  description: z
    .string()
    .trim()
    .max(1000, 'Description must not exceed 1000 characters')
    .nullable()
    .optional(),
  parentId: z.string().cuid('Parent ID must be a valid CUID').nullable().optional(),
  imageUrl: z
    .string()
    .trim()
    .url('Image URL must be a valid URL')
    .nullable()
    .optional()
    .or(z.literal('')),
  isActive: z.boolean().optional().default(true),
  displayOrder: z.number().int().min(0, 'Display order must be non-negative').optional().default(0),
});

export const updateCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name cannot be empty')
    .max(100, 'Name must not exceed 100 characters')
    .optional(),
  slug: z
    .string()
    .trim()
    .regex(SLUG_REGEX, 'Slug must be lowercase alphanumeric characters separated by single hyphens')
    .max(120, 'Slug must not exceed 120 characters')
    .optional(),
  description: z
    .string()
    .trim()
    .max(1000, 'Description must not exceed 1000 characters')
    .nullable()
    .optional(),
  parentId: z.string().cuid('Parent ID must be a valid CUID').nullable().optional(),
  imageUrl: z
    .string()
    .trim()
    .url('Image URL must be a valid URL')
    .nullable()
    .optional()
    .or(z.literal('')),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().min(0, 'Display order must be non-negative').optional(),
});

export const reorderCategoryItemSchema = z.object({
  id: z.string().min(1, 'Category ID is required'),
  displayOrder: z.number().int().min(0, 'Display order must be non-negative'),
});

export const reorderCategoriesSchema = z.object({
  items: z.array(reorderCategoryItemSchema).min(1, 'At least one item is required to reorder'),
});

export const categoryFilterSchema = z.object({
  search: z.string().trim().optional(),
  parentId: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// -------------------------------------------------------------
// Brand Schemas
// -------------------------------------------------------------

export const createBrandSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must not exceed 100 characters'),
  slug: z
    .string()
    .trim()
    .regex(SLUG_REGEX, 'Slug must be lowercase alphanumeric characters separated by single hyphens')
    .max(120, 'Slug must not exceed 120 characters')
    .optional(),
  logoUrl: z
    .string()
    .trim()
    .url('Logo URL must be a valid URL')
    .nullable()
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .trim()
    .max(1000, 'Description must not exceed 1000 characters')
    .nullable()
    .optional(),
  websiteUrl: z
    .string()
    .trim()
    .url('Website URL must be a valid URL')
    .nullable()
    .optional()
    .or(z.literal('')),
  isActive: z.boolean().optional().default(true),
});

export const updateBrandSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name cannot be empty')
    .max(100, 'Name must not exceed 100 characters')
    .optional(),
  slug: z
    .string()
    .trim()
    .regex(SLUG_REGEX, 'Slug must be lowercase alphanumeric characters separated by single hyphens')
    .max(120, 'Slug must not exceed 120 characters')
    .optional(),
  logoUrl: z
    .string()
    .trim()
    .url('Logo URL must be a valid URL')
    .nullable()
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .trim()
    .max(1000, 'Description must not exceed 1000 characters')
    .nullable()
    .optional(),
  websiteUrl: z
    .string()
    .trim()
    .url('Website URL must be a valid URL')
    .nullable()
    .optional()
    .or(z.literal('')),
  isActive: z.boolean().optional(),
});

export const brandFilterSchema = z.object({
  search: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;
export type ReorderCategoriesInput = z.input<typeof reorderCategoriesSchema>;
export type CategoryFilterInput = z.infer<typeof categoryFilterSchema>;

export type CreateBrandInput = z.input<typeof createBrandSchema>;
export type UpdateBrandInput = z.input<typeof updateBrandSchema>;
export type BrandFilterInput = z.infer<typeof brandFilterSchema>;

// -------------------------------------------------------------
// Product, Variant, and Image Schemas (Phase 4B)
// -------------------------------------------------------------

export const SKU_REGEX = /^[A-Z0-9_-]+$/;

export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

export const specificationItemSchema = z.object({
  group: z
    .string()
    .trim()
    .min(1, 'Specification group is required')
    .max(50, 'Group must not exceed 50 characters'),
  name: z
    .string()
    .trim()
    .min(1, 'Specification name is required')
    .max(50, 'Name must not exceed 50 characters'),
  value: z
    .string()
    .trim()
    .min(1, 'Specification value is required')
    .max(200, 'Value must not exceed 200 characters'),
});

export const createProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(150, 'Name must not exceed 150 characters'),
  slug: z
    .string()
    .trim()
    .regex(SLUG_REGEX, 'Slug must be lowercase alphanumeric characters separated by single hyphens')
    .max(150, 'Slug must not exceed 150 characters')
    .optional(),
  summary: z
    .string()
    .trim()
    .max(300, 'Summary must not exceed 300 characters')
    .nullable()
    .optional(),
  description: z
    .string()
    .trim()
    .max(10000, 'Description must not exceed 10000 characters')
    .nullable()
    .optional(),
  categoryId: z.string().min(1, 'Category ID is required'),
  brandId: z.string().nullable().optional(),
  featured: z.boolean().optional().default(false),
  warranty: z
    .string()
    .trim()
    .max(100, 'Warranty must not exceed 100 characters')
    .nullable()
    .optional(),
  specifications: z
    .array(specificationItemSchema)
    .max(50, 'Maximum 50 specifications allowed')
    .nullable()
    .optional(),
  // Optional initial default variant
  initialVariant: z
    .object({
      sku: z
        .string()
        .trim()
        .min(3, 'SKU must be at least 3 characters')
        .max(50, 'SKU must not exceed 50 characters')
        .transform(normalizeSku)
        .refine(
          (val) => SKU_REGEX.test(val),
          'SKU must only contain uppercase letters, numbers, hyphens, and underscores',
        )
        .optional(),
      price: z.number().int().min(1, 'Price must be greater than zero poisha'),
      compareAtPrice: z
        .number()
        .int()
        .min(1, 'Compare-at price must be greater than zero poisha')
        .nullable()
        .optional(),
      costPrice: z.number().int().min(0, 'Cost price must be non-negative').nullable().optional(),
      barcode: z.string().trim().max(50).nullable().optional(),
      initialStock: z
        .number()
        .int('Initial stock must be an integer')
        .min(0, 'Initial stock cannot be negative')
        .optional()
        .default(0),
      lowStockThreshold: z
        .number()
        .int('Low-stock threshold must be an integer')
        .min(0, 'Low-stock threshold must be non-negative')
        .optional()
        .default(5),
    })
    .optional(),
});

export const updateProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name cannot be empty')
    .max(150, 'Name must not exceed 150 characters')
    .optional(),
  slug: z
    .string()
    .trim()
    .regex(SLUG_REGEX, 'Slug must be lowercase alphanumeric characters separated by single hyphens')
    .max(150, 'Slug must not exceed 150 characters')
    .optional(),
  summary: z
    .string()
    .trim()
    .max(300, 'Summary must not exceed 300 characters')
    .nullable()
    .optional(),
  description: z
    .string()
    .trim()
    .max(10000, 'Description must not exceed 10000 characters')
    .nullable()
    .optional(),
  categoryId: z.string().min(1, 'Category ID cannot be empty').optional(),
  brandId: z.string().nullable().optional(),
  featured: z.boolean().optional(),
  warranty: z
    .string()
    .trim()
    .max(100, 'Warranty must not exceed 100 characters')
    .nullable()
    .optional(),
  specifications: z
    .array(specificationItemSchema)
    .max(50, 'Maximum 50 specifications allowed')
    .nullable()
    .optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

export const productFilterSchema = z.object({
  search: z.string().trim().optional(),
  categoryId: z.string().trim().optional(),
  brandId: z.string().trim().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  featured: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'createdAt', 'publishedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const createVariantSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(3, 'SKU must be at least 3 characters')
    .max(50, 'SKU must not exceed 50 characters')
    .transform(normalizeSku)
    .refine(
      (val) => SKU_REGEX.test(val),
      'SKU must only contain uppercase letters, numbers, hyphens, and underscores',
    ),
  name: z
    .string()
    .trim()
    .min(1, 'Variant name is required')
    .max(100, 'Variant name must not exceed 100 characters'),
  price: z.number().int().min(1, 'Price must be greater than zero poisha'),
  compareAtPrice: z
    .number()
    .int()
    .min(1, 'Compare-at price must be greater than zero poisha')
    .nullable()
    .optional(),
  costPrice: z.number().int().min(0, 'Cost price must be non-negative').nullable().optional(),
  barcode: z.string().trim().max(50).nullable().optional(),
  attributes: z.record(z.string(), z.string()).optional().default({}),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  initialStock: z
    .number()
    .int('Initial stock must be an integer')
    .min(0, 'Initial stock cannot be negative')
    .optional()
    .default(0),
  lowStockThreshold: z
    .number()
    .int('Low-stock threshold must be an integer')
    .min(0, 'Low-stock threshold must be non-negative')
    .optional()
    .default(5),
});

export const updateVariantSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(3, 'SKU must be at least 3 characters')
    .max(50, 'SKU must not exceed 50 characters')
    .transform(normalizeSku)
    .refine(
      (val) => SKU_REGEX.test(val),
      'SKU must only contain uppercase letters, numbers, hyphens, and underscores',
    )
    .optional(),
  name: z
    .string()
    .trim()
    .min(1, 'Variant name cannot be empty')
    .max(100, 'Variant name must not exceed 100 characters')
    .optional(),
  price: z.number().int().min(1, 'Price must be greater than zero poisha').optional(),
  compareAtPrice: z
    .number()
    .int()
    .min(1, 'Compare-at price must be greater than zero poisha')
    .nullable()
    .optional(),
  costPrice: z.number().int().min(0, 'Cost price must be non-negative').nullable().optional(),
  barcode: z.string().trim().max(50).nullable().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  reason: z.string().trim().max(255).optional(), // Audit note for price adjustment
});

export const createImageSchema = z.object({
  url: z.string().trim().url('Image URL must be a valid URL'),
  publicId: z.string().trim().max(255).nullable().optional(),
  altText: z.string().trim().max(255).nullable().optional(),
  displayOrder: z.number().int().min(0).optional().default(0),
  isPrimary: z.boolean().optional().default(false),
});

export const reorderImagesSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1, 'Image ID is required'),
        displayOrder: z.number().int().min(0),
      }),
    )
    .min(1, 'At least one image item is required to reorder'),
});

export type CreateProductInput = z.input<typeof createProductSchema>;
export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type ProductFilterInput = z.infer<typeof productFilterSchema>;

export type CreateVariantInput = z.input<typeof createVariantSchema>;
export type UpdateVariantInput = z.input<typeof updateVariantSchema>;

export type CreateImageInput = z.input<typeof createImageSchema>;
export type ReorderImagesInput = z.input<typeof reorderImagesSchema>;

// -------------------------------------------------------------
// Storefront Public Catalogue Schemas
// -------------------------------------------------------------

export const storefrontProductFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: z.preprocess(
    (val) =>
      val === 'true' || val === true ? true : val === 'false' || val === false ? false : undefined,
    z.boolean().optional(),
  ),
  featured: z.preprocess(
    (val) =>
      val === 'true' || val === true ? true : val === 'false' || val === false ? false : undefined,
    z.boolean().optional(),
  ),
  sort: z
    .enum(['featured', 'newest', 'price-asc', 'price-desc', 'name-asc', 'name-desc'])
    .default('featured'),
});

export type StorefrontProductFilterInput = z.infer<typeof storefrontProductFilterSchema>;
