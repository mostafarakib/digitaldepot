import { z } from 'zod';

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// -------------------------------------------------------------
// Category Types & Schemas
// -------------------------------------------------------------

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  imageUrl: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  parent?: { id: string; name: string; slug: string } | null;
  _count?: { children: number };
}

export interface CategoryTreeNode extends CategoryItem {
  children: CategoryTreeNode[];
}

export const categoryFormSchema = z.object({
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
    .or(z.literal(''))
    .optional(),
  description: z
    .string()
    .trim()
    .max(1000, 'Description must not exceed 1000 characters')
    .optional(),
  parentId: z.string().optional().nullable(),
  imageUrl: z.string().trim().url('Must be a valid URL').or(z.literal('')).optional().nullable(),
  isActive: z.boolean(),
  displayOrder: z.number().int().min(0, 'Display order must be 0 or greater'),
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;

// -------------------------------------------------------------
// Brand Types & Schemas
// -------------------------------------------------------------

export interface BrandItem {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  websiteUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const brandFormSchema = z.object({
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
    .or(z.literal(''))
    .optional(),
  logoUrl: z.string().trim().url('Must be a valid URL').or(z.literal('')).optional().nullable(),
  description: z
    .string()
    .trim()
    .max(1000, 'Description must not exceed 1000 characters')
    .optional(),
  websiteUrl: z.string().trim().url('Must be a valid URL').or(z.literal('')).optional().nullable(),
  isActive: z.boolean(),
});

export type BrandFormValues = z.infer<typeof brandFormSchema>;

// -------------------------------------------------------------
// Product, Variant, Image, and Price History (Phase 4B)
// -------------------------------------------------------------

export type ProductStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export const SKU_REGEX = /^[A-Z0-9_-]+$/;

export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

/**
 * Converts integer minor units (poisha) to major currency units (BDT).
 * 100 poisha = ৳1.00
 */
export function poishaToBdt(poisha: number): number {
  return poisha / 100;
}

/**
 * Converts major currency units (BDT) to integer minor units (poisha).
 * ৳1.00 = 100 poisha
 */
export function bdtToPoisha(bdt: number): number {
  return Math.round(bdt * 100);
}

/**
 * Formats integer poisha as Bangladeshi Taka string (e.g. ৳1,200.00).
 */
export function formatBdt(poisha: number, locale = 'en-US'): string {
  const bdt = poishaToBdt(poisha);
  return new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    style: 'currency',
    currency: 'BDT',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(bdt);
}

export interface ProductSpecification {
  group: string;
  name: string;
  value: string;
}

export interface ProductImageItem {
  id: string;
  productId: string;
  url: string;
  publicId: string | null;
  altText: string | null;
  displayOrder: number;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PriceHistoryItem {
  id: string;
  variantId: string;
  oldPrice: number; // In poisha
  newPrice: number; // In poisha
  oldCompareAt: number | null;
  newCompareAt: number | null;
  oldCostPrice: number | null;
  newCostPrice: number | null;
  reason: string | null;
  changedByUserId: string | null;
  changedByUser?: {
    id: string;
    email: string;
    profile?: {
      firstName: string | null;
      lastName: string | null;
    } | null;
  } | null;
  createdAt: string;
}

export interface ProductVariantItem {
  id: string;
  productId: string;
  sku: string;
  name: string;
  price: number; // In poisha
  compareAtPrice: number | null; // In poisha
  costPrice: number | null; // In poisha
  barcode: string | null;
  attributes: Record<string, string>;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    priceHistory: number;
  };
  priceHistory?: PriceHistoryItem[];
  inventoryItem?: {
    id: string;
    quantity: number;
    reservedQuantity: number;
    lowStockThreshold: number | null;
  } | null;
}

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  categoryId: string;
  brandId: string | null;
  status: ProductStatus;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  category: { id: string; name: string; slug: string; isActive: boolean };
  brand: { id: string; name: string; slug: string; isActive: boolean } | null;
  images: ProductImageItem[];
  variants: ProductVariantItem[];
  _count: {
    variants: number;
    images: number;
  };
}

export interface ProductDetailItem {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  description: string | null;
  categoryId: string;
  brandId: string | null;
  status: ProductStatus;
  featured: boolean;
  warranty: string | null;
  specifications: ProductSpecification[] | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  category: { id: string; name: string; slug: string; isActive: boolean };
  brand: { id: string; name: string; slug: string; isActive: boolean } | null;
  images: ProductImageItem[];
  variants: ProductVariantItem[];
}

export const specificationItemSchema = z.object({
  group: z.string().trim().min(1, 'Group is required').max(50, 'Group max 50 chars'),
  name: z.string().trim().min(1, 'Name is required').max(50, 'Name max 50 chars'),
  value: z.string().trim().min(1, 'Value is required').max(200, 'Value max 200 chars'),
});

export const productFormSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(150, 'Name max 150 chars'),
  slug: z
    .string()
    .trim()
    .regex(SLUG_REGEX, 'Slug must be lowercase alphanumeric characters separated by single hyphens')
    .max(150, 'Slug max 150 chars')
    .or(z.literal(''))
    .optional(),
  summary: z.string().trim().max(300, 'Summary max 300 chars').optional(),
  description: z.string().trim().max(10000, 'Description max 10000 chars').optional(),
  categoryId: z.string().min(1, 'Category is required'),
  brandId: z.string().optional().nullable(),
  featured: z.boolean(),
  warranty: z.string().trim().max(100, 'Warranty max 100 chars').optional(),
  specifications: z.array(specificationItemSchema).optional(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

export const variantFormSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(3, 'SKU must be at least 3 characters')
    .max(50, 'SKU max 50 chars')
    .transform(normalizeSku)
    .refine(
      (val) => SKU_REGEX.test(val),
      'SKU can only contain uppercase letters, numbers, hyphens, and underscores',
    ),
  name: z.string().trim().min(1, 'Variant name is required').max(100, 'Variant name max 100 chars'),
  priceBdt: z.number().min(0.01, 'Price must be greater than zero'),
  compareAtPriceBdt: z.number().min(0.01).optional().nullable(),
  costPriceBdt: z.number().min(0).optional().nullable(),
  barcode: z.string().trim().max(50).optional().nullable(),
  attributesText: z.string().optional(), // key:value per line
  isDefault: z.boolean(),
  isActive: z.boolean(),
  reason: z.string().trim().max(255).optional(),
});

export type VariantFormValues = z.infer<typeof variantFormSchema>;

export type InventoryAdjustmentType =
  'RECEIVE' | 'CORRECTION' | 'DAMAGE' | 'THEFT_LOSS' | 'RETURN_RESTOCK';

export interface InventoryAdjustmentItem {
  id: string;
  inventoryItemId: string;
  type: InventoryAdjustmentType;
  quantityDelta: number;
  oldQuantity: number;
  newQuantity: number;
  reason: string;
  adjustedByUserId: string | null;
  adjustedByUser?: {
    id: string;
    email: string;
    profile?: {
      firstName: string | null;
      lastName: string | null;
    } | null;
  } | null;
  createdAt: string;
}

export interface InventoryListItem {
  id: string;
  variantId: string;
  quantity: number; // Physical on-hand stock
  reservedQuantity: number;
  available: number; // Derived: quantity - reservedQuantity
  lowStockThreshold: number | null;
  isLowStock: boolean;
  isOutOfStock: boolean;
  createdAt: string;
  updatedAt: string;
  variant: {
    id: string;
    sku: string;
    name: string;
    price: number;
    isDefault: boolean;
    isActive: boolean;
    product: {
      id: string;
      name: string;
      slug: string;
      status: ProductStatus;
      category: { id: string; name: string };
      images: { url: string }[];
    };
  };
}

export interface InventorySummary {
  totalTrackedVariants: number;
  totalOnHandUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
}

// -------------------------------------------------------------
// Storefront Public Discovery Types (Phase 4D)
// -------------------------------------------------------------

export interface StorefrontProductSummary {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  featured: boolean;
  publishedAt: string | null;
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
  defaultVariantId?: string | null;
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
  publishedAt: string | null;
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
    price: number; // in poisha
    compareAtPrice: number | null;
    attributes: Record<string, string>;
    isDefault: boolean;
    availableStock: number;
    isOutOfStock: boolean;
  }>;
  isInStock: boolean;
  defaultVariantId: string;
}

export interface StorefrontFacetCategory {
  id: string;
  name: string;
  slug: string;
  count: number;
}

export interface StorefrontFacetBrand {
  id: string;
  name: string;
  slug: string;
  count: number;
}

export interface StorefrontFacets {
  categories: StorefrontFacetCategory[];
  brands: StorefrontFacetBrand[];
  priceRange: {
    min: number;
    max: number;
  };
}

export interface StorefrontProductListingResponse {
  products: StorefrontProductSummary[];
  facets: StorefrontFacets;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}
