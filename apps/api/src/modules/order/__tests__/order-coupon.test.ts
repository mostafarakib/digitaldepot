import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool } from '../../../test/setup.js';
import { orderCouponService } from '../order-coupon.service.js';
import { generateOrderNumber } from '../order.utils.js';

describe('OrderCouponService', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPool.end();
  });

  async function createCustomer(email: string) {
    return await prisma.user.create({
      data: {
        email,
        passwordHash: 'dummyhash',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
  }

  async function createTestOrder(userId: string) {
    return await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
        paymentMethod: 'COD',
        merchandiseSubtotal: 50000,
        discountAmount: 0,
        shippingFee: 6000,
        totalPayable: 56000,
        shippingRecipientName: 'Customer',
        shippingPhone: '+8801700000000',
        shippingDivisionId: 'DHAKA',
        shippingDistrictId: 'DHAKA',
        shippingUpazila: 'Dhanmondi',
        shippingStreetAddress: 'Street 1',
      },
    });
  }

  async function createCoupon(
    overrides?: Partial<Parameters<typeof prisma.coupon.create>[0]['data']>,
  ) {
    const timestamp = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date();

    return await prisma.coupon.create({
      data: {
        code: `COUPON-${timestamp}`,
        discountType: 'PERCENTAGE',
        discountValue: 10,
        startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        usageLimit: 100,
        usageCount: 0,
        perCustomerLimit: 1,
        isActive: true,
        ...overrides,
      },
    });
  }

  describe('consumeCoupon', () => {
    it('successfully consumes a valid coupon and records CouponUsage', async () => {
      const user = await createCustomer('user1@example.com');
      const order = await createTestOrder(user.id);
      const coupon = await createCoupon({ discountType: 'FIXED_AMOUNT', discountValue: 5000 });

      const snapshot = await prisma.$transaction(async (tx) => {
        return await orderCouponService.consumeCoupon(tx, {
          couponId: coupon.id,
          userId: user.id,
          orderId: order.id,
          subtotal: 50000,
        });
      });

      expect(snapshot.couponId).toBe(coupon.id);
      expect(snapshot.couponCode).toBe(coupon.code);
      expect(snapshot.couponDiscountAmount).toBe(5000);

      const updatedCoupon = await prisma.coupon.findUniqueOrThrow({
        where: { id: coupon.id },
      });
      expect(updatedCoupon.usageCount).toBe(1);

      const usages = await prisma.couponUsage.findMany({
        where: { couponId: coupon.id },
      });
      expect(usages).toHaveLength(1);
      expect(usages[0].userId).toBe(user.id);
      expect(usages[0].orderId).toBe(order.id);
    });

    it('rejects coupon if inactive', async () => {
      const user = await createCustomer('user2@example.com');
      const coupon = await createCoupon({ isActive: false });

      await expect(
        prisma.$transaction(async (tx) => {
          await orderCouponService.consumeCoupon(tx, {
            couponId: coupon.id,
            userId: user.id,
            subtotal: 50000,
          });
        }),
      ).rejects.toThrow('This coupon is no longer active');
    });

    it('rejects coupon if global usage limit is reached', async () => {
      const user = await createCustomer('user3@example.com');
      const coupon = await createCoupon({ usageLimit: 1, usageCount: 1 });

      await expect(
        prisma.$transaction(async (tx) => {
          await orderCouponService.consumeCoupon(tx, {
            couponId: coupon.id,
            userId: user.id,
            subtotal: 50000,
          });
        }),
      ).rejects.toThrow('maximum global usage limit');
    });

    it('rejects coupon if customer usage limit is reached', async () => {
      const user = await createCustomer('user4@example.com');
      const coupon = await createCoupon({ perCustomerLimit: 1 });

      // First consumption
      await prisma.$transaction(async (tx) => {
        await orderCouponService.consumeCoupon(tx, {
          couponId: coupon.id,
          userId: user.id,
          subtotal: 50000,
        });
      });

      // Second consumption attempt by same user
      await expect(
        prisma.$transaction(async (tx) => {
          await orderCouponService.consumeCoupon(tx, {
            couponId: coupon.id,
            userId: user.id,
            subtotal: 50000,
          });
        }),
      ).rejects.toThrow('maximum allowed number of times');
    });

    it('atomically enforces global usage limit under concurrent consumption', async () => {
      const user1 = await createCustomer('concurrent1@example.com');
      const user2 = await createCustomer('concurrent2@example.com');

      // Coupon with global limit of 1
      const coupon = await createCoupon({
        usageLimit: 1,
        usageCount: 0,
        perCustomerLimit: 2,
      });

      // Attempt two concurrent consumptions
      const results = await Promise.allSettled([
        prisma.$transaction(async (tx) => {
          return await orderCouponService.consumeCoupon(tx, {
            couponId: coupon.id,
            userId: user1.id,
            subtotal: 50000,
          });
        }),
        prisma.$transaction(async (tx) => {
          return await orderCouponService.consumeCoupon(tx, {
            couponId: coupon.id,
            userId: user2.id,
            subtotal: 50000,
          });
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly one must succeed, exactly one must fail
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const updatedCoupon = await prisma.coupon.findUniqueOrThrow({
        where: { id: coupon.id },
      });
      expect(updatedCoupon.usageCount).toBe(1);
    });
  });

  describe('releaseCoupon', () => {
    it('idempotently restores coupon usage count and removes usage record', async () => {
      const user = await createCustomer('release@example.com');
      const order = await createTestOrder(user.id);
      const coupon = await createCoupon();

      await prisma.$transaction(async (tx) => {
        await orderCouponService.consumeCoupon(tx, {
          couponId: coupon.id,
          userId: user.id,
          orderId: order.id,
          subtotal: 50000,
        });
      });

      const beforeRelease = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
      expect(beforeRelease.usageCount).toBe(1);

      // First release
      const firstRelease = await prisma.$transaction(async (tx) => {
        return await orderCouponService.releaseCoupon(tx, order.id);
      });
      expect(firstRelease).toBe(true);

      const afterRelease = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
      expect(afterRelease.usageCount).toBe(0);

      // Second release (idempotent no-op)
      const secondRelease = await prisma.$transaction(async (tx) => {
        return await orderCouponService.releaseCoupon(tx, order.id);
      });
      expect(secondRelease).toBe(false);

      const afterSecondRelease = await prisma.coupon.findUniqueOrThrow({
        where: { id: coupon.id },
      });
      expect(afterSecondRelease.usageCount).toBe(0);
    });
  });
});
