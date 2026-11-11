import { prisma } from '../../lib/prisma.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import type { Coupon, Prisma } from '../../generated/client/client.js';
import type {
  AdminCreateCouponInput,
  AdminUpdateCouponInput,
  AdminCouponQueryInput,
} from './coupon.schemas.js';

export interface ValidatedCouponResult {
  coupon: Coupon;
  discount: number;
}

export class CouponService {
  /**
   * List coupons with filtering, search, and pagination for Admin
   */
  async listCoupons(query: AdminCouponQueryInput) {
    const { page, limit, q, status, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: Prisma.CouponWhereInput = {};

    // Search query on code or description
    if (q) {
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    // Status filter
    if (status === 'active') {
      where.isActive = true;
      where.startDate = { lte: now };
      where.endDate = { gte: now };
    } else if (status === 'expired') {
      where.endDate = { lt: now };
    } else if (status === 'upcoming') {
      where.startDate = { gt: now };
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    const [items, total] = await Promise.all([
      prisma.coupon.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: { usages: true },
          },
        },
      }),
      prisma.coupon.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get coupon by ID
   */
  async getCouponById(id: string) {
    const coupon = await prisma.coupon.findUnique({
      where: { id },
      include: {
        _count: {
          select: { usages: true },
        },
      },
    });

    if (!coupon) {
      throw new NotFoundError('COUPON_NOT_FOUND', `Coupon with ID "${id}" was not found`);
    }

    return coupon;
  }

  /**
   * Create a new coupon
   */
  async createCoupon(input: AdminCreateCouponInput) {
    const existing = await prisma.coupon.findUnique({
      where: { code: input.code },
    });

    if (existing) {
      throw new ConflictError(
        'COUPON_CODE_EXISTS',
        `A coupon with code "${input.code}" already exists`,
      );
    }

    return prisma.coupon.create({
      data: {
        code: input.code,
        description: input.description ?? null,
        discountType: input.discountType,
        discountValue: input.discountValue,
        maxDiscountAmount: input.maxDiscountAmount ?? null,
        minOrderAmount: input.minOrderAmount ?? null,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        usageLimit: input.usageLimit ?? null,
        perCustomerLimit: input.perCustomerLimit ?? 1,
        isActive: input.isActive,
      },
    });
  }

  /**
   * Update coupon with effective configuration validation (Clarification #2)
   */
  async updateCoupon(id: string, input: AdminUpdateCouponInput) {
    const existing = await this.getCouponById(id);

    // If updating code, verify uniqueness
    if (input.code && input.code !== existing.code) {
      const codeConflict = await prisma.coupon.findUnique({
        where: { code: input.code },
      });
      if (codeConflict) {
        throw new ConflictError(
          'COUPON_CODE_EXISTS',
          `A coupon with code "${input.code}" already exists`,
        );
      }
    }

    // Merged effective configuration validation
    const effectiveDiscountType = input.discountType ?? existing.discountType;
    const effectiveDiscountValue = input.discountValue ?? existing.discountValue;
    const effectiveMaxDiscount =
      input.maxDiscountAmount !== undefined ? input.maxDiscountAmount : existing.maxDiscountAmount;
    const effectiveStartDate = input.startDate ? new Date(input.startDate) : existing.startDate;
    const effectiveEndDate = input.endDate ? new Date(input.endDate) : existing.endDate;

    // 1. Percentage discount must remain 1-100
    if (
      effectiveDiscountType === 'PERCENTAGE' &&
      (effectiveDiscountValue < 1 || effectiveDiscountValue > 100)
    ) {
      throw new BadRequestError(
        'INVALID_DISCOUNT_VALUE',
        'Percentage discount value must remain between 1 and 100',
      );
    }

    // 2. maxDiscountAmount is applicable only to PERCENTAGE coupons
    if (
      effectiveDiscountType === 'FIXED_AMOUNT' &&
      effectiveMaxDiscount !== null &&
      effectiveMaxDiscount !== undefined
    ) {
      throw new BadRequestError(
        'INVALID_MAX_DISCOUNT',
        'Maximum discount amount is applicable only to percentage coupons',
      );
    }

    // 3. endDate must remain later than startDate
    if (effectiveEndDate <= effectiveStartDate) {
      throw new BadRequestError('INVALID_DATE_RANGE', 'End date must remain later than start date');
    }

    return prisma.coupon.update({
      where: { id },
      data: {
        ...(input.code && { code: input.code }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.discountType && { discountType: input.discountType }),
        ...(input.discountValue !== undefined && { discountValue: input.discountValue }),
        ...(input.maxDiscountAmount !== undefined && {
          maxDiscountAmount: input.maxDiscountAmount,
        }),
        ...(input.minOrderAmount !== undefined && { minOrderAmount: input.minOrderAmount }),
        ...(input.startDate && { startDate: new Date(input.startDate) }),
        ...(input.endDate && { endDate: new Date(input.endDate) }),
        ...(input.usageLimit !== undefined && { usageLimit: input.usageLimit }),
        ...(input.perCustomerLimit !== undefined && { perCustomerLimit: input.perCustomerLimit }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
  }

  /**
   * Toggle active state
   */
  async toggleActive(id: string) {
    const existing = await this.getCouponById(id);
    return prisma.coupon.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });
  }

  /**
   * Delete coupon safely (prevents hard deletion if usage history exists)
   */
  async deleteCoupon(id: string) {
    const existing = await this.getCouponById(id);

    const usageCount = await prisma.couponUsage.count({
      where: { couponId: id },
    });

    if (usageCount > 0 || existing.usageCount > 0) {
      throw new ConflictError(
        'COUPON_HAS_USAGE_HISTORY',
        'Cannot delete coupon with recorded usage history. You can deactivate it instead.',
      );
    }

    return prisma.coupon.delete({
      where: { id },
    });
  }

  /**
   * Evaluates coupon eligibility and calculates provisional discount.
   * Does NOT consume usage or insert CouponUsage records.
   */
  async validateCouponEligibility(
    code: string,
    subtotal: number,
    userId?: string,
  ): Promise<ValidatedCouponResult> {
    const normalizedCode = code.trim().toUpperCase();

    const coupon = await prisma.coupon.findUnique({
      where: { code: normalizedCode },
    });

    if (!coupon) {
      throw new NotFoundError('COUPON_NOT_FOUND', 'Coupon code is invalid');
    }

    if (!coupon.isActive) {
      throw new BadRequestError('COUPON_INACTIVE', 'This coupon is no longer active');
    }

    const now = new Date();
    if (now < coupon.startDate) {
      throw new BadRequestError('COUPON_NOT_STARTED', 'This coupon is not valid yet');
    }

    if (now > coupon.endDate) {
      throw new BadRequestError('COUPON_EXPIRED', 'This coupon has expired');
    }

    // Global usage limit check
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      throw new BadRequestError(
        'COUPON_LIMIT_REACHED',
        'This coupon has reached its maximum usage limit',
      );
    }

    // Per-customer usage limit check (enforced only for authenticated customers; deferred for guests)
    if (userId && coupon.perCustomerLimit !== null) {
      const userUsageCount = await prisma.couponUsage.count({
        where: { couponId: coupon.id, userId },
      });

      if (userUsageCount >= coupon.perCustomerLimit) {
        throw new BadRequestError(
          'COUPON_CUSTOMER_LIMIT_REACHED',
          'You have already used this coupon the maximum allowed number of times',
        );
      }
    }

    // Cart subtotal eligibility
    if (subtotal <= 0) {
      throw new BadRequestError('CART_EMPTY', 'Cannot apply coupon to an empty cart');
    }

    if (coupon.minOrderAmount !== null && subtotal < coupon.minOrderAmount) {
      const requiredTaka = (coupon.minOrderAmount / 100).toLocaleString();
      throw new BadRequestError(
        'MINIMUM_ORDER_NOT_MET',
        `Minimum order amount of ৳${requiredTaka} is required for this coupon`,
      );
    }

    // Calculate provisional discount in integer BDT poisha
    let discount = 0;
    if (coupon.discountType === 'PERCENTAGE') {
      const raw = Math.round((subtotal * coupon.discountValue) / 100);
      const capped =
        coupon.maxDiscountAmount !== null && coupon.maxDiscountAmount > 0
          ? Math.min(raw, coupon.maxDiscountAmount)
          : raw;
      discount = Math.min(capped, subtotal);
    } else {
      // FIXED_AMOUNT
      discount = Math.min(coupon.discountValue, subtotal);
    }

    return { coupon, discount };
  }
}

export const couponService = new CouponService();
