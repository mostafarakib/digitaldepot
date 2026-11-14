import { SHIPPING_CONFIG } from './shipping.config.js';
import type { ShippingConfig } from '../settings/settings.service.js';

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
  estimatedDaysMin: number;
  estimatedDaysMax: number;
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
   * Calculates shipping fees, free shipping eligibility, and delivery estimates.
   * Free shipping is based on merchandise subtotal BEFORE coupon discount.
   * Resolves dynamic rates from store settings when supplied, falling back to authoritative defaults.
   */
  calculateShipping(
    subtotal: number,
    district: string | null | undefined,
    config?: Partial<ShippingConfig>,
  ): ShippingEstimate {
    const normalizedDistrict = this.normalizeDistrict(district);

    const insideDhakaFee = config?.insideDhakaShippingFee ?? SHIPPING_CONFIG.INSIDE_DHAKA_FEE;
    const outsideDhakaFee = config?.outsideDhakaShippingFee ?? SHIPPING_CONFIG.OUTSIDE_DHAKA_FEE;
    const freeThreshold = config?.freeShippingThreshold ?? SHIPPING_CONFIG.FREE_SHIPPING_THRESHOLD;
    const daysInsideMin = config?.estimatedDaysInsideDhakaMin ?? 2;
    const daysInsideMax = config?.estimatedDaysInsideDhakaMax ?? 3;
    const daysOutsideMin = config?.estimatedDaysOutsideDhakaMin ?? 3;
    const daysOutsideMax = config?.estimatedDaysOutsideDhakaMax ?? 5;

    const isFreeShipping = subtotal >= freeThreshold;
    const amountNeededForFreeShipping = Math.max(0, freeThreshold - subtotal);
    const freeShippingProgressPercent =
      freeThreshold > 0 ? Math.min(100, Math.round((subtotal / freeThreshold) * 100)) : 100;

    // If district is provided:
    if (normalizedDistrict) {
      const insideDhaka = normalizedDistrict === SHIPPING_CONFIG.DHAKA_DISTRICT_KEY;
      const standardFee = insideDhaka ? insideDhakaFee : outsideDhakaFee;
      const shippingFee = isFreeShipping ? 0 : standardFee;
      const estimatedDaysMin = insideDhaka ? daysInsideMin : daysOutsideMin;
      const estimatedDaysMax = insideDhaka ? daysInsideMax : daysOutsideMax;

      return {
        district: normalizedDistrict,
        isInsideDhaka: insideDhaka,
        standardFee,
        shippingFee,
        isFreeShipping,
        freeShippingThreshold: freeThreshold,
        amountNeededForFreeShipping,
        freeShippingProgressPercent,
        isEstimated: true,
        estimatedDaysMin,
        estimatedDaysMax,
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
        freeShippingThreshold: freeThreshold,
        amountNeededForFreeShipping: 0,
        freeShippingProgressPercent: 100,
        isEstimated: true, // Qualified nationwide
        estimatedDaysMin: daysInsideMin,
        estimatedDaysMax: daysOutsideMax,
      };
    }

    // Subtotal under threshold and no district estimated yet:
    return {
      district: null,
      isInsideDhaka: null,
      standardFee: 0,
      shippingFee: 0,
      isFreeShipping: false,
      freeShippingThreshold: freeThreshold,
      amountNeededForFreeShipping,
      freeShippingProgressPercent,
      isEstimated: false,
      estimatedDaysMin: daysInsideMin,
      estimatedDaysMax: daysOutsideMax,
    };
  }
}

export const shippingService = new ShippingService();
