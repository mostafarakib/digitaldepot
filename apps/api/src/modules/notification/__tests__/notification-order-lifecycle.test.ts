import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { notificationService } from '../notification.service.js';
import { NotificationWorker } from '../notification.worker.js';
import { emailService } from '../../email/email.service.js';
import { hashPassword } from '../../../lib/crypto.js';

describe('Phase 9B: Notification Order Lifecycle & Idempotency Tests', () => {
  let userId: string;
  let userEmail: string;
  let orderId: string;
  let orderNumber: string;
  let paymentId: string;

  beforeEach(async () => {
    // Clean deliveries and notifications
    await prisma.notificationDelivery.deleteMany();
    await prisma.notification.deleteMany();

    const timestamp = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    userEmail = `customer-${timestamp}@example.com`;
    const passwordHash = await hashPassword('Password123!');

    const user = await prisma.user.create({
      data: {
        email: userEmail,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
        profile: {
          create: {
            firstName: 'Tariq',
            lastName: 'Islam',
          },
        },
      },
    });
    userId = user.id;

    orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: user.id,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
        paymentMethod: 'COD',
        merchandiseSubtotal: 250000,
        discountAmount: 0,
        shippingFee: 6000,
        totalPayable: 256000,
        shippingRecipientName: 'Tariq Islam',
        shippingPhone: '+8801700123456',
        shippingDivisionId: 'DHAKA',
        shippingDistrictId: 'DHAKA',
        shippingUpazila: 'Gulshan',
        shippingStreetAddress: 'Road 11, Block D',
        items: {
          create: {
            productName: 'Gaming Headset',
            variantTitle: 'Surround 7.1',
            sku: 'HDST-01',
            unitPrice: 250000,
            quantity: 1,
            lineTotal: 250000,
          },
        },
        payments: {
          create: {
            transactionId: `TXN-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            amount: 256000,
            method: 'COD',
            status: 'PENDING',
          },
        },
      },
      include: {
        payments: true,
      },
    });
    orderId = order.id;
    paymentId = order.payments[0].id;
  });

  describe('sendOrderConfirmedNotification', () => {
    it('creates in-app notification and pending email delivery with idempotencyKey', async () => {
      await notificationService.sendOrderConfirmedNotification({
        orderId,
        locale: 'en',
      });

      // 1. In-App notification created
      const inApp = await prisma.notification.findFirst({
        where: { userId, type: 'ORDER_CONFIRMED' },
      });
      expect(inApp).not.toBeNull();
      expect(inApp?.title).toBe('Order Placed (Cash on Delivery)');
      expect(inApp?.message).toContain(orderNumber);

      // 2. Email delivery created
      const delivery = await prisma.notificationDelivery.findFirst({
        where: { recipient: userEmail, eventType: 'ORDER_CONFIRMED' },
      });
      expect(delivery).not.toBeNull();
      expect(delivery?.status).toBe('PENDING');
      expect(delivery?.idempotencyKey).toBe(`email:order-confirmed:${orderId}`);
      expect(delivery?.subject).toContain(orderNumber);
    });

    it('is strictly idempotent: duplicate triggers do not duplicate deliveries or in-app notices', async () => {
      // First trigger
      await notificationService.sendOrderConfirmedNotification({
        orderId,
        locale: 'bn',
      });

      // Second trigger (e.g. redundant payment webhook or retry)
      await notificationService.sendOrderConfirmedNotification({
        orderId,
        locale: 'bn',
      });

      const deliveryCount = await prisma.notificationDelivery.count({
        where: { idempotencyKey: `email:order-confirmed:${orderId}` },
      });
      expect(deliveryCount).toBe(1);

      const inAppCount = await prisma.notification.count({
        where: { userId, type: 'ORDER_CONFIRMED' },
      });
      expect(inAppCount).toBe(1);
    });
  });

  describe('sendOrderStatusNotification', () => {
    it('creates status-specific delivery with status-specific idempotency key', async () => {
      await notificationService.sendOrderStatusNotification({
        orderId,
        status: 'SHIPPED',
        locale: 'en',
      });

      const delivery = await prisma.notificationDelivery.findFirst({
        where: { idempotencyKey: `email:order-status:${orderId}:SHIPPED` },
      });
      expect(delivery).not.toBeNull();
      expect(delivery?.subject).toContain('Shipped / In Transit');

      // Duplicate trigger for SHIPPED does not duplicate
      await notificationService.sendOrderStatusNotification({
        orderId,
        status: 'SHIPPED',
        locale: 'en',
      });
      const count = await prisma.notificationDelivery.count({
        where: { idempotencyKey: `email:order-status:${orderId}:SHIPPED` },
      });
      expect(count).toBe(1);

      // Different status transition creates new delivery
      await notificationService.sendOrderStatusNotification({
        orderId,
        status: 'DELIVERED',
        locale: 'en',
      });
      const deliveredJob = await prisma.notificationDelivery.findFirst({
        where: { idempotencyKey: `email:order-status:${orderId}:DELIVERED` },
      });
      expect(deliveredJob).not.toBeNull();
    });
  });

  describe('Worker Processing & Provider-Side Idempotency Header', () => {
    it('worker claims job, forwards Idempotency-Key header to email transport, and marks SENT', async () => {
      const sendSpy = vi.fn().mockResolvedValue(undefined);
      emailService.setTransport({ send: sendSpy });

      await notificationService.sendOrderConfirmedNotification({
        orderId,
        locale: 'en',
      });

      const worker = new NotificationWorker({ pollIntervalMs: 5000, workerId: 'test-worker-9b' });
      const processed = await worker.processNextBatch();
      expect(processed).toBe(1);

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArg = sendSpy.mock.calls[0][0];
      expect(callArg.to).toBe(userEmail);
      expect(callArg.idempotencyKey).toBe(`email:order-confirmed:${orderId}`);
      expect(callArg.headers).toEqual({
        'Idempotency-Key': `email:order-confirmed:${orderId}`,
      });

      const job = await prisma.notificationDelivery.findFirst({
        where: { idempotencyKey: `email:order-confirmed:${orderId}` },
      });
      expect(job?.status).toBe('SENT');
      expect(job?.sentAt).not.toBeNull();
    });
  });

  describe('Return & Refund Lifecycle Notifications', () => {
    it('dispatches return status notifications and prevents duplicate email outbox entries', async () => {
      const orderItem = await prisma.orderItem.findFirstOrThrow({
        where: { orderId },
      });

      const returnRequest = await prisma.returnRequest.create({
        data: {
          returnNumber: `RET-${Date.now().toString().slice(-6)}`,
          orderId,
          userId,
          status: 'REQUESTED',
          customerReason: 'Defective item',
          estimatedRefundAmount: 250000,
          items: {
            create: {
              orderItemId: orderItem.id,
              quantity: 1,
              reason: 'Microphone not working',
            },
          },
        },
      });

      // 1. Approve return
      await notificationService.sendReturnStatusNotification({
        returnRequestId: returnRequest.id,
        status: 'APPROVED',
        locale: 'en',
      });

      const approvedJob = await prisma.notificationDelivery.findFirst({
        where: {
          idempotencyKey: `email:return-status:${returnRequest.id}:APPROVED`,
        },
      });
      expect(approvedJob).not.toBeNull();
      expect(approvedJob?.status).toBe('PENDING');

      // Redundant trigger
      await notificationService.sendReturnStatusNotification({
        returnRequestId: returnRequest.id,
        status: 'APPROVED',
        locale: 'en',
      });
      const count = await prisma.notificationDelivery.count({
        where: {
          idempotencyKey: `email:return-status:${returnRequest.id}:APPROVED`,
        },
      });
      expect(count).toBe(1);

      // 2. Refund completed notification
      const refund = await prisma.refund.create({
        data: {
          refundNumber: `REF-${Date.now().toString().slice(-6)}`,
          returnRequestId: returnRequest.id,
          paymentId,
          amount: 250000,
          merchandiseAmount: 250000,
          shippingAmount: 0,
          method: 'COD_PAYOUT',
          status: 'COMPLETED',
          payoutChannel: 'CASH',
        },
      });

      await notificationService.sendRefundProcessedNotification({
        refundId: refund.id,
        locale: 'bn',
      });

      const refundJob = await prisma.notificationDelivery.findFirst({
        where: {
          idempotencyKey: `email:refund-processed:${refund.id}`,
        },
      });
      expect(refundJob).not.toBeNull();
      expect(refundJob?.status).toBe('PENDING');
      expect(refundJob?.subject).toContain(refund.refundNumber);

      // In-app refund notice
      const refundInApp = await prisma.notification.findFirst({
        where: { userId, type: 'REFUND_PROCESSED' },
      });
      expect(refundInApp).not.toBeNull();
      expect(refundInApp?.title).toContain(refund.refundNumber);
    });
  });
});
