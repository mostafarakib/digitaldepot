import type { Prisma } from '../../generated/client/client.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import type { CouponSnapshot } from './order.types.js';

export interface ConsumeCouponParams {
  couponId: string;
  userId: string;
  orderId?: string | null;
  subtotal: number;
}

export class OrderCouponService {
  /**
   * Concurrency-safe coupon consumption using row locking (SELECT FOR UPDATE).
   * Atomically validates active status, date range, minimum subtotal, global limit,
   * and per-customer limit before incrementing usageCount and recording CouponUsage.
   */
  async consumeCoupon(
    tx: Prisma.TransactionClient,
    params: {
      couponId: string;
      userId: string;
      orderId?: string | null;
      subtotal: number;
    },
  ): Promise<CouponSnapshot> {
    // 1. Lock the coupon row to prevent concurrent limit bypass
    await tx.$executeRaw`SELECT id FROM "Coupon" WHERE id = ${params.couponId} FOR UPDATE`;

    const coupon = await tx.coupon.findUnique({
      where: { id: params.couponId },
    });

    if (!coupon) {
      throw new NotFoundError('COUPON_NOT_FOUND', 'Coupon not found');
    }

    if (!coupon.isActive) {
      throw new BadRequestError('COUPON_INACTIVE', 'This coupon is no longer active.');
    }

    const now = new Date();
    if (now < coupon.startDate) {
      throw new BadRequestError('COUPON_NOT_STARTED', 'This coupon is not valid yet.');
    }

    if (now > coupon.endDate) {
      throw new BadRequestError('COUPON_EXPIRED', 'This coupon has expired.');
    }

    if (coupon.minOrderAmount !== null && params.subtotal < coupon.minOrderAmount) {
      const minTaka = (coupon.minOrderAmount / 100).toLocaleString();
      throw new BadRequestError(
        'COUPON_MIN_ORDER_NOT_MET',
        `Order minimum of ৳${minTaka} required for coupon ${coupon.code}.`,
      );
    }

    // 2. Validate global usage limit
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      throw new BadRequestError(
        'COUPON_USAGE_LIMIT_EXCEEDED',
        'This coupon has reached its maximum global usage limit.',
      );
    }

    // 3. Validate per-customer usage limit
    if (coupon.perCustomerLimit !== null) {
      const customerUsageCount = await tx.couponUsage.count({
        where: { couponId: coupon.id, userId: params.userId },
      });

      if (customerUsageCount >= coupon.perCustomerLimit) {
        throw new BadRequestError(
          'COUPON_CUSTOMER_LIMIT_EXCEEDED',
          `You have already used coupon ${coupon.code} the maximum allowed number of times.`,
        );
      }
    }

    // 4. Calculate exact discount amount
    let discountAmount = 0;
    if (coupon.discountType === 'PERCENTAGE') {
      const rawDiscount = Math.round((params.subtotal * coupon.discountValue) / 100);
      const cappedDiscount =
        coupon.maxDiscountAmount !== null && coupon.maxDiscountAmount > 0
          ? Math.min(rawDiscount, coupon.maxDiscountAmount)
          : rawDiscount;
      discountAmount = Math.min(cappedDiscount, params.subtotal);
    } else {
      discountAmount = Math.min(coupon.discountValue, params.subtotal);
    }

    // 5. Atomically increment global usage count
    await tx.coupon.update({
      where: { id: coupon.id },
      data: { usageCount: { increment: 1 } },
    });

    // 6. Record immutable coupon usage linkage to order
    await tx.couponUsage.create({
      data: {
        couponId: coupon.id,
        userId: params.userId,
        orderId: params.orderId ?? null,
      },
    });

    return {
      couponId: coupon.id,
      couponCode: coupon.code,
      couponDiscountType: coupon.discountType,
      couponDiscountValue: coupon.discountValue,
      couponDiscountAmount: discountAmount,
    };
  }

  /**
   * Idempotent coupon release.
   * If a coupon was consumed for this order, restores the usage count and removes the usage record.
   * Safe to call multiple times without error or double-decrement.
   */
  async releaseCoupon(tx: Prisma.TransactionClient, orderId: string): Promise<boolean> {
    const usage = await tx.couponUsage.findFirst({
      where: { orderId },
    });

    if (!usage) {
      return false;
    }

    // Lock coupon row for decrement
    await tx.$executeRaw`SELECT id FROM "Coupon" WHERE id = ${usage.couponId} FOR UPDATE`;

    const coupon = await tx.coupon.findUnique({
      where: { id: usage.couponId },
    });

    if (coupon && coupon.usageCount > 0) {
      await tx.coupon.update({
        where: { id: usage.couponId },
        data: { usageCount: { decrement: 1 } },
      });
    }

    await tx.couponUsage.delete({
      where: { id: usage.id },
    });

    return true;
  }
}

export const orderCouponService = new OrderCouponService();
