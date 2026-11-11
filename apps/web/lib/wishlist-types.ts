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
  addedAt: string;
  product: WishlistProductData;
}

export interface WishlistResponseData {
  items: WishlistItemData[];
  productIds: string[];
  itemCount: number;
}
