import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool } from '../../../test/setup.js';
import { ReservationCleanupWorker } from '../reservation-cleanup.worker.js';
import { paymentService } from '../../payment/payment.service.js';
import { sslcommerzService } from '../../payment/sslcommerz.service.js';
import { env } from '../../../config/env.js';

describe('ReservationCleanupWorker', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPool.end();
  });

  async function createOnlineOrderFixture(options: {
    expiresAt: Date;
    orderStatus?: 'PENDING' | 'CONFIRMED';
    paymentStatus?: 'PENDING' | 'PAID';
    initialStock?: number;
    reservedStock?: number;
  }) {
    const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
    const suffix = `${Date.now()}-${rand}`;

    const user = await prisma.user.create({
      data: {
        email: `cleanup-${suffix}@example.com`,
        passwordHash: 'hash',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    const category = await prisma.category.create({
      data: {
        name: `Cat ${suffix}`,
        slug: `cat-${suffix}`,
        isActive: true,
      },
    });

    const product = await prisma.product.create({
      data: {
        name: `Product ${suffix}`,
        slug: `prod-${suffix}`,
        categoryId: category.id,
        status: 'PUBLISHED',
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `SKU-${suffix}`,
        name: 'Default',
        price: 100000,
        isActive: true,
      },
    });

    const initialStock = options.initialStock ?? 10;
    const reservedStock = options.reservedStock ?? 2;

    await prisma.inventoryItem.create({
      data: {
        variantId: variant.id,
        quantity: initialStock,
        reservedQuantity: reservedStock,
      },
    });

    const order = await prisma.order.create({
      data: {
        orderNumber: `DD-20261126-${rand}`,
        userId: user.id,
        status: options.orderStatus ?? 'PENDING',
        paymentStatus: options.paymentStatus ?? 'PENDING',
        paymentMethod: 'SSLCOMMERZ',
        merchandiseSubtotal: 200000,
        discountAmount: 0,
        shippingFee: 6000,
        totalPayable: 206000,
        shippingRecipientName: 'Test User',
        shippingPhone: '+8801700000001',
        shippingDivisionId: 'DHAKA',
        shippingDistrictId: 'DHAKA',
        shippingUpazila: 'Dhanmondi',
        shippingStreetAddress: 'Road 4',
        paymentExpiresAt: options.orderStatus === 'CONFIRMED' ? null : options.expiresAt,
        items: {
          create: {
            productId: product.id,
            variantId: variant.id,
            productName: product.name,
            variantTitle: variant.name,
            sku: variant.sku,
            unitPrice: 100000,
            quantity: 2,
            lineTotal: 200000,
          },
        },
        payments: {
          create: {
            transactionId: `TXN-20261126-${rand}`,
            method: 'SSLCOMMERZ',
            status: options.paymentStatus ?? 'PENDING',
            amount: 206000,
            currency: 'BDT',
          },
        },
      },
      include: { payments: true },
    });

    return { order, payment: order.payments[0], variant };
  }

  it('prevents duplicate timer startup and stops cleanly', async () => {
    const worker = new ReservationCleanupWorker({ pollIntervalMs: 60_000, workerId: 'test-w1' });
    const runSpy = vi.spyOn(worker, 'runCleanup').mockResolvedValue(0);

    worker.start();
    worker.start(); // duplicate start should be ignored
    expect(runSpy).toHaveBeenCalledTimes(1);

    await worker.stop();
    await worker.stop(); // duplicate stop should be safe
  });

  it('stop() waits for an active cleanup transaction before resolving and survives transient errors', async () => {
    let releaseTx!: () => void;
    const txGate = new Promise<void>((resolve) => {
      releaseTx = resolve;
    });

    const txSpy = vi.spyOn(prisma, '$transaction').mockImplementationOnce(async () => {
      await txGate;
      return 0;
    });

    const worker = new ReservationCleanupWorker({ pollIntervalMs: 60_000, workerId: 'test-w2' });
    const cleanupPromise = worker.runCleanup();

    let stopResolved = false;
    const stopPromise = worker.stop().then(() => {
      stopResolved = true;
    });

    // Give microtasks a chance to settle; stop() must still be waiting on the active tx
    await Promise.resolve();
    expect(stopResolved).toBe(false);

    releaseTx();
    await stopPromise;
    await cleanupPromise;
    expect(stopResolved).toBe(true);
    txSpy.mockRestore();

    // Transient failure in runCleanup() must be logged/caught without blocking subsequent runs
    const errSpy = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('DB transient error'));
    const failedResult = await worker.runCleanup();
    expect(failedResult).toBe(0);
    errSpy.mockRestore();

    const recoveryResult = await worker.runCleanup();
    expect(recoveryResult).toBe(0);
  });

  it('cleans up expired pending reservations idempotently and leaves paid/unexpired orders intact', async () => {
    const now = new Date();
    const expiredAt = new Date(now.getTime() - 5 * 60 * 1000);
    const futureAt = new Date(now.getTime() + 25 * 60 * 1000);

    const expired = await createOnlineOrderFixture({ expiresAt: expiredAt });
    const unexpired = await createOnlineOrderFixture({ expiresAt: futureAt });
    const paid = await createOnlineOrderFixture({
      expiresAt: expiredAt,
      orderStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
      initialStock: 8,
      reservedStock: 0,
    });

    const worker = new ReservationCleanupWorker({ pollIntervalMs: 180_000 });

    const cleanedFirst = await worker.runCleanup(now);
    expect(cleanedFirst).toBe(1);

    // Repeated execution is safe and idempotent
    const cleanedSecond = await worker.runCleanup(now);
    expect(cleanedSecond).toBe(0);

    const expiredOrder = await prisma.order.findUniqueOrThrow({ where: { id: expired.order.id } });
    expect(expiredOrder.status).toBe('CANCELLED');
    expect(expiredOrder.paymentStatus).toBe('CANCELLED');

    const expiredInv = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: expired.variant.id },
    });
    expect(expiredInv.quantity).toBe(10);
    expect(expiredInv.reservedQuantity).toBe(0);

    const unexpiredOrder = await prisma.order.findUniqueOrThrow({
      where: { id: unexpired.order.id },
    });
    expect(unexpiredOrder.status).toBe('PENDING');

    const paidOrder = await prisma.order.findUniqueOrThrow({ where: { id: paid.order.id } });
    expect(paidOrder.status).toBe('CONFIRMED');
    expect(paidOrder.paymentStatus).toBe('PAID');
  });

  it('handles concurrent payment confirmation safely without double-releasing stock', async () => {
    const now = new Date();
    const boundaryExpiry = new Date(now.getTime() - 1000);
    const { order, payment, variant } = await createOnlineOrderFixture({
      expiresAt: boundaryExpiry,
      initialStock: 10,
      reservedStock: 2,
    });

    vi.spyOn(sslcommerzService, 'validateOrder').mockResolvedValue({
      status: 'VALID',
      tran_id: payment.transactionId,
      val_id: 'val-concurrent-1',
      amount: '2060.00',
      currency: 'BDT',
      store_id: env.SSLCOMMERZ_STORE_ID!,
      bank_tran_id: 'BANK-CONC-1',
      raw: { status: 'VALID' },
    });

    const worker = new ReservationCleanupWorker({ pollIntervalMs: 180_000 });

    await Promise.all([
      paymentService.handlePaymentSuccess({
        val_id: 'val-concurrent-1',
        tran_id: payment.transactionId,
      }),
      worker.runCleanup(now),
    ]);

    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const finalInv = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: variant.id },
    });

    expect(['CONFIRMED', 'CANCELLED']).toContain(finalOrder.status);
    expect(finalOrder.paymentStatus).toBe('PAID');
    expect(finalInv.reservedQuantity).toBe(0);
    if (finalOrder.status === 'CONFIRMED') {
      expect(finalInv.quantity).toBe(8);
    } else {
      expect(finalInv.quantity).toBe(10);
    }
  });
});
