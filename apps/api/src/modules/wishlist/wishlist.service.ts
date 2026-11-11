import { prisma } from '../../lib/prisma.js';
import { validateStorefrontVisibility } from '../catalogue/product.service.js';

export interface WishlistProductData {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  featured: boolean;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  brand: {
    id: string;
    name: string;
    slug: string;
  } | null;
  primaryImage: {
    id: string;
    url: string;
    altText: string | null;
  } | null;
  minPrice: number;
  maxPrice: number;
  compareAtPrice: number | null;
  isInStock: boolean;
  totalAvailableStock: number;
  variantCount: number;
  defaultVariantId: string | null;
  isStorefrontVisible: boolean;
}

export interface WishlistItemData {
  id: string;
  productId: string;
  addedAt: Date;
  product: WishlistProductData;
}

export interface WishlistResponseData {
  items: WishlistItemData[];
  productIds: string[];
  itemCount: number;
}

export class WishlistService {
  /**
   * Retrieves the customer's wishlist items with populated product metadata.
   */
  async getWishlist(userId: string): Promise<WishlistResponseData> {
    const rawItems = await prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          include: {
            category: { select: { id: true, name: true, slug: true, isActive: true } },
            brand: { select: { id: true, name: true, slug: true, isActive: true } },
            images: {
              orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
              select: { id: true, url: true, altText: true, isPrimary: true },
            },
            variants: {
              where: { isActive: true },
              include: { inventoryItem: true },
              orderBy: [{ isDefault: 'desc' }, { price: 'asc' }],
            },
          },
        },
      },
    });

    const items: WishlistItemData[] = rawItems.map((item) => {
      const prod = item.product;
      const activeVariants = prod.variants;

      const prices = activeVariants.map((v) => v.price);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

      const defaultVariant = activeVariants.find((v) => v.isDefault) || activeVariants[0] || null;
      const compareAtPrice = defaultVariant?.compareAtPrice ?? null;

      const totalAvailableStock = activeVariants.reduce((sum, v) => {
        const available = Math.max(
          0,
          (v.inventoryItem?.quantity ?? 0) - (v.inventoryItem?.reservedQuantity ?? 0),
        );
        return sum + available;
      }, 0);

      const isInStock = totalAvailableStock > 0;
      const primaryImage = prod.images.find((img) => img.isPrimary) || prod.images[0] || null;

      const isStorefrontVisible =
        prod.status === 'PUBLISHED' &&
        prod.category.isActive &&
        (!prod.brand || prod.brand.isActive) &&
        activeVariants.length > 0;

      return {
        id: item.id,
        productId: item.productId,
        addedAt: item.createdAt,
        product: {
          id: prod.id,
          name: prod.name,
          slug: prod.slug,
          summary: prod.summary,
          featured: prod.featured,
          category: {
            id: prod.category.id,
            name: prod.category.name,
            slug: prod.category.slug,
          },
          brand: prod.brand
            ? {
                id: prod.brand.id,
                name: prod.brand.name,
                slug: prod.brand.slug,
              }
            : null,
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
          isStorefrontVisible,
        },
      };
    });

    const productIds = items.map((i) => i.productId);

    return {
      items,
      productIds,
      itemCount: items.length,
    };
  }

  /**
   * Adds a product to the customer's wishlist.
   * Enforces storefront publication visibility (Clarification #1).
   * Uses idempotent upsert to prevent duplicates.
   */
  async addToWishlist(userId: string, productId: string) {
    // Enforce Phase 4D storefront publication visibility
    const visibleProduct = await validateStorefrontVisibility(productId);

    // Idempotent upsert prevents duplicates
    const wishlistItem = await prisma.wishlistItem.upsert({
      where: {
        userId_productId: {
          userId,
          productId: visibleProduct.id,
        },
      },
      create: {
        userId,
        productId: visibleProduct.id,
      },
      update: {},
    });

    return {
      success: true,
      data: wishlistItem,
    };
  }

  /**
   * Removes a product from the customer's wishlist.
   * Does NOT restrict by visibility so customers can remove discontinued products.
   */
  async removeFromWishlist(userId: string, productId: string) {
    await prisma.wishlistItem.deleteMany({
      where: {
        userId,
        productId,
      },
    });

    return {
      success: true,
      message: 'Product removed from wishlist',
    };
  }
}

export const wishlistService = new WishlistService();
