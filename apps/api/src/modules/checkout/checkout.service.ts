import { prisma } from '../../lib/prisma.js';
import { shippingService } from '../cart/shipping.service.js';
import type {
  CheckoutValidationInput,
  CheckoutValidationResult,
  CheckoutValidationIssue,
  CheckoutItemSummary,
  SelectedAddressSummary,
  AppliedCouponSummary,
} from './checkout.schemas.js';

export class CheckoutService {
  /**
   * Strictly read-only checkout pre-validation.
   * Performs zero database mutations.
   */
  async validateCheckout(
    userId: string,
    input: CheckoutValidationInput,
  ): Promise<CheckoutValidationResult> {
    const issues: CheckoutValidationIssue[] = [];

    // 1. Resolve Customer Cart (Read-Only)
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: {
        coupon: true,
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    category: true,
                    brand: true,
                    images: {
                      orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
                      take: 1,
                    },
                  },
                },
                inventoryItem: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const cartItems = cart?.items ?? [];

    if (cartItems.length === 0) {
      issues.push({
        type: 'EMPTY_CART',
        message: 'Your shopping cart is empty.',
      });

      return {
        isValid: false,
        canProceed: false,
        hasPriceChanges: false,
        requiresPriceAcknowledgement: false,
        hasUnavailableItems: false,
        hasInsufficientStock: false,
        issues,
        items: [],
        summary: {
          itemCount: 0,
          totalQuantity: 0,
          merchandiseSubtotal: 0,
          discount: 0,
          shippingFee: 0,
          finalTotal: 0,
          isFreeShipping: false,
          freeShippingThreshold: 500000,
          freeShippingRemaining: 500000,
        },
        address: null,
        coupon: null,
        couponNotice: null,
      };
    }

    // 2. Resolve Selected Address (Read-Only In-Memory Resolution)
    let selectedAddress: SelectedAddressSummary | null = null;
    let isAddressValid = false;

    if (input.addressId) {
      const address = await prisma.address.findFirst({
        where: { id: input.addressId, userId },
      });

      if (!address) {
        issues.push({
          type: 'INVALID_ADDRESS',
          message: 'The selected delivery address could not be found.',
        });
      } else {
        selectedAddress = {
          id: address.id,
          recipientName: address.recipientName,
          phone: address.phone,
          divisionId: address.divisionId,
          districtId: address.districtId,
          upazila: address.upazila,
          streetAddress: address.streetAddress,
          postalCode: address.postalCode,
          label: address.label,
          isDefault: address.isDefault,
        };
        isAddressValid = true;
      }
    } else {
      // Fallback in memory to default saved address
      const defaultAddress = await prisma.address.findFirst({
        where: { userId, isDefault: true },
      });

      if (defaultAddress) {
        selectedAddress = {
          id: defaultAddress.id,
          recipientName: defaultAddress.recipientName,
          phone: defaultAddress.phone,
          divisionId: defaultAddress.divisionId,
          districtId: defaultAddress.districtId,
          upazila: defaultAddress.upazila,
          streetAddress: defaultAddress.streetAddress,
          postalCode: defaultAddress.postalCode,
          label: defaultAddress.label,
          isDefault: defaultAddress.isDefault,
        };
        isAddressValid = true;
      } else {
        issues.push({
          type: 'ADDRESS_REQUIRED',
          message: 'Please select or add a delivery address to complete checkout.',
        });
      }
    }

    // 3. Process Items, Availability, Stock, and Live Prices
    let hasUnavailableItems = false;
    let hasInsufficientStock = false;
    let hasPriceChanges = false;

    const items: CheckoutItemSummary[] = cartItems.map((item) => {
      const variant = item.variant;
      const product = variant.product;
      const inventory = variant.inventoryItem;

      const physicalStock = inventory?.quantity ?? 0;
      const reservedStock = inventory?.reservedQuantity ?? 0;
      const availableStock = Math.max(0, physicalStock - reservedStock);

      const livePrice = variant.price;
      const unitPriceAtAdd = item.unitPriceAtAdd;
      const itemHasPriceChanged = livePrice !== unitPriceAtAdd;
      const priceDifference = livePrice - unitPriceAtAdd;

      if (itemHasPriceChanged) {
        hasPriceChanges = true;
        issues.push({
          type: 'PRICE_CHANGE',
          itemId: item.id,
          variantId: variant.id,
          message: `Price for "${product.name}" has been updated from ৳${(unitPriceAtAdd / 100).toLocaleString()} to ৳${(livePrice / 100).toLocaleString()}.`,
        });
      }

      // Check Phase 4D 4-point publication criteria
      const isProductPublished = product.status === 'PUBLISHED';
      const isCategoryActive = product.category.isActive;
      const isBrandActive = product.brand === null || product.brand.isActive;
      const isVariantActive = variant.isActive;

      const isPublicationSatisfied =
        isProductPublished && isCategoryActive && isBrandActive && isVariantActive;

      const isAvailable = isPublicationSatisfied && availableStock > 0;
      const isQuantityValid = isAvailable && item.quantity <= availableStock;

      if (!isAvailable) {
        hasUnavailableItems = true;
        issues.push({
          type: 'UNAVAILABLE',
          itemId: item.id,
          variantId: variant.id,
          message: `"${product.name}" is currently unavailable for purchase.`,
        });
      } else if (!isQuantityValid) {
        hasInsufficientStock = true;
        issues.push({
          type: 'INSUFFICIENT_STOCK',
          itemId: item.id,
          variantId: variant.id,
          message: `Insufficient stock for "${product.name}". Only ${availableStock} unit(s) available.`,
        });
      }

      const primaryImage = product.images?.[0] ?? null;

      return {
        id: item.id,
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        sku: variant.sku,
        variantName: variant.name,
        attributes: (variant.attributes as Record<string, unknown>) ?? {},
        primaryImage: primaryImage
          ? {
              id: primaryImage.id,
              url: primaryImage.url,
              altText: primaryImage.altText,
            }
          : null,
        quantity: item.quantity,
        unitPrice: livePrice,
        oldUnitPrice: unitPriceAtAdd,
        hasPriceChanged: itemHasPriceChanged,
        priceDifference,
        availableStock,
        isAvailable,
        isQuantityValid,
        lineTotal: item.quantity * livePrice,
      };
    });

    // 4. Subtotal & Totals Calculation (using live prices)
    const merchandiseSubtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
    const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);

    // 5. Provisional Coupon Validation (Read-Only)
    let discount = 0;
    let appliedCoupon: AppliedCouponSummary | null = null;
    let couponNotice: string | null = null;
    let isCouponValid = true;

    if (cart?.coupon) {
      const now = new Date();
      const coupon = cart.coupon;

      if (!coupon.isActive) {
        isCouponValid = false;
        couponNotice = 'This coupon is no longer active.';
      } else if (now < coupon.startDate) {
        isCouponValid = false;
        couponNotice = 'This coupon is not valid yet.';
      } else if (now > coupon.endDate) {
        isCouponValid = false;
        couponNotice = 'This coupon has expired.';
      } else if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
        isCouponValid = false;
        couponNotice = 'This coupon has reached its maximum global usage limit.';
      } else if (merchandiseSubtotal <= 0) {
        isCouponValid = false;
        couponNotice = 'Coupon cannot be applied to an empty order.';
      } else if (coupon.minOrderAmount !== null && merchandiseSubtotal < coupon.minOrderAmount) {
        isCouponValid = false;
        const minTaka = (coupon.minOrderAmount / 100).toLocaleString();
        couponNotice = `Order minimum of ৳${minTaka} required for coupon ${coupon.code}.`;
      } else if (coupon.perCustomerLimit !== null) {
        const userUsage = await prisma.couponUsage.count({
          where: { couponId: coupon.id, userId },
        });
        if (userUsage >= coupon.perCustomerLimit) {
          isCouponValid = false;
          couponNotice = `You have already used coupon ${coupon.code} the maximum allowed number of times.`;
        }
      }

      if (isCouponValid) {
        if (coupon.discountType === 'PERCENTAGE') {
          const rawDiscount = Math.round((merchandiseSubtotal * coupon.discountValue) / 100);
          const cappedDiscount =
            coupon.maxDiscountAmount !== null && coupon.maxDiscountAmount > 0
              ? Math.min(rawDiscount, coupon.maxDiscountAmount)
              : rawDiscount;
          discount = Math.min(cappedDiscount, merchandiseSubtotal);
        } else {
          discount = Math.min(coupon.discountValue, merchandiseSubtotal);
        }

        appliedCoupon = {
          id: coupon.id,
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          discountAmount: discount,
          description: coupon.description,
        };
      } else {
        issues.push({
          type: 'COUPON_INVALID',
          message: couponNotice ?? 'Coupon cannot be applied.',
        });
      }
    }

    // 6. In-Memory Shipping Calculation directly from selected address (Clarification #2)
    const resolvedDistrict = selectedAddress ? selectedAddress.districtId : null;
    const shipping = shippingService.calculateShipping(merchandiseSubtotal, resolvedDistrict);
    const shippingFee = shipping.isEstimated ? shipping.shippingFee : 0;

    const merchandisePayable = Math.max(0, merchandiseSubtotal - discount);
    const finalTotal = items.length > 0 ? merchandisePayable + shippingFee : 0;

    // 7. Overall Readiness Determination (Clarification #1)
    // Note: Price change alone does NOT make isValid false; requiresPriceAcknowledgement is flagged.
    const isValid =
      items.length > 0 &&
      !hasUnavailableItems &&
      !hasInsufficientStock &&
      isAddressValid &&
      isCouponValid;

    return {
      isValid,
      canProceed: isValid,
      hasPriceChanges,
      requiresPriceAcknowledgement: hasPriceChanges,
      hasUnavailableItems,
      hasInsufficientStock,
      issues,
      items,
      summary: {
        itemCount: items.length,
        totalQuantity,
        merchandiseSubtotal,
        discount,
        shippingFee,
        finalTotal,
        isFreeShipping: shipping.isFreeShipping,
        freeShippingThreshold: shipping.freeShippingThreshold,
        freeShippingRemaining: shipping.amountNeededForFreeShipping,
      },
      address: selectedAddress,
      coupon: appliedCoupon,
      couponNotice,
    };
  }
}

export const checkoutService = new CheckoutService();
