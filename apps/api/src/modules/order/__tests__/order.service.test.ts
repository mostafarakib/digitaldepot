import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool } from '../../../test/setup.js';
import { orderService } from '../order.service.js';
import { generateTransactionId } from '../order.utils.js';

describe('OrderService', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPool.end();
  });

  async function createCustomerFixture(initialPrice = 100000, initialStock = 10) {
    const timestamp = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const user = await prisma.user.create({
      data: {
        email: `cust-${timestamp}@example.com`,
        passwordHash: 'dummyhash',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    const address = await prisma.address.create({
      data: {
        userId: user.id,
        recipientName: 'Tanvir Ahmed',
        phone: '+8801700000001',
        divisionId: 'DHAKA',
        districtId: 'DHAKA',
        upazila: 'Dhanmondi',
        streetAddress: 'House 12, Road 5',
        isDefault: true,
      },
    });

    const category = await prisma.category.create({
      data: {
        name: `Electronics ${timestamp}`,
        slug: `elec-${timestamp}`,
        isActive: true,
      },
    });

    const product = await prisma.product.create({
      data: {
        name: `Smartphone ${timestamp}`,
        slug: `phone-${timestamp}`,
        categoryId: category.id,
        status: 'PUBLISHED',
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `SKU-${timestamp}`,
        name: 'Black / 128GB',
        price: initialPrice,
        isActive: true,
        attributes: { Color: 'Black', Storage: '128GB' },
      },
    });

    const inventoryItem = await prisma.inventoryItem.create({
      data: {
        variantId: variant.id,
        quantity: initialStock,
        reservedQuantity: 0,
      },
    });

    const cart = await prisma.cart.create({
      data: {
        userId: user.id,
        items: {
          create: {
            variantId: variant.id,
            quantity: 2,
            unitPriceAtAdd: initialPrice,
          },
        },
      },
    });

    return { user, address, category, product, variant, inventoryItem, cart };
  }

  describe('createOrderCore', () => {
    it('creates a COD order with CONFIRMED status, immediate physical stock deduction, snapshots, payment record, and clears cart', async () => {
      const fixture = await createCustomerFixture(100000, 10);

      const order = await orderService.createOrderCore({
        userId: fixture.user.id,
        addressId: fixture.address.id,
        paymentMethod: 'COD',
        deliveryNotes: 'Leave with reception',
      });

      // 1. Verify Order metadata & snapshot
      expect(order.orderNumber).toMatch(/^DD-[0-9]{8}-[0-9A-Z]{8}$/);
      expect(order.status).toBe('CONFIRMED');
      expect(order.paymentStatus).toBe('PENDING');
      expect(order.paymentMethod).toBe('COD');
      expect(order.paymentExpiresAt).toBeNull();
      expect(order.shippingRecipientName).toBe('Tanvir Ahmed');
      expect(order.shippingDeliveryNotes).toBe('Leave with reception');
      expect(order.shippingDistrictId).toBe('DHAKA');

      // 2. Financial totals: 2 * 1,000 = 2,000; shipping inside Dhaka = 60
      expect(order.merchandiseSubtotal).toBe(200000);
      expect(order.shippingFee).toBe(6000);
      expect(order.discountAmount).toBe(0);
      expect(order.totalPayable).toBe(206000);

      // 3. Item snapshots
      expect(order.items).toHaveLength(1);
      const item = order.items[0];
      expect(item.productName).toBe(fixture.product.name);
      expect(item.variantTitle).toBe(fixture.variant.name);
      expect(item.unitPrice).toBe(100000);
      expect(item.quantity).toBe(2);
      expect(item.lineTotal).toBe(200000);
      expect(item.attributes).toEqual({ Color: 'Black', Storage: '128GB' });

      // 4. Inventory immediate deduction & audit log
      const inventory = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: fixture.variant.id },
      });
      expect(inventory.quantity).toBe(8); // 10 - 2
      expect(inventory.reservedQuantity).toBe(0);

      const adjustments = await prisma.inventoryAdjustment.findMany({
        where: { inventoryItemId: inventory.id },
      });
      expect(adjustments).toHaveLength(1);
      expect(adjustments[0].type).toBe('ORDER_FULFILLMENT');
      expect(adjustments[0].quantityDelta).toBe(-2);
      expect(adjustments[0].adjustedByUserId).toBe(fixture.user.id);

      // 5. Initial Payment record
      expect(order.payments).toHaveLength(1);
      const payment = order.payments[0];
      expect(payment.method).toBe('COD');
      expect(payment.status).toBe('PENDING');
      expect(payment.amount).toBe(206000);
      expect(payment.transactionId).toMatch(/^TXN-[0-9]{8}-[0-9A-Z]{8}$/);

      // 6. Status History
      expect(order.statusHistory).toHaveLength(1);
      expect(order.statusHistory[0].toStatus).toBe('CONFIRMED');

      // 7. Cart emptied
      const cartItems = await prisma.cartItem.findMany({
        where: { cartId: fixture.cart.id },
      });
      expect(cartItems).toHaveLength(0);
    });

    it('creates an online order (SSLCOMMERZ) with PENDING status, 30-min expiration, and stock reservation', async () => {
      const fixture = await createCustomerFixture(100000, 10);

      const beforeTime = Date.now();
      const order = await orderService.createOrderCore({
        userId: fixture.user.id,
        addressId: fixture.address.id,
        paymentMethod: 'SSLCOMMERZ',
      });

      expect(order.status).toBe('PENDING');
      expect(order.paymentStatus).toBe('PENDING');
      expect(order.paymentMethod).toBe('SSLCOMMERZ');
      expect(order.paymentExpiresAt).not.toBeNull();

      const expirationTime = order.paymentExpiresAt!.getTime();
      expect(expirationTime).toBeGreaterThanOrEqual(beforeTime + 29 * 60 * 1000);
      expect(expirationTime).toBeLessThanOrEqual(beforeTime + 31 * 60 * 1000);

      // Physical stock remains 10, reservedQuantity is 2
      const inventory = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: fixture.variant.id },
      });
      expect(inventory.quantity).toBe(10);
      expect(inventory.reservedQuantity).toBe(2);

      // No inventory adjustment audit created during reservation
      const adjustments = await prisma.inventoryAdjustment.findMany({
        where: { inventoryItemId: inventory.id },
      });
      expect(adjustments).toHaveLength(0);
    });

    it('enforces live price change acknowledgement', async () => {
      const fixture = await createCustomerFixture(100000, 10);

      // Update variant price live from 1,000 to 1,200
      await prisma.productVariant.update({
        where: { id: fixture.variant.id },
        data: { price: 120000 },
      });

      // Without acknowledgement -> should throw PRICE_CHANGE_ACKNOWLEDGEMENT_REQUIRED
      await expect(
        orderService.createOrderCore({
          userId: fixture.user.id,
          addressId: fixture.address.id,
          paymentMethod: 'COD',
          acknowledgedLivePrices: false,
        }),
      ).rejects.toThrow('Prices have changed since items were added to cart');

      // With acknowledgement -> should succeed and capture live price 120,000
      const order = await orderService.createOrderCore({
        userId: fixture.user.id,
        addressId: fixture.address.id,
        paymentMethod: 'COD',
        acknowledgedLivePrices: true,
      });

      expect(order.items[0].unitPrice).toBe(120000);
      expect(order.merchandiseSubtotal).toBe(240000);
    });

    it('consumes coupon atomically and records snapshot and usage', async () => {
      const fixture = await createCustomerFixture(100000, 10);
      const now = new Date();

      const coupon = await prisma.coupon.create({
        data: {
          code: 'DISCOUNT10',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          isActive: true,
        },
      });

      await prisma.cart.update({
        where: { id: fixture.cart.id },
        data: { couponId: coupon.id },
      });

      const order = await orderService.createOrderCore({
        userId: fixture.user.id,
        addressId: fixture.address.id,
        paymentMethod: 'COD',
      });

      expect(order.couponId).toBe(coupon.id);
      expect(order.couponCode).toBe('DISCOUNT10');
      expect(order.couponDiscountAmount).toBe(20000); // 10% of 200,000
      expect(order.discountAmount).toBe(20000);
      expect(order.totalPayable).toBe(186000); // 200,000 - 20,000 + 6,000 shipping

      const couponInDb = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
      expect(couponInDb.usageCount).toBe(1);

      const usage = await prisma.couponUsage.findFirst({
        where: { orderId: order.id },
      });
      expect(usage).not.toBeNull();
      expect(usage?.userId).toBe(fixture.user.id);
    });

    it('enforces database partial unique index preventing more than one PAID payment on the same order', async () => {
      const fixture = await createCustomerFixture(100000, 10);
      const order = await orderService.createOrderCore({
        userId: fixture.user.id,
        addressId: fixture.address.id,
        paymentMethod: 'SSLCOMMERZ',
      });

      // Mark first payment as PAID
      await prisma.payment.update({
        where: { id: order.payments[0].id },
        data: { status: 'PAID', paidAt: new Date() },
      });

      // Attempt creating a second PAID payment on the same order
      await expect(
        prisma.payment.create({
          data: {
            orderId: order.id,
            transactionId: generateTransactionId(),
            method: 'SSLCOMMERZ',
            status: 'PAID',
            amount: order.totalPayable,
            paidAt: new Date(),
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('cancelOrderCore', () => {
    it('customer cancels eligible unpaid COD order: restores stock with audit and releases coupon', async () => {
      const fixture = await createCustomerFixture(100000, 10);

      // Create COD order
      const order = await orderService.createOrderCore({
        userId: fixture.user.id,
        addressId: fixture.address.id,
        paymentMethod: 'COD',
      });

      // Stock was reduced to 8
      const invBeforeCancel = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: fixture.variant.id },
      });
      expect(invBeforeCancel.quantity).toBe(8);

      // Customer cancels
      const cancelled = await orderService.cancelOrderCore({
        orderId: order.id,
        userId: fixture.user.id,
        reason: 'Changed mind',
      });

      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.paymentStatus).toBe('CANCELLED');
      expect(cancelled.cancellationReason).toBe('Changed mind');

      // Physical stock restored to 10
      const invAfterCancel = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: fixture.variant.id },
      });
      expect(invAfterCancel.quantity).toBe(10);

      // Audit log has ORDER_CANCELLATION
      const cancelAdjustment = await prisma.inventoryAdjustment.findFirst({
        where: { inventoryItemId: invAfterCancel.id, type: 'ORDER_CANCELLATION' },
      });
      expect(cancelAdjustment).not.toBeNull();
      expect(cancelAdjustment?.quantityDelta).toBe(2);
      expect(cancelAdjustment?.adjustedByUserId).toBe(fixture.user.id);
    });

    it('rejects cancellation of paid order with message mentioning Phase 7 refund requirement', async () => {
      const fixture = await createCustomerFixture(100000, 10);
      const order = await orderService.createOrderCore({
        userId: fixture.user.id,
        addressId: fixture.address.id,
        paymentMethod: 'SSLCOMMERZ',
      });

      // Mark order payment as PAID
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'PAID' },
      });

      await expect(
        orderService.cancelOrderCore({
          orderId: order.id,
          userId: fixture.user.id,
          reason: 'I want a refund',
        }),
      ).rejects.toThrow(
        'Paid orders cannot be cancelled before refund processing is implemented in Phase 7',
      );
    });

    it('rejects cancellation of another customer order', async () => {
      const fixture = await createCustomerFixture(100000, 10);
      const otherUser = await prisma.user.create({
        data: {
          email: 'stranger@example.com',
          passwordHash: 'dummyhash',
          role: 'CUSTOMER',
          status: 'ACTIVE',
        },
      });

      const order = await orderService.createOrderCore({
        userId: fixture.user.id,
        addressId: fixture.address.id,
        paymentMethod: 'COD',
      });

      await expect(
        orderService.cancelOrderCore({
          orderId: order.id,
          userId: otherUser.id,
          reason: 'Malicious cancel',
        }),
      ).rejects.toThrow('You are not authorized to cancel this order');
    });

    it('admin cancellation attributes inventory restoration to adminUserId', async () => {
      const fixture = await createCustomerFixture(100000, 10);
      const admin = await prisma.user.create({
        data: {
          email: 'admin@digitaldepot.com',
          passwordHash: 'adminhash',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });

      const order = await orderService.createOrderCore({
        userId: fixture.user.id,
        addressId: fixture.address.id,
        paymentMethod: 'COD',
      });

      await orderService.cancelOrderCore({
        orderId: order.id,
        reason: 'Customer phoned support',
        isAdmin: true,
        adminUserId: admin.id,
      });

      const cancelAdjustment = await prisma.inventoryAdjustment.findFirst({
        where: { type: 'ORDER_CANCELLATION' },
      });
      expect(cancelAdjustment?.adjustedByUserId).toBe(admin.id);
    });
  });

  describe('compensateOrderInitiationFailure', () => {
    it('compensates online order initiation failure by releasing reservation, coupon, and marking FAILED', async () => {
      const fixture = await createCustomerFixture(100000, 10);
      const order = await orderService.createOrderCore({
        userId: fixture.user.id,
        addressId: fixture.address.id,
        paymentMethod: 'SSLCOMMERZ',
      });

      // Stock was reserved (reservedQuantity = 2)
      const invBefore = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: fixture.variant.id },
      });
      expect(invBefore.reservedQuantity).toBe(2);

      const compensated = await orderService.compensateOrderInitiationFailure({
        orderId: order.id,
        reason: 'SSLCommerz session creation timeout',
      });

      expect(compensated?.status).toBe('CANCELLED');
      expect(compensated?.paymentStatus).toBe('FAILED');

      // Reservation released
      const invAfter = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: fixture.variant.id },
      });
      expect(invAfter.reservedQuantity).toBe(0);
    });
  });
});
