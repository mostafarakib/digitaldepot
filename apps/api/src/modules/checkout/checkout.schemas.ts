import { z } from 'zod';

export const checkoutValidationSchema = z.object({
  addressId: z.string().trim().min(1, 'Address ID is required').optional(),
});

export type CheckoutValidationInput = z.infer<typeof checkoutValidationSchema>;

export type CheckoutIssueType =
  | 'EMPTY_CART'
  | 'ADDRESS_REQUIRED'
  | 'INVALID_ADDRESS'
  | 'UNAVAILABLE'
  | 'INSUFFICIENT_STOCK'
  | 'PRICE_CHANGE'
  | 'COUPON_INVALID';

export interface CheckoutValidationIssue {
  type: CheckoutIssueType;
  message: string;
  itemId?: string;
  variantId?: string;
}

export interface CheckoutItemSummary {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  sku: string;
  variantName: string | null;
  attributes: Record<string, unknown>;
  primaryImage: {
    id: string;
    url: string;
    altText: string | null;
  } | null;
  quantity: number;
  unitPrice: number; // Current live price
  oldUnitPrice: number; // Unit price at add
  hasPriceChanged: boolean;
  priceDifference: number;
  availableStock: number;
  isAvailable: boolean;
  isQuantityValid: boolean;
  lineTotal: number;
}

export interface SelectedAddressSummary {
  id: string;
  recipientName: string;
  phone: string;
  divisionId: string;
  districtId: string;
  upazila: string;
  streetAddress: string;
  postalCode: string | null;
  label: string | null;
  isDefault: boolean;
}

export interface AppliedCouponSummary {
  id: string;
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  discountAmount: number;
  description: string | null;
}

export interface CheckoutValidationResult {
  isValid: boolean; // Overall readiness (cart non-empty, items available, stock sufficient, address valid, coupon valid)
  canProceed: boolean; // Same as isValid
  hasPriceChanges: boolean;
  requiresPriceAcknowledgement: boolean;
  hasUnavailableItems: boolean;
  hasInsufficientStock: boolean;
  issues: CheckoutValidationIssue[];
  items: CheckoutItemSummary[];
  summary: {
    itemCount: number;
    totalQuantity: number;
    merchandiseSubtotal: number;
    discount: number;
    shippingFee: number;
    finalTotal: number;
    isFreeShipping: boolean;
    freeShippingThreshold: number;
    freeShippingRemaining: number;
  };
  address: SelectedAddressSummary | null;
  coupon: AppliedCouponSummary | null;
  couponNotice: string | null;
}
