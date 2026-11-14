import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { sslcommerzService, type ValidateOrderResult } from './sslcommerz.service.js';
import { inventoryReservationService } from '../order/inventory-reservation.service.js';
import { orderCouponService } from '../order/order-coupon.service.js';
import type { OrderStockItem } from '../order/order.types.js';
import type { Prisma } from '../../generated/client/client.js';
import type {
  AdminPaymentQueryInput,
  AdminPaymentListResponse,
  AdminPaymentListItem,
  AdminPaymentStats,
  AdminPaymentDetailResponse,
  SafeGatewayDetails,
} from './payment.schemas.js';

export interface PaymentProcessResult {
  orderNumber: string;
  status: 'SUCCESS' | 'LATE_PAYMENT' | 'FAILED' | 'CANCELLED';
  reason?: string;
  alreadyProcessed?: boolean;
}

export class PaymentService {
  /**
   * Processes a successful payment callback or IPN from SSLCommerz.
   * Transaction boundaries:
   * 1. Validates val_id authoritatively with SSLCommerz gateway OUTSIDE the DB transaction.
   * 2. Opens DB transaction, locks Order and Payment rows in consistent order, and updates atomically.
   */
  async handlePaymentSuccess(
    payload: Record<string, string>,
    outerTx?: Prisma.TransactionClient,
  ): Promise<PaymentProcessResult> {
    const valId = payload.val_id;
    const tranId = payload.tran_id;

    if (!valId || typeof valId !== 'string') {
      logger.warn({ payload }, 'Payment success callback missing val_id');
      throw new BadRequestError('MISSING_VALIDATION_ID', 'Missing val_id in payment callback');
    }

    if (!tranId || typeof tranId !== 'string') {
      logger.warn({ payload }, 'Payment success callback missing tran_id');
      throw new BadRequestError('MISSING_TRANSACTION_ID', 'Missing tran_id in payment callback');
    }

    // 1. Authoritative Gateway Verification OUTSIDE database transaction
    const valData = await sslcommerzService.validateOrder(valId);

    // 2. Core authoritative validation checks
    const isValidStatus = valData.status === 'VALID' || valData.status === 'VALIDATED';
    if (!isValidStatus) {
      logger.warn(
        { valData, tranId, valId },
        'SSLCommerz gateway validation returned invalid status',
      );
      throw new BadRequestError(
        'GATEWAY_VALIDATION_FAILED',
        `Gateway validation status is ${valData.status}`,
      );
    }

    if (valData.tran_id !== tranId) {
      logger.error(
        { reportedTranId: tranId, gatewayTranId: valData.tran_id },
        'Transaction ID mismatch between callback and gateway validation',
      );
      throw new BadRequestError(
        'TRANSACTION_MISMATCH',
        'Transaction ID does not match gateway validation',
      );
    }

    if (valData.currency !== 'BDT') {
      logger.error(
        { currency: valData.currency },
        'Currency mismatch in gateway validation (expected BDT)',
      );
      throw new BadRequestError(
        'CURRENCY_MISMATCH',
        `Invalid currency: ${valData.currency}. Expected BDT.`,
      );
    }

    // Verify store identity if returned by gateway
    if (valData.store_id && valData.store_id !== env.SSLCOMMERZ_STORE_ID) {
      logger.error(
        { reportedStoreId: valData.store_id, expectedStoreId: env.SSLCOMMERZ_STORE_ID },
        'Store ID mismatch in gateway validation',
      );
      throw new BadRequestError(
        'STORE_ID_MISMATCH',
        'Store ID does not match merchant credentials',
      );
    }

    // 3. Open DB Transaction, Lock records and Process atomically
    const execute = async (tx: Prisma.TransactionClient): Promise<PaymentProcessResult> => {
      const initialPayment = await tx.payment.findUnique({
        where: { transactionId: tranId },
      });

      if (!initialPayment) {
        logger.error({ tranId }, 'Payment record not found for transaction ID');
        throw new NotFoundError('PAYMENT_NOT_FOUND', 'Payment record not found');
      }

      // Lock Order first, then Payment in consistent deadlock-free order
      await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${initialPayment.orderId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "Payment" WHERE id = ${initialPayment.id} FOR UPDATE`;

      const order = await tx.order.findUniqueOrThrow({
        where: { id: initialPayment.orderId },
        include: { items: true, payments: true },
      });

      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: initialPayment.id },
      });

      // Verify exact amount against stored order
      const verifiedAmountPoysha = Math.round(parseFloat(valData.amount) * 100);
      if (verifiedAmountPoysha !== order.totalPayable) {
        logger.error(
          {
            verifiedAmountPoysha,
            orderTotalPayable: order.totalPayable,
            orderId: order.id,
          },
          'Payment amount mismatch between gateway and stored order',
        );
        throw new BadRequestError(
          'AMOUNT_MISMATCH',
          `Verified amount (${verifiedAmountPoysha}) does not match order total (${order.totalPayable})`,
        );
      }

      // Idempotency: If already marked PAID, return without repeating fulfillment
      if (payment.status === 'PAID') {
        logger.info(
          { transactionId: tranId, orderNumber: order.orderNumber },
          'Payment callback already processed (idempotent duplicate)',
        );
        return {
          orderNumber: order.orderNumber,
          status: 'SUCCESS',
          alreadyProcessed: true,
        };
      }

      // Clarification 2: Late payment received after reservation expiry or order cancellation
      if (order.status === 'CANCELLED') {
        logger.warn(
          { orderNumber: order.orderNumber, paymentId: payment.id, tranId },
          'Late payment received for cancelled/expired order. Recording payment without committing stock.',
        );

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'PAID',
            gatewayTransactionId: valData.bank_tran_id || valId,
            paidAt: new Date(),
            gatewayResponse: valData.raw as Prisma.InputJsonValue,
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'PAID',
          },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: 'CANCELLED',
            toStatus: 'CANCELLED',
            reason: `LATE_PAYMENT_RECEIVED: Gateway-verified payment of ৳${(verifiedAmountPoysha / 100).toFixed(2)} received after order cancellation. Preserved for manual reconciliation or Phase 7 refund.`,
            changedByUserId: null,
          },
        });

        return {
          orderNumber: order.orderNumber,
          status: 'LATE_PAYMENT',
          reason: 'Payment received after reservation window expired',
          alreadyProcessed: false,
        };
      }

      // In-Time Payment: Order is PENDING
      const stockItems: OrderStockItem[] = order.items
        .filter((item): item is typeof item & { variantId: string } => item.variantId !== null)
        .map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
        }));

      // Commit physical stock & release reservation
      await inventoryReservationService.commitReservedStock(tx, {
        items: stockItems,
        orderId: order.id,
        userId: order.userId,
        orderNumber: order.orderNumber,
      });

      const now = new Date();

      // Update Payment to PAID
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          gatewayTransactionId: valData.bank_tran_id || valId,
          paidAt: now,
          gatewayResponse: valData.raw as Prisma.InputJsonValue,
        },
      });

      // Update Order to CONFIRMED / PAID
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          paymentExpiresAt: null,
        },
      });

      // Append OrderStatusHistory
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: 'PENDING',
          toStatus: 'CONFIRMED',
          reason: 'Online payment verified via SSLCommerz',
          changedByUserId: null,
        },
      });

      logger.info(
        { orderNumber: order.orderNumber, tranId, amount: verifiedAmountPoysha },
        'Online order successfully paid and confirmed',
      );

      return {
        orderNumber: order.orderNumber,
        status: 'SUCCESS',
        alreadyProcessed: false,
      };
    };

    if (outerTx) {
      return execute(outerTx);
    }
    return await prisma.$transaction(async (tx) => execute(tx));
  }

  /**
   * Processes a payment cancellation callback from SSLCommerz.
   * Clarification 1: Never release inventory or coupon usage solely because a public browser callback arrived.
   * Requires authoritative gateway verification. If unverified, retains reservation until 30m expiry.
   */
  async handlePaymentCancel(
    payload: Record<string, string>,
    outerTx?: Prisma.TransactionClient,
  ): Promise<PaymentProcessResult> {
    const tranId = payload.tran_id;
    const valId = payload.val_id;

    if (!tranId) {
      return { orderNumber: '', status: 'CANCELLED', reason: 'Missing transaction reference' };
    }

    const payment = await prisma.payment.findUnique({
      where: { transactionId: tranId },
      include: { order: true },
    });

    if (!payment) {
      return { orderNumber: '', status: 'CANCELLED', reason: 'Payment not found' };
    }

    // Try authoritative gateway verification if val_id is present
    let isGatewayVerifiedCancelled = false;
    let gatewayData: ValidateOrderResult | null = null;

    if (valId) {
      try {
        gatewayData = await sslcommerzService.validateOrder(valId);
        if (
          gatewayData.status === 'CANCELLED' ||
          gatewayData.status === 'FAILED' ||
          gatewayData.status === 'EXPIRED'
        ) {
          isGatewayVerifiedCancelled = true;
        }
      } catch (err) {
        logger.warn({ err, valId }, 'Could not verify cancellation with gateway');
      }
    }

    // Clarification 1: If outcome CANNOT be authoritatively verified, retain the reservation
    if (!isGatewayVerifiedCancelled) {
      logger.warn(
        { tranId, orderNumber: payment.order.orderNumber },
        'Unverified browser cancellation callback received. Retaining reservation until verified resolution or 30m expiry.',
      );
      return {
        orderNumber: payment.order.orderNumber,
        status: 'CANCELLED',
        reason: 'Unverified cancellation; reservation retained until expiry',
      };
    }

    // Verified Cancellation: Release stock and cancel order
    const execute = async (tx: Prisma.TransactionClient): Promise<PaymentProcessResult> => {
      await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${payment.orderId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`;

      const order = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
        include: { items: true },
      });

      const lockedPayment = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

      if (order.status !== 'PENDING') {
        return { orderNumber: order.orderNumber, status: 'CANCELLED', alreadyProcessed: true };
      }

      const stockItems: OrderStockItem[] = order.items
        .filter((item): item is typeof item & { variantId: string } => item.variantId !== null)
        .map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
        }));

      // Release reserved stock and coupon
      await inventoryReservationService.releaseReservedStock(tx, stockItems);
      await orderCouponService.releaseCoupon(tx, order.id);

      const now = new Date();

      await tx.payment.update({
        where: { id: lockedPayment.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          gatewayResponse: (gatewayData?.raw ?? payload) as Prisma.InputJsonValue,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          paymentStatus: 'CANCELLED',
          cancelledAt: now,
          cancellationReason: 'Payment cancelled at gateway (verified)',
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: 'PENDING',
          toStatus: 'CANCELLED',
          reason: 'Online payment cancelled at gateway (verified)',
          changedByUserId: null,
        },
      });

      return {
        orderNumber: order.orderNumber,
        status: 'CANCELLED',
        alreadyProcessed: false,
      };
    };

    if (outerTx) {
      return execute(outerTx);
    }
    return await prisma.$transaction(async (tx) => execute(tx));
  }

  /**
   * Processes a payment failure callback from SSLCommerz.
   * Clarification 1: Never release inventory or coupon usage solely because a public browser callback arrived.
   * Requires authoritative gateway verification.
   */
  async handlePaymentFail(
    payload: Record<string, string>,
    outerTx?: Prisma.TransactionClient,
  ): Promise<PaymentProcessResult> {
    const tranId = payload.tran_id;
    const valId = payload.val_id;

    if (!tranId) {
      return { orderNumber: '', status: 'FAILED', reason: 'Missing transaction reference' };
    }

    const payment = await prisma.payment.findUnique({
      where: { transactionId: tranId },
      include: { order: true },
    });

    if (!payment) {
      return { orderNumber: '', status: 'FAILED', reason: 'Payment not found' };
    }

    let isGatewayVerifiedFailed = false;
    let gatewayData: ValidateOrderResult | null = null;

    if (valId) {
      try {
        gatewayData = await sslcommerzService.validateOrder(valId);
        if (gatewayData.status === 'FAILED' || gatewayData.status === 'CANCELLED') {
          isGatewayVerifiedFailed = true;
        }
      } catch (err) {
        logger.warn({ err, valId }, 'Could not verify failure with gateway');
      }
    }

    if (!isGatewayVerifiedFailed) {
      logger.warn(
        { tranId, orderNumber: payment.order.orderNumber },
        'Unverified browser failure callback received. Retaining reservation until verified resolution or 30m expiry.',
      );
      return {
        orderNumber: payment.order.orderNumber,
        status: 'FAILED',
        reason: 'Unverified failure; reservation retained until expiry',
      };
    }

    const execute = async (tx: Prisma.TransactionClient): Promise<PaymentProcessResult> => {
      await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${payment.orderId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`;

      const order = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
        include: { items: true },
      });

      const lockedPayment = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

      if (order.status !== 'PENDING') {
        return { orderNumber: order.orderNumber, status: 'FAILED', alreadyProcessed: true };
      }

      const stockItems: OrderStockItem[] = order.items
        .filter((item): item is typeof item & { variantId: string } => item.variantId !== null)
        .map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
        }));

      await inventoryReservationService.releaseReservedStock(tx, stockItems);
      await orderCouponService.releaseCoupon(tx, order.id);

      const now = new Date();

      await tx.payment.update({
        where: { id: lockedPayment.id },
        data: {
          status: 'FAILED',
          failedAt: now,
          gatewayResponse: (gatewayData?.raw ?? payload) as Prisma.InputJsonValue,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          paymentStatus: 'FAILED',
          cancelledAt: now,
          cancellationReason: 'Payment failed at gateway (verified)',
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: 'PENDING',
          toStatus: 'CANCELLED',
          reason: 'Online payment failed at gateway (verified)',
          changedByUserId: null,
        },
      });

      return {
        orderNumber: order.orderNumber,
        status: 'FAILED',
        alreadyProcessed: false,
      };
    };

    if (outerTx) {
      return execute(outerTx);
    }
    return await prisma.$transaction(async (tx) => execute(tx));
  }

  /**
   * Processes server-to-server Instant Payment Notification (IPN) webhook.
   */
  async handleIpn(payload: Record<string, string>): Promise<PaymentProcessResult> {
    const status = payload.status;

    if (status === 'VALID' || status === 'VALIDATED') {
      return this.handlePaymentSuccess(payload);
    }

    if (status === 'FAILED') {
      return this.handlePaymentFail(payload);
    }

    if (status === 'CANCELLED') {
      return this.handlePaymentCancel(payload);
    }

    logger.warn({ payload }, 'Received IPN with unrecognized or unsupported status');
    return {
      orderNumber: payload.tran_id || '',
      status: 'FAILED',
      reason: `Unsupported IPN status: ${status}`,
    };
  }

  /**
   * Admin Payment Monitoring: Lists payment attempts with filtering, sorting, pagination, and KPI metrics.
   */
  async listPayments(query: AdminPaymentQueryInput): Promise<AdminPaymentListResponse> {
    const where: Prisma.PaymentWhereInput = {};

    // 1. Status Filter
    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    // 2. Method Filter
    if (query.method && query.method !== 'ALL') {
      where.method = query.method;
    }

    // 3. Date range filter
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    // 4. Order number & Customer ID filters
    const orderWhere: Prisma.OrderWhereInput = {};
    if (query.orderNumber) {
      orderWhere.orderNumber = { contains: query.orderNumber.trim(), mode: 'insensitive' };
    }
    if (query.customerId) {
      orderWhere.userId = query.customerId;
    }
    if (Object.keys(orderWhere).length > 0) {
      where.order = orderWhere;
    }

    // 6. Free text search across transaction references, orderNumber, customer name/email/phone
    if (query.search) {
      const s = query.search.trim();
      where.OR = [
        { transactionId: { contains: s, mode: 'insensitive' } },
        { gatewayTransactionId: { contains: s, mode: 'insensitive' } },
        { order: { orderNumber: { contains: s, mode: 'insensitive' } } },
        { order: { user: { email: { contains: s, mode: 'insensitive' } } } },
        { order: { shippingRecipientName: { contains: s, mode: 'insensitive' } } },
        { order: { shippingPhone: { contains: s, mode: 'insensitive' } } },
      ];
    }

    // 7. Sorting
    let orderBy: Prisma.PaymentOrderByWithRelationInput = { createdAt: 'desc' };
    if (query.sortBy === 'oldest') {
      orderBy = { createdAt: 'asc' };
    } else if (query.sortBy === 'amountDesc') {
      orderBy = { amount: 'desc' };
    } else if (query.sortBy === 'amountAsc') {
      orderBy = { amount: 'asc' };
    } else if (query.sortBy === 'paidAtDesc') {
      orderBy = { paidAt: 'desc' };
    }

    // 8. Pagination
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const [totalMatching, rawPayments] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              totalPayable: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  profile: {
                    select: {
                      firstName: true,
                      lastName: true,
                      phone: true,
                    },
                  },
                },
              },
            },
          },
          refunds: {
            where: { status: 'COMPLETED' },
            select: {
              amount: true,
            },
          },
        },
      }),
    ]);

    // 9. Compute KPI Stats across all matching payments
    const [
      totalAttempts,
      capturedAggregate,
      pendingPayments,
      failedPayments,
      cancelledPayments,
      completedRefundsSum,
    ] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.aggregate({
        where: {
          ...where,
          status: { in: ['PAID', 'REFUNDED'] },
        },
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.payment.count({
        where: { ...where, status: 'PENDING' },
      }),
      prisma.payment.count({
        where: { ...where, status: 'FAILED' },
      }),
      prisma.payment.count({
        where: { ...where, status: 'CANCELLED' },
      }),
      prisma.refund.aggregate({
        where: {
          status: 'COMPLETED',
          payment: where,
        },
        _sum: { amount: true },
      }),
    ]);

    const totalCapturedPoisha = capturedAggregate._sum.amount ?? 0;
    const totalRefundedPoisha = completedRefundsSum._sum.amount ?? 0;
    const netRetainedPoisha = Math.max(0, totalCapturedPoisha - totalRefundedPoisha);

    const stats: AdminPaymentStats = {
      totalAttempts,
      successfulPayments: capturedAggregate._count.id ?? 0,
      failedPayments,
      pendingPayments,
      cancelledPayments,
      totalCapturedPoisha,
      totalRefundedPoisha,
      netRetainedPoisha,
    };

    const payments: AdminPaymentListItem[] = rawPayments.map((p) => {
      const refundedAmount = p.refunds.reduce((sum, r) => sum + r.amount, 0);
      const isCaptured = p.status === 'PAID' || p.status === 'REFUNDED';
      const netAmount = isCaptured ? Math.max(0, p.amount - refundedAmount) : 0;
      const customerName = p.order.user.profile
        ? `${p.order.user.profile.firstName} ${p.order.user.profile.lastName}`.trim()
        : p.order.user.email.split('@')[0];

      return {
        id: p.id,
        transactionId: p.transactionId,
        gatewayTransactionId: p.gatewayTransactionId,
        method: p.method,
        status: p.status,
        amount: p.amount,
        currency: p.currency,
        refundedAmount,
        netAmount,
        paidAt: p.paidAt ? p.paidAt.toISOString() : null,
        failedAt: p.failedAt ? p.failedAt.toISOString() : null,
        cancelledAt: p.cancelledAt ? p.cancelledAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
        order: {
          id: p.order.id,
          orderNumber: p.order.orderNumber,
          status: p.order.status,
          totalPayable: p.order.totalPayable,
          customer: {
            id: p.order.user.id,
            email: p.order.user.email,
            name: customerName,
            phone: p.order.user.profile?.phone ?? null,
          },
        },
      };
    });

    return {
      payments,
      stats,
      pagination: {
        page,
        limit,
        total: totalMatching,
        totalPages: Math.ceil(totalMatching / limit),
      },
    };
  }

  /**
   * Admin Payment Monitoring: Retrieves detailed payment inspection data.
   */
  async getPaymentDetail(id: string): Promise<AdminPaymentDetailResponse> {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                profile: {
                  select: {
                    firstName: true,
                    lastName: true,
                    phone: true,
                  },
                },
              },
            },
            items: {
              select: {
                id: true,
                productName: true,
                variantTitle: true,
                sku: true,
                unitPrice: true,
                quantity: true,
                lineTotal: true,
                thumbnailUrl: true,
              },
            },
            payments: {
              select: {
                id: true,
                transactionId: true,
                method: true,
                status: true,
                amount: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        refunds: {
          include: {
            returnRequest: {
              select: {
                returnNumber: true,
              },
            },
            processedByUser: {
              select: {
                id: true,
                email: true,
                profile: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!payment) {
      throw new NotFoundError('PAYMENT_NOT_FOUND', `Payment with ID ${id} was not found`);
    }

    const completedRefundsAmount = payment.refunds
      .filter((r) => r.status === 'COMPLETED')
      .reduce((sum, r) => sum + r.amount, 0);

    const isCaptured = payment.status === 'PAID' || payment.status === 'REFUNDED';
    const netAmount = isCaptured ? Math.max(0, payment.amount - completedRefundsAmount) : 0;
    const remainingRefundCapacity =
      payment.status === 'PAID' ? Math.max(0, payment.amount - completedRefundsAmount) : 0;

    const customerName = payment.order.user.profile
      ? `${payment.order.user.profile.firstName} ${payment.order.user.profile.lastName}`.trim()
      : payment.order.user.email.split('@')[0];

    const safeGatewayDetails = this.extractSafeGatewayDetails(payment.gatewayResponse);

    return {
      payment: {
        id: payment.id,
        transactionId: payment.transactionId,
        gatewayTransactionId: payment.gatewayTransactionId,
        method: payment.method,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        refundedAmount: completedRefundsAmount,
        netAmount,
        paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
        failedAt: payment.failedAt ? payment.failedAt.toISOString() : null,
        cancelledAt: payment.cancelledAt ? payment.cancelledAt.toISOString() : null,
        createdAt: payment.createdAt.toISOString(),
        safeGatewayDetails,
        remainingRefundCapacity,
        order: {
          id: payment.order.id,
          orderNumber: payment.order.orderNumber,
          status: payment.order.status,
          paymentStatus: payment.order.paymentStatus,
          paymentMethod: payment.order.paymentMethod,
          merchandiseSubtotal: payment.order.merchandiseSubtotal,
          shippingFee: payment.order.shippingFee,
          discountAmount: payment.order.discountAmount,
          totalPayable: payment.order.totalPayable,
          shippingAddress: {
            recipientName: payment.order.shippingRecipientName,
            phone: payment.order.shippingPhone,
            alternativePhone: payment.order.shippingAlternativePhone,
            streetAddress: payment.order.shippingStreetAddress,
            upazila: payment.order.shippingUpazila,
            districtId: payment.order.shippingDistrictId,
            divisionId: payment.order.shippingDivisionId,
          },
          items: payment.order.items,
          customer: {
            id: payment.order.user.id,
            email: payment.order.user.email,
            name: customerName,
            phone: payment.order.user.profile?.phone ?? null,
          },
          otherPaymentAttempts: payment.order.payments.map((p) => ({
            id: p.id,
            transactionId: p.transactionId,
            method: p.method,
            status: p.status,
            amount: p.amount,
            createdAt: p.createdAt.toISOString(),
          })),
        },
        refunds: payment.refunds.map((r) => {
          const processorName = r.processedByUser?.profile
            ? `${r.processedByUser.profile.firstName} ${r.processedByUser.profile.lastName}`.trim()
            : (r.processedByUser?.email ?? null);

          return {
            id: r.id,
            refundNumber: r.refundNumber,
            returnRequestId: r.returnRequestId,
            returnNumber: r.returnRequest.returnNumber,
            amount: r.amount,
            merchandiseAmount: r.merchandiseAmount,
            shippingAmount: r.shippingAmount,
            method: r.method,
            status: r.status,
            gatewayReference: r.gatewayReference,
            payoutReference: r.payoutReference,
            payoutChannel: r.payoutChannel,
            failureReason: r.failureReason,
            processedAt: r.processedAt ? r.processedAt.toISOString() : null,
            processedBy: r.processedByUser
              ? {
                  id: r.processedByUser.id,
                  name: processorName ?? 'Admin',
                  email: r.processedByUser.email,
                }
              : null,
            createdAt: r.createdAt.toISOString(),
          };
        }),
      },
    };
  }

  private extractSafeGatewayDetails(gatewayResponse: unknown): SafeGatewayDetails | null {
    if (!gatewayResponse || typeof gatewayResponse !== 'object') {
      return null;
    }
    const g = gatewayResponse as Record<string, unknown>;
    const safe: SafeGatewayDetails = {};
    if (typeof g.bank_tran_id === 'string') safe.bankTranId = g.bank_tran_id;
    if (typeof g.card_type === 'string') safe.cardType = g.card_type;
    if (typeof g.card_brand === 'string') safe.cardBrand = g.card_brand;
    if (typeof g.card_issuer === 'string') safe.cardIssuer = g.card_issuer;
    if (typeof g.card_no === 'string') safe.cardNo = g.card_no;
    if (typeof g.status === 'string') safe.gatewayStatus = g.status;
    return Object.keys(safe).length > 0 ? safe : null;
  }
}

export const paymentService = new PaymentService();
