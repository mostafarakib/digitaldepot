import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase } from '../../../test/setup.js';
import { env } from '../../../config/env.js';
import { sslcommerzService } from '../sslcommerz.service.js';
import { productService } from '../../catalogue/product.service.js';
import { categoryService } from '../../catalogue/category.service.js';
import { orderService } from '../../order/order.service.js';

describe('Phase 6C: SSLCommerz Payment Callbacks & IPN Webhook API', () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function setupPendingOnlineOrder(params?: {
    initialPrice?: number;
    initialStock?: number;
    couponDiscount?: number;
  }) {
    const user = await prisma.user.create({
      data: {
        email: `customer-${Date.now()}@example.com`,
        passwordHash: 'hash',
        role: 'CUSTOMER',
        emailVerified: true,
      },
    });

    const category = await categoryService.create({
      name: `Cat-${Date.now()}`,
      slug: `cat-${Date.now()}`,
      isActive: true,
    });

    const product = await productService.create({
      name: `Product-${Date.now()}`,
      summary: 'Product for online payment test',
      categoryId: category.id,
      initialVariant: {
        sku: `SKU-${Date.now()}`,
        price: params?.initialPrice ?? 100000, // ৳1,000
        initialStock: params?.initialStock ?? 10,
      },
    });

    await prisma.product.update({
      where: { id: product.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });

    const fullProduct = await productService.getById(product.id);
    const variant = fullProduct.variants[0];

    const address = await prisma.address.create({
      data: {
        userId: user.id,
        recipientName: 'Tanvir Ahmed',
        phone: '+8801700000001',
        divisionId: 'DHAKA',
        districtId: 'DHAKA',
        upazila: 'Dhanmondi',
        streetAddress: 'Road 4',
        postalCode: '1205',
      },
    });

    let couponId: string | undefined;
    if (params?.couponDiscount) {
      const now = new Date();
      const coupon = await prisma.coupon.create({
        data: {
          code: `SAVE-${Date.now()}`,
          discountType: 'FIXED_AMOUNT',
          discountValue: params.couponDiscount,
          startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          isActive: true,
        },
      });
      couponId = coupon.id;
    }

    await prisma.cart.create({
      data: {
        userId: user.id,
        couponId,
        items: {
          create: {
            variantId: variant.id,
            quantity: 2,
            unitPriceAtAdd: params?.initialPrice ?? 100000,
          },
        },
      },
    });

    // Create online order via orderService.createOrderCore
    const order = await orderService.createOrderCore({
      userId: user.id,
      addressId: address.id,
      paymentMethod: 'SSLCOMMERZ',
    });

    const payment = order.payments[0];
    return { user, variant, address, order, payment };
  }

  describe('1. Authoritative Successful Payment Verification', () => {
    it('verifies payment with gateway, commits reserved stock, and marks order CONFIRMED', async () => {
      const { order, payment, variant } = await setupPendingOnlineOrder({
        initialPrice: 100000,
        initialStock: 10,
      });

      // Total: 2 * 100,000 + 6,000 shipping = 206,000 poysha (৳2,060.00)
      expect(order.totalPayable).toBe(206000);

      // Verify initial reservation state
      const initialInventory = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(initialInventory.quantity).toBe(10);
      expect(initialInventory.reservedQuantity).toBe(2);

      // Mock gateway validation response
      vi.spyOn(sslcommerzService, 'validateOrder').mockResolvedValue({
        status: 'VALID',
        tran_id: payment.transactionId,
        val_id: 'val-success-123',
        amount: '2060.00',
        currency: 'BDT',
        store_id: env.SSLCOMMERZ_STORE_ID,
        bank_tran_id: 'BANK-TRX-7788',
        card_type: 'VISA',
        raw: { status: 'VALID' },
      });

      // Gateway browser redirect callback: POST /api/v1/payments/sslcommerz/success
      const res = await request(app).post('/api/v1/payments/sslcommerz/success').type('form').send({
        val_id: 'val-success-123',
        tran_id: payment.transactionId,
        amount: '2060.00',
      });

      // Browser redirected to frontend payment result with SUCCESS
      expect(res.status).toBe(302);
      expect(res.header.location).toContain('/checkout/payment-result');
      expect(res.header.location).toContain(`orderNumber=${order.orderNumber}`);
      expect(res.header.location).toContain('status=SUCCESS');

      // Database state verification
      const dbOrder = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { payments: true, statusHistory: true },
      });
      expect(dbOrder.status).toBe('CONFIRMED');
      expect(dbOrder.paymentStatus).toBe('PAID');
      expect(dbOrder.paymentExpiresAt).toBeNull();
      expect(dbOrder.payments[0].status).toBe('PAID');
      expect(dbOrder.payments[0].gatewayTransactionId).toBe('BANK-TRX-7788');
      expect(dbOrder.payments[0].paidAt).not.toBeNull();

      // Physical stock committed: quantity decremented from 10 to 8, reservedQuantity freed from 2 to 0
      const finalInventory = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(finalInventory.quantity).toBe(8);
      expect(finalInventory.reservedQuantity).toBe(0);

      // Inventory adjustment audit log
      const fulfillmentAdj = await prisma.inventoryAdjustment.findFirst({
        where: {
          inventoryItemId: finalInventory.id,
          type: 'ORDER_FULFILLMENT',
        },
      });
      expect(fulfillmentAdj).not.toBeNull();
      expect(fulfillmentAdj?.quantityDelta).toBe(-2);
    });

    it('processes server-to-server IPN webhook and returns HTTP 200', async () => {
      const { order, payment } = await setupPendingOnlineOrder({
        initialPrice: 50000,
        initialStock: 5,
      });

      // Total: 2 * 50,000 + 6,000 = 106,000 poysha (৳1,060.00)
      vi.spyOn(sslcommerzService, 'validateOrder').mockResolvedValue({
        status: 'VALIDATED',
        tran_id: payment.transactionId,
        val_id: 'val-ipn-123',
        amount: '1060.00',
        currency: 'BDT',
        store_id: env.SSLCOMMERZ_STORE_ID,
        bank_tran_id: 'BANK-IPN-4455',
        raw: { status: 'VALIDATED' },
      });

      const res = await request(app).post('/api/v1/payments/sslcommerz/ipn').type('form').send({
        val_id: 'val-ipn-123',
        tran_id: payment.transactionId,
        status: 'VALIDATED',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbOrder = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(dbOrder.status).toBe('CONFIRMED');
      expect(dbOrder.paymentStatus).toBe('PAID');
    });
  });

  describe('2. Idempotency & Duplicate Callback Protection (Clarification 5)', () => {
    it('handles duplicate callbacks and IPNs without double-committing stock', async () => {
      const { payment, variant } = await setupPendingOnlineOrder({
        initialPrice: 100000,
        initialStock: 10,
      });

      vi.spyOn(sslcommerzService, 'validateOrder').mockResolvedValue({
        status: 'VALID',
        tran_id: payment.transactionId,
        val_id: 'val-dup-123',
        amount: '2060.00',
        currency: 'BDT',
        store_id: env.SSLCOMMERZ_STORE_ID,
        bank_tran_id: 'BANK-DUP-11',
        raw: { status: 'VALID' },
      });

      // 1. First callback (User browser redirect)
      const res1 = await request(app)
        .post('/api/v1/payments/sslcommerz/success')
        .type('form')
        .send({ val_id: 'val-dup-123', tran_id: payment.transactionId });

      expect(res1.status).toBe(302);
      expect(res1.header.location).toContain('status=SUCCESS');

      // 2. Second callback (Asynchronous IPN from SSLCommerz for same transaction)
      const res2 = await request(app).post('/api/v1/payments/sslcommerz/ipn').type('form').send({
        val_id: 'val-dup-123',
        tran_id: payment.transactionId,
        status: 'VALID',
      });

      expect(res2.status).toBe(200);
      expect(res2.body.data.alreadyProcessed).toBe(true);

      // Verify stock was decremented EXACTLY ONCE (from 10 to 8, NOT 6)
      const inventory = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(inventory.quantity).toBe(8);
      expect(inventory.reservedQuantity).toBe(0);

      const adjustments = await prisma.inventoryAdjustment.findMany({
        where: { inventoryItemId: inventory.id, type: 'ORDER_FULFILLMENT' },
      });
      expect(adjustments).toHaveLength(1);
    });
  });

  describe('3. Untrusted Failure & Cancellation Callbacks (Clarification 1)', () => {
    it('retains reservation and does NOT cancel order on unverified public browser cancel callback', async () => {
      const { order, payment, variant } = await setupPendingOnlineOrder({
        initialPrice: 100000,
        initialStock: 10,
      });

      // Browser cancel without val_id (unverified)
      const res = await request(app)
        .post('/api/v1/payments/sslcommerz/cancel')
        .type('form')
        .send({ tran_id: payment.transactionId });

      expect(res.status).toBe(302);
      expect(res.header.location).toContain('status=CANCELLED');

      // DB state MUST REMAIN PENDING with reservation intact!
      const dbOrder = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(dbOrder.status).toBe('PENDING');
      expect(dbOrder.paymentStatus).toBe('PENDING');

      const inventory = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(inventory.reservedQuantity).toBe(2);
      expect(inventory.quantity).toBe(10);
    });

    it('releases reserved stock and cancels order when gateway validation authoritatively confirms cancellation', async () => {
      const { order, payment, variant } = await setupPendingOnlineOrder({
        initialPrice: 100000,
        initialStock: 10,
      });

      // Gateway confirms transaction was cancelled
      vi.spyOn(sslcommerzService, 'validateOrder').mockResolvedValue({
        status: 'CANCELLED',
        tran_id: payment.transactionId,
        val_id: 'val-cancel-verified',
        amount: '2060.00',
        currency: 'BDT',
        store_id: env.SSLCOMMERZ_STORE_ID,
        raw: { status: 'CANCELLED' },
      });

      const res = await request(app).post('/api/v1/payments/sslcommerz/cancel').type('form').send({
        tran_id: payment.transactionId,
        val_id: 'val-cancel-verified',
      });

      expect(res.status).toBe(302);
      expect(res.header.location).toContain('status=CANCELLED');

      // Verified cancellation cancels order and releases reserved stock
      const dbOrder = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(dbOrder.status).toBe('CANCELLED');
      expect(dbOrder.paymentStatus).toBe('CANCELLED');

      const inventory = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(inventory.reservedQuantity).toBe(0);
      expect(inventory.quantity).toBe(10);
    });
  });

  describe('4. Late Successful Payments (Clarification 2)', () => {
    it('records verified payment without committing stock when order was already cancelled', async () => {
      const { order, payment, variant } = await setupPendingOnlineOrder({
        initialPrice: 100000,
        initialStock: 10,
      });

      // Simulate order cancellation / expiry prior to payment arrival
      await orderService.cancelOrderCore({
        orderId: order.id,
        reason: 'Payment reservation expired',
      });

      const cancelledOrder = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(cancelledOrder.status).toBe('CANCELLED');

      const inventoryBefore = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(inventoryBefore.quantity).toBe(10);
      expect(inventoryBefore.reservedQuantity).toBe(0);

      // Late payment is verified by SSLCommerz
      vi.spyOn(sslcommerzService, 'validateOrder').mockResolvedValue({
        status: 'VALID',
        tran_id: payment.transactionId,
        val_id: 'val-late-123',
        amount: '2060.00',
        currency: 'BDT',
        store_id: env.SSLCOMMERZ_STORE_ID,
        bank_tran_id: 'BANK-LATE-99',
        raw: { status: 'VALID' },
      });

      const res = await request(app).post('/api/v1/payments/sslcommerz/success').type('form').send({
        val_id: 'val-late-123',
        tran_id: payment.transactionId,
        amount: '2060.00',
      });

      expect(res.status).toBe(302);
      expect(res.header.location).toContain('status=LATE_PAYMENT');

      // Crucial: Order MUST REMAIN CANCELLED (Never commit stock for cancelled order)
      const dbOrder = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { payments: true, statusHistory: true },
      });
      expect(dbOrder.status).toBe('CANCELLED');
      expect(dbOrder.paymentStatus).toBe('PAID');

      // Payment record IS updated to PAID with transaction reference for reconciliation
      expect(dbOrder.payments[0].status).toBe('PAID');
      expect(dbOrder.payments[0].gatewayTransactionId).toBe('BANK-LATE-99');

      // Physical stock was NOT committed
      const inventoryAfter = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(inventoryAfter.quantity).toBe(10);
      expect(inventoryAfter.reservedQuantity).toBe(0);

      // Status history logs late payment audit note
      const latestHistory = dbOrder.statusHistory[dbOrder.statusHistory.length - 1];
      expect(latestHistory.reason).toContain('LATE_PAYMENT_RECEIVED');
    });
  });

  describe('5. Fraudulent & Invalid Payment Attempts', () => {
    it('rejects callback with amount mismatch and redirects to failure without committing stock', async () => {
      const { order, payment, variant } = await setupPendingOnlineOrder({
        initialPrice: 100000,
        initialStock: 10,
      });

      // Gateway validates an amount of ৳1,000.00 instead of expected ৳2,060.00
      vi.spyOn(sslcommerzService, 'validateOrder').mockResolvedValue({
        status: 'VALID',
        tran_id: payment.transactionId,
        val_id: 'val-fraud-123',
        amount: '1000.00',
        currency: 'BDT',
        store_id: env.SSLCOMMERZ_STORE_ID,
        raw: { status: 'VALID' },
      });

      const res = await request(app).post('/api/v1/payments/sslcommerz/success').type('form').send({
        val_id: 'val-fraud-123',
        tran_id: payment.transactionId,
      });

      expect(res.status).toBe(302);
      expect(res.header.location).toContain('status=FAILED');

      // Database order must remain PENDING (not confirmed)
      const dbOrder = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(dbOrder.status).toBe('PENDING');

      // Stock is NOT committed
      const inventory = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(inventory.quantity).toBe(10);
    });

    it('rejects callback with currency mismatch', async () => {
      const { payment } = await setupPendingOnlineOrder();

      vi.spyOn(sslcommerzService, 'validateOrder').mockResolvedValue({
        status: 'VALID',
        tran_id: payment.transactionId,
        val_id: 'val-curr-123',
        amount: '2060.00',
        currency: 'USD', // Invalid currency
        store_id: env.SSLCOMMERZ_STORE_ID,
        raw: { status: 'VALID' },
      });

      const res = await request(app).post('/api/v1/payments/sslcommerz/success').type('form').send({
        val_id: 'val-curr-123',
        tran_id: payment.transactionId,
      });

      expect(res.status).toBe(302);
      expect(res.header.location).toContain('status=FAILED');
    });
  });
});
