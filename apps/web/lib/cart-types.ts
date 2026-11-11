export interface CartItemProduct {
  id: string;
  name: string;
  slug: string;
  status: string;
  brand: { id: string; name: string; slug: string } | null;
  primaryImage: { id: string; url: string; altText: string | null } | null;
}

export interface CartItemVariant {
  id: string;
  sku: string;
  name: string;
  attributes: Record<string, string> | unknown;
  isActive: boolean;
}

export interface CartItem {
  id: string;
  variantId: string;
  quantity: number;
  unitPrice: number; // Integer BDT poisha
  unitPriceAtAdd: number; // Informational snapshot in integer BDT poisha
  hasPriceChanged: boolean;
  priceDifference: number; // Positive = price increased, Negative = price decreased
  availableStock: number;
  isAvailable: boolean;
  isQuantityValid: boolean;
  lineTotal: number; // Integer BDT poisha
  product: CartItemProduct;
  variant: CartItemVariant;
}

export interface AppliedCoupon {
  id: string;
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  discountAmount: number; // in poisha
  description?: string | null;
}

export interface ShippingEstimate {
  district: string | null;
  isInsideDhaka: boolean | null;
  standardFee: number; // Integer BDT poisha (6000 or 12000 or 0)
  shippingFee: number; // Integer BDT poisha (0 if free, else standardFee)
  isFreeShipping: boolean;
  freeShippingThreshold: number; // Integer BDT poisha (500000)
  amountNeededForFreeShipping: number; // Integer BDT poisha
  freeShippingProgressPercent: number; // 0..100
  isEstimated: boolean;
}

export interface CartData {
  id: string | null;
  items: CartItem[];
  itemCount: number; // Number of unique items
  totalQuantity: number; // Sum of quantities
  subtotal: number; // Integer BDT poisha
  discount: number; // Integer BDT poisha
  shipping: ShippingEstimate;
  total: number; // Integer BDT poisha (subtotal - discount + shippingFee)
  hasUnavailableItems: boolean;
  hasPriceChanges: boolean;
  coupon: AppliedCoupon | null;
  couponNotice?: string | null;
}

export interface AddToCartInput {
  variantId: string;
  quantity?: number;
}

export interface EstimateShippingInput {
  district?: string;
  addressId?: string;
}

export interface UpdateCartItemInput {
  quantity: number;
}
