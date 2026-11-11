import { SHIPPING_CONFIG } from './shipping.config.js';

export interface ShippingEstimate {
  district: string | null;
  isInsideDhaka: boolean | null;
  standardFee: number;
  shippingFee: number;
  isFreeShipping: boolean;
  freeShippingThreshold: number;
  amountNeededForFreeShipping: number;
  freeShippingProgressPercent: number;
  isEstimated: boolean;
}

export class ShippingService {
  /**
   * Normalizes district string to uppercase trimmed ID.
   */
  normalizeDistrict(district: string | null | undefined): string | null {
    if (!district) return null;
    const trimmed = district.trim().toUpperCase();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Checks whether the normalized district is Inside Dhaka.
   */
  isInsideDhaka(district: string | null | undefined): boolean {
    const normalized = this.normalizeDistrict(district);
    return normalized === SHIPPING_CONFIG.DHAKA_DISTRICT_KEY;
  }

  /**
   * Calculates shipping fees and eligibility.
   * Free shipping is based on merchandise subtotal BEFORE coupon discount.
   */
  calculateShipping(subtotal: number, district: string | null | undefined): ShippingEstimate {
    const normalizedDistrict = this.normalizeDistrict(district);
    const isFreeShipping = subtotal >= SHIPPING_CONFIG.FREE_SHIPPING_THRESHOLD;
    const amountNeededForFreeShipping = Math.max(
      0,
      SHIPPING_CONFIG.FREE_SHIPPING_THRESHOLD - subtotal,
    );
    const freeShippingProgressPercent = Math.min(
      100,
      Math.round((subtotal / SHIPPING_CONFIG.FREE_SHIPPING_THRESHOLD) * 100),
    );

    // If district is provided:
    if (normalizedDistrict) {
      const insideDhaka = normalizedDistrict === SHIPPING_CONFIG.DHAKA_DISTRICT_KEY;
      const standardFee = insideDhaka
        ? SHIPPING_CONFIG.INSIDE_DHAKA_FEE
        : SHIPPING_CONFIG.OUTSIDE_DHAKA_FEE;
      const shippingFee = isFreeShipping ? 0 : standardFee;

      return {
        district: normalizedDistrict,
        isInsideDhaka: insideDhaka,
        standardFee,
        shippingFee,
        isFreeShipping,
        freeShippingThreshold: SHIPPING_CONFIG.FREE_SHIPPING_THRESHOLD,
        amountNeededForFreeShipping,
        freeShippingProgressPercent,
        isEstimated: true,
      };
    }

    // No district provided yet:
    // If subtotal qualifies for free shipping, it's free nationwide!
    if (isFreeShipping) {
      return {
        district: null,
        isInsideDhaka: null,
        standardFee: 0,
        shippingFee: 0,
        isFreeShipping: true,
        freeShippingThreshold: SHIPPING_CONFIG.FREE_SHIPPING_THRESHOLD,
        amountNeededForFreeShipping: 0,
        freeShippingProgressPercent: 100,
        isEstimated: true, // Qualified nationwide
      };
    }

    // Subtotal under threshold and no district estimated yet:
    return {
      district: null,
      isInsideDhaka: null,
      standardFee: 0,
      shippingFee: 0,
      isFreeShipping: false,
      freeShippingThreshold: SHIPPING_CONFIG.FREE_SHIPPING_THRESHOLD,
      amountNeededForFreeShipping,
      freeShippingProgressPercent,
      isEstimated: false,
    };
  }
}

export const shippingService = new ShippingService();
