import type { Prisma } from '../../generated/client/client.js';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { checkoutService } from '../checkout/checkout.service.js';
import {
  PAYMENT_RESERVATION_TTL_MS,
  MAX_ORDER_NUMBER_GENERATION_RETRIES,
} from './order.constants.js';
import { generateOrderNumber, generateTransactionId } from './order.utils.js';
import { inventoryReservationService } from './inventory-reservation.service.js';
import { orderCouponService } from './order-coupon.service.js';
import type {
  CreateOrderCoreInput,
  OrderStockItem,
  OrderWithDetails,
  CustomerOrderListResponse,
  CustomerOrderDetailResponse,
  AdminOrderListResponse,
  AdminOrderDetailResponse,
  AdminOrderSummaryItem,
  OrderStatus,
} from './order.types.js';
import type { CustomerOrderQuery, AdminOrderQuery } from './order.schemas.js';

export type { OrderWithDetails };

export interface CancelOrderParams {
  orderId: string;
  userId?: string;
  reason: string;
  isAdmin?: boolean;
  adminUserId?: string;
}

export interface CompensateOrderParams {
  orderId: string;
  reason: string;
}

export class OrderService {
  /**
   * Core authoritative order creation.
   * Runs within a database transaction (supplied or newly created).
   * 1. Proactively cleans up expired online reservations.
   * 2. Authoritatively validates checkout (stock, live prices, address, coupon).
   * 3. Requires live price acknowledgement if prices changed.
   * 4. Generates unique order number with collision safety.
   * 5. Creates Order record with frozen address, financial, and coupon snapshots.
   * 6. Creates immutable OrderItem snapshots.
   * 7. Atomically consumes coupon.
   * 8. Commits stock (COD: physical deduction + audit log; Online: 30-min reservation).
   * 9. Creates initial Payment record in PENDING status.
   * 10. Records initial OrderStatusHistory entry.
   * 11. Empties customer cart items and clears cart coupon.
   */
  async createOrderCore(
    input: CreateOrderCoreInput,
    outerTx?: Prisma.TransactionClient,
  ): Promise<OrderWithDetails> {
    const execute = async (tx: Prisma.TransactionClient): Promise<OrderWithDetails> => {
      // 0. Serialize concurrent checkouts for this customer via User and Cart row locks
      await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "Cart" WHERE "userId" = ${input.userId} FOR UPDATE`;

      // 1. Proactively clean up expired reservations before stock checks
      await inventoryReservationService.cleanupExpiredReservations(tx);

      // 2. Authoritatively evaluate checkout within the transaction
      const validation = await checkoutService.validateCheckout(
        input.userId,
        { addressId: input.addressId },
        tx,
      );

      // 3. Check for price changes and acknowledgement
      if (validation.hasPriceChanges && !input.acknowledgedLivePrices) {
        throw new BadRequestError(
          'PRICE_CHANGE_ACKNOWLEDGEMENT_REQUIRED',
          'Prices have changed since items were added to cart. Customer acknowledgement required.',
        );
      }

      // 4. Check overall validation validity
      if (!validation.isValid) {
        const blockingIssue =
          validation.issues.find((issue) => issue.type !== 'PRICE_CHANGE') ?? validation.issues[0];
        const errorCode = blockingIssue?.type ?? 'CHECKOUT_VALIDATION_FAILED';
        const errorMessage = blockingIssue?.message ?? 'Checkout validation failed.';
        throw new BadRequestError(errorCode, errorMessage);
      }

      if (!validation.address) {
        throw new BadRequestError(
          'ADDRESS_REQUIRED',
          'A valid delivery address is required to place an order.',
        );
      }

      if (validation.items.length === 0) {
        throw new BadRequestError('EMPTY_CART', 'Your shopping cart is empty.');
      }

      // 5. Generate collision-safe unique order number
      let orderNumber = generateOrderNumber();
      let attempts = 0;
      while (attempts < MAX_ORDER_NUMBER_GENERATION_RETRIES) {
        const existing = await tx.order.findUnique({ where: { orderNumber } });
        if (!existing) break;
        orderNumber = generateOrderNumber();
        attempts++;
      }

      // 6. Determine initial status and payment reservation expiration
      const isCod = input.paymentMethod === 'COD';
      const initialStatus = isCod ? 'CONFIRMED' : 'PENDING';
      const initialPaymentStatus = 'PENDING';
      const now = new Date();
      const paymentExpiresAt = isCod ? null : new Date(now.getTime() + PAYMENT_RESERVATION_TTL_MS);

      // 7. Create Order with frozen snapshots
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: input.userId,
          status: initialStatus,
          paymentStatus: initialPaymentStatus,
          paymentMethod: input.paymentMethod,
          merchandiseSubtotal: validation.summary.merchandiseSubtotal,
          discountAmount: validation.summary.discount,
          shippingFee: validation.summary.shippingFee,
          totalPayable: validation.summary.finalTotal,
          shippingRecipientName: validation.address.recipientName,
          shippingPhone: validation.address.phone,
          shippingAlternativePhone: input.alternativePhone ?? null,
          shippingDivisionId: validation.address.divisionId,
          shippingDistrictId: validation.address.districtId,
          shippingUpazila: validation.address.upazila,
          shippingStreetAddress: validation.address.streetAddress,
          shippingDeliveryNotes: input.deliveryNotes ?? null,
          couponId: validation.coupon?.id ?? null,
          couponCode: validation.coupon?.code ?? null,
          couponDiscountType: validation.coupon?.discountType ?? null,
          couponDiscountValue: validation.coupon?.discountValue ?? null,
          couponDiscountAmount: validation.coupon?.discountAmount ?? 0,
          paymentExpiresAt,
        },
      });

      // 8. Create immutable OrderItem snapshots
      for (const item of validation.items) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName,
            variantTitle: item.variantName ?? 'Default',
            sku: item.sku,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            lineTotal: item.lineTotal,
            attributes: (item.attributes as Prisma.InputJsonValue) ?? null,
            thumbnailUrl: item.primaryImage?.url ?? null,
          },
        });
      }

      // 9. Consume coupon if present
      if (validation.coupon) {
        await orderCouponService.consumeCoupon(tx, {
          couponId: validation.coupon.id,
          userId: input.userId,
          orderId: order.id,
          subtotal: validation.summary.merchandiseSubtotal,
        });
      }

      // 10. Handle Inventory: COD commits physical stock immediately; Online reserves stock
      const stockItems: OrderStockItem[] = validation.items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      }));

      if (isCod) {
        await inventoryReservationService.commitPhysicalStockImmediate(tx, {
          items: stockItems,
          orderId: order.id,
          userId: input.userId,
          orderNumber: order.orderNumber,
          adjustedByUserId: input.adminUserId ?? input.userId,
        });
      } else {
        await inventoryReservationService.reserveStock(tx, stockItems);
      }

      // 11. Create initial Payment record in PENDING status
      let transactionId = generateTransactionId();
      let txnAttempts = 0;
      while (txnAttempts < MAX_ORDER_NUMBER_GENERATION_RETRIES) {
        const existingTxn = await tx.payment.findUnique({ where: { transactionId } });
        if (!existingTxn) break;
        transactionId = generateTransactionId();
        txnAttempts++;
      }

      await tx.payment.create({
        data: {
          orderId: order.id,
          transactionId,
          method: input.paymentMethod,
          status: 'PENDING',
          amount: order.totalPayable,
          currency: 'BDT',
        },
      });

      // 12. Create initial OrderStatusHistory entry
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: null,
          toStatus: initialStatus,
          reason: isCod
            ? 'Order placed with Cash on Delivery'
            : 'Order created, awaiting online payment',
          changedByUserId: input.adminUserId ?? input.userId,
        },
      });

      // 13. Empty customer cart items and remove applied coupon
      const userCart = await tx.cart.findUnique({
        where: { userId: input.userId },
      });
      if (userCart) {
        await tx.cartItem.deleteMany({
          where: { cartId: userCart.id },
        });
        await tx.cart.update({
          where: { id: userCart.id },
          data: { couponId: null },
        });
      }

      // 14. Return the persisted Order with complete relations
      return await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          items: true,
          payments: true,
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });
    };

    if (outerTx) {
      return execute(outerTx);
    }
    return await prisma.$transaction(async (tx) => execute(tx));
  }

  /**
   * Authoritatively cancels an order.
   * Customers can cancel eligible unpaid PENDING or CONFIRMED orders.
   * Paid orders cannot be cancelled before Phase 7 refund support.
   * Restores physical stock (for COD) or releases reservation (for Online).
   * Releases coupon usage idempotently.
   */
  async cancelOrderCore(
    params: CancelOrderParams,
    outerTx?: Prisma.TransactionClient,
  ): Promise<OrderWithDetails> {
    const execute = async (tx: Prisma.TransactionClient): Promise<OrderWithDetails> => {
      // Order-first row locking to serialize concurrent operations
      await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${params.orderId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "Payment" WHERE "orderId" = ${params.orderId} FOR UPDATE`;

      const order = await tx.order.findUnique({
        where: { id: params.orderId },
        include: { items: true, payments: true },
      });

      if (!order) {
        throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');
      }

      // Verify ownership if customer-initiated
      if (!params.isAdmin && params.userId && order.userId !== params.userId) {
        throw new ForbiddenError('FORBIDDEN', 'You are not authorized to cancel this order.');
      }

      if (order.status === 'CANCELLED') {
        throw new BadRequestError('ORDER_ALREADY_CANCELLED', 'This order is already cancelled.');
      }

      // Paid orders cannot be cancelled until Phase 7 refund support
      if (order.paymentStatus === 'PAID') {
        throw new BadRequestError(
          'PAID_ORDER_CANNOT_BE_CANCELLED',
          'Paid orders cannot be cancelled before refund processing is implemented in Phase 7.',
        );
      }

      // Customers can cancel PENDING or CONFIRMED.
      // Admins can additionally cancel unpaid COD orders in PROCESSING.
      const isEligible = params.isAdmin
        ? order.status === 'PENDING' ||
          order.status === 'CONFIRMED' ||
          (order.paymentMethod === 'COD' && order.status === 'PROCESSING')
        : order.status === 'PENDING' || order.status === 'CONFIRMED';

      if (!isEligible) {
        throw new BadRequestError(
          'ORDER_CANNOT_BE_CANCELLED',
          `Orders in ${order.status} status cannot be cancelled.`,
        );
      }

      const actorId = (params.isAdmin ? params.adminUserId : params.userId) ?? order.userId;
      const stockItems: OrderStockItem[] = order.items
        .filter((item): item is typeof item & { variantId: string } => item.variantId !== null)
        .map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
        }));

      // Restore physical stock if COD (physical stock was deducted upon order placement)
      // or release reservation if online pending
      if (
        order.paymentMethod === 'COD' &&
        (order.status === 'CONFIRMED' || order.status === 'PROCESSING')
      ) {
        await inventoryReservationService.restorePhysicalStock(tx, {
          items: stockItems,
          orderId: order.id,
          userId: order.userId,
          orderNumber: order.orderNumber,
          reason:
            params.reason ||
            `Order ${order.orderNumber} cancelled by ${params.isAdmin ? 'admin' : 'customer'}`,
          adjustedByUserId: actorId,
        });
      } else if (order.paymentMethod === 'SSLCOMMERZ' && order.status === 'PENDING') {
        await inventoryReservationService.releaseReservedStock(tx, stockItems);
      }

      // Idempotently release coupon if one was consumed
      await orderCouponService.releaseCoupon(tx, order.id);

      const now = new Date();

      // Update Order status
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          paymentStatus: 'CANCELLED',
          cancelledAt: now,
          cancellationReason: params.reason,
        },
      });

      // Cancel pending payments
      await tx.payment.updateMany({
        where: { orderId: order.id, status: 'PENDING' },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
        },
      });

      // Append status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: 'CANCELLED',
          reason: params.reason,
          changedByUserId: actorId,
        },
      });

      return await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          items: true,
          payments: true,
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });
    };

    if (outerTx) {
      return execute(outerTx);
    }
    return await prisma.$transaction(async (tx) => execute(tx));
  }

  /**
   * Compensation logic when online gateway (SSLCommerz) session initiation fails.
   * Cancels pending order, releases reserved stock and coupon, and marks payment FAILED.
   */
  async compensateOrderInitiationFailure(
    params: CompensateOrderParams,
    outerTx?: Prisma.TransactionClient,
  ): Promise<OrderWithDetails | null> {
    const execute = async (tx: Prisma.TransactionClient): Promise<OrderWithDetails | null> => {
      const order = await tx.order.findUnique({
        where: { id: params.orderId },
        include: { items: true },
      });

      if (!order || order.status !== 'PENDING') {
        return null;
      }

      const stockItems: OrderStockItem[] = order.items
        .filter((item): item is typeof item & { variantId: string } => item.variantId !== null)
        .map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
        }));

      // Release reserved stock
      await inventoryReservationService.releaseReservedStock(tx, stockItems);

      // Release coupon idempotently
      await orderCouponService.releaseCoupon(tx, order.id);

      const now = new Date();

      // Update Order to CANCELLED
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          paymentStatus: 'FAILED',
          cancelledAt: now,
          cancellationReason: params.reason,
        },
      });

      // Update pending payments to FAILED
      await tx.payment.updateMany({
        where: { orderId: order.id, status: 'PENDING' },
        data: {
          status: 'FAILED',
          failedAt: now,
        },
      });

      // Append status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: 'PENDING',
          toStatus: 'CANCELLED',
          reason: `Payment initiation compensation: ${params.reason}`,
          changedByUserId: null,
        },
      });

      return await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          items: true,
          payments: true,
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });
    };

    if (outerTx) {
      return execute(outerTx);
    }
    return await prisma.$transaction(async (tx) => execute(tx));
  }

  /**
   * Retrieves paginated orders for the authenticated customer.
   * Scoped strictly by userId.
   */
  async getCustomerOrders(
    userId: string,
    query: CustomerOrderQuery,
  ): Promise<CustomerOrderListResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(50, query.limit || 10));
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          items: {
            select: {
              id: true,
              productId: true,
              productName: true,
              variantTitle: true,
              quantity: true,
              unitPrice: true,
              lineTotal: true,
              thumbnailUrl: true,
            },
          },
        },
      }),
    ]);

    return {
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        totalPayable: o.totalPayable,
        itemCount: o.items.reduce((sum, item) => sum + item.quantity, 0),
        items: o.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          productName: i.productName,
          variantTitle: i.variantTitle,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
          thumbnailUrl: i.thumbnailUrl,
        })),
        createdAt: o.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves customer order details by orderNumber.
   * Strictly enforces customer ownership; throws NotFoundError (404) if not found or not owned.
   */
  async getCustomerOrderByNumber(
    userId: string,
    orderNumber: string,
  ): Promise<CustomerOrderDetailResponse> {
    const order = await prisma.order.findFirst({
      where: {
        orderNumber,
        userId,
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                slug: true,
              },
            },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');
    }

    const canCancel =
      (order.status === 'PENDING' || order.status === 'CONFIRMED') &&
      order.paymentStatus !== 'PAID';

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      canCancel,
      cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
      cancellationReason: order.cancellationReason,
      merchandiseSubtotal: order.merchandiseSubtotal,
      discountAmount: order.discountAmount,
      shippingFee: order.shippingFee,
      totalPayable: order.totalPayable,
      shippingAddress: {
        recipientName: order.shippingRecipientName,
        phone: order.shippingPhone,
        alternativePhone: order.shippingAlternativePhone,
        divisionId: order.shippingDivisionId,
        districtId: order.shippingDistrictId,
        upazila: order.shippingUpazila,
        streetAddress: order.shippingStreetAddress,
        deliveryNotes: order.shippingDeliveryNotes,
      },
      coupon: order.couponCode
        ? {
            code: order.couponCode,
            discountType: order.couponDiscountType ?? 'FIXED_AMOUNT',
            discountValue: order.couponDiscountValue ?? 0,
            discountAmount: order.couponDiscountAmount,
          }
        : null,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productSlug: item.product?.slug ?? null,
        variantId: item.variantId,
        productName: item.productName,
        variantTitle: item.variantTitle,
        sku: item.sku,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        attributes: (item.attributes as Record<string, unknown>) ?? null,
        thumbnailUrl: item.thumbnailUrl,
        isReviewable: order.status === 'DELIVERED',
      })),
      payments: order.payments.map((p) => ({
        id: p.id,
        transactionId: p.transactionId,
        method: p.method,
        status: p.status,
        amount: p.amount,
        createdAt: p.createdAt.toISOString(),
      })),
      statusHistory: order.statusHistory.map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        reason: h.reason,
        createdAt: h.createdAt.toISOString(),
      })),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  /**
   * Cancels an eligible customer order.
   * Strictly enforces customer ownership and cancellation eligibility.
   * Reuses cancelOrderCore inside an atomic transaction.
   */
  async cancelCustomerOrder(
    userId: string,
    orderNumber: string,
    reason?: string,
  ): Promise<OrderWithDetails> {
    const order = await prisma.order.findFirst({
      where: { orderNumber, userId },
      select: { id: true, status: true, paymentStatus: true },
    });

    if (!order) {
      throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');
    }

    if (order.status === 'CANCELLED') {
      throw new BadRequestError('ORDER_ALREADY_CANCELLED', 'This order is already cancelled.');
    }

    if (order.paymentStatus === 'PAID') {
      throw new BadRequestError(
        'PAID_ORDER_CANNOT_BE_CANCELLED',
        'Paid orders cannot be cancelled before refund processing is implemented in Phase 7.',
      );
    }

    if (order.status !== 'PENDING' && order.status !== 'CONFIRMED') {
      throw new BadRequestError(
        'ORDER_CANNOT_BE_CANCELLED',
        `Orders in ${order.status} status cannot be cancelled.`,
      );
    }

    return await this.cancelOrderCore({
      orderId: order.id,
      userId,
      reason: reason?.trim() || 'Cancelled by customer',
      isAdmin: false,
    });
  }

  /**
   * Retrieves paginated orders for the administrator with search, status, and payment filters.
   */
  async getAdminOrders(query: AdminOrderQuery): Promise<AdminOrderListResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
    };

    if (query.search) {
      const s = query.search.trim();
      where.OR = [
        { orderNumber: { contains: s, mode: 'insensitive' } },
        { shippingRecipientName: { contains: s, mode: 'insensitive' } },
        { shippingPhone: { contains: s, mode: 'insensitive' } },
        {
          user: {
            OR: [
              { email: { contains: s, mode: 'insensitive' } },
              {
                profile: {
                  OR: [
                    { firstName: { contains: s, mode: 'insensitive' } },
                    { lastName: { contains: s, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          },
        },
      ];
    }

    let orderBy: Prisma.OrderOrderByWithRelationInput = { createdAt: 'desc' };
    if (query.sortBy === 'oldest') {
      orderBy = { createdAt: 'asc' };
    } else if (query.sortBy === 'totalAsc') {
      orderBy = { totalPayable: 'asc' };
    } else if (query.sortBy === 'totalDesc') {
      orderBy = { totalPayable: 'desc' };
    }

    const [
      total,
      orders,
      allCount,
      pendingCount,
      confirmedCount,
      processingCount,
      shippedCount,
      deliveredCount,
      cancelledCount,
    ] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
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
              quantity: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.count({ where: { status: 'CONFIRMED' } }),
      prisma.order.count({ where: { status: 'PROCESSING' } }),
      prisma.order.count({ where: { status: 'SHIPPED' } }),
      prisma.order.count({ where: { status: 'DELIVERED' } }),
      prisma.order.count({ where: { status: 'CANCELLED' } }),
    ]);

    const mappedOrders: AdminOrderSummaryItem[] = orders.map((o) => {
      const prof = o.user.profile;
      const customerName = prof?.firstName
        ? `${prof.firstName} ${prof.lastName || ''}`.trim()
        : o.user.email;

      return {
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        totalPayable: o.totalPayable,
        itemCount: o.items.reduce((sum, item) => sum + item.quantity, 0),
        customer: {
          id: o.user.id,
          email: o.user.email,
          name: customerName,
          phone: prof?.phone || null,
        },
        shippingAddress: {
          recipientName: o.shippingRecipientName,
          phone: o.shippingPhone,
          districtId: o.shippingDistrictId,
          streetAddress: o.shippingStreetAddress,
        },
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      };
    });

    return {
      orders: mappedOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      statusCounts: {
        all: allCount,
        pending: pendingCount,
        confirmed: confirmedCount,
        processing: processingCount,
        shipped: shippedCount,
        delivered: deliveredCount,
        cancelled: cancelledCount,
      },
    };
  }

  /**
   * Retrieves full admin order detail by order ID or orderNumber.
   * Includes complete snapshot, customer info, sanitized payment records, and status history with actor name.
   */
  async getAdminOrderById(idOrOrderNumber: string): Promise<AdminOrderDetailResponse> {
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: idOrOrderNumber }, { orderNumber: idOrOrderNumber }],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            createdAt: true,
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
          include: {
            product: {
              select: { slug: true },
            },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
        statusHistory: {
          include: {
            changedByUser: {
              select: {
                id: true,
                email: true,
                role: true,
                profile: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');
    }

    // Determine allowed next statuses according to state machine
    const allowedNextStatuses: OrderStatus[] = [];
    if (order.status === 'CONFIRMED') {
      // Allowed if COD or verified PAID online
      if (order.paymentMethod === 'COD' || order.paymentStatus === 'PAID') {
        allowedNextStatuses.push('PROCESSING');
      }
    } else if (order.status === 'PROCESSING') {
      allowedNextStatuses.push('SHIPPED');
    } else if (order.status === 'SHIPPED') {
      allowedNextStatuses.push('DELIVERED');
    }
    // PENDING cannot be manually confirmed by admin (prohibition preserved)
    // DELIVERED and CANCELLED have no further transitions

    const canCancel =
      order.paymentStatus !== 'PAID' &&
      (order.status === 'PENDING' ||
        order.status === 'CONFIRMED' ||
        (order.paymentMethod === 'COD' && order.status === 'PROCESSING'));

    const canMarkCodPaid =
      order.paymentMethod === 'COD' &&
      order.status === 'DELIVERED' &&
      order.paymentStatus !== 'PAID';

    const customer = {
      id: order.user.id,
      email: order.user.email,
      firstName: order.user.profile?.firstName || null,
      lastName: order.user.profile?.lastName || null,
      phone: order.user.profile?.phone || null,
      role: order.user.role,
      createdAt: order.user.createdAt.toISOString(),
    };

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
      cancellationReason: order.cancellationReason,
      merchandiseSubtotal: order.merchandiseSubtotal,
      discountAmount: order.discountAmount,
      shippingFee: order.shippingFee,
      totalPayable: order.totalPayable,
      customer,
      shippingAddress: {
        recipientName: order.shippingRecipientName,
        phone: order.shippingPhone,
        alternativePhone: order.shippingAlternativePhone,
        divisionId: order.shippingDivisionId,
        districtId: order.shippingDistrictId,
        upazila: order.shippingUpazila,
        streetAddress: order.shippingStreetAddress,
        deliveryNotes: order.shippingDeliveryNotes,
      },
      coupon: order.couponCode
        ? {
            code: order.couponCode,
            discountType: order.couponDiscountType ?? 'FIXED_AMOUNT',
            discountValue: order.couponDiscountValue ?? 0,
            discountAmount: order.couponDiscountAmount,
          }
        : null,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productSlug: item.product?.slug ?? null,
        variantId: item.variantId,
        productName: item.productName,
        variantTitle: item.variantTitle,
        sku: item.sku,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        attributes: (item.attributes as Record<string, unknown>) ?? null,
        thumbnailUrl: item.thumbnailUrl,
        isReviewable: order.status === 'DELIVERED',
      })),
      // Safe-field allowlist: gatewayTransactionId included, credentials/gatewayResponse omitted
      payments: order.payments.map((p) => ({
        id: p.id,
        transactionId: p.transactionId,
        gatewayTransactionId: p.gatewayTransactionId,
        method: p.method,
        status: p.status,
        amount: p.amount,
        currency: p.currency,
        paidAt: p.paidAt ? p.paidAt.toISOString() : null,
        failedAt: p.failedAt ? p.failedAt.toISOString() : null,
        cancelledAt: p.cancelledAt ? p.cancelledAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
      })),
      statusHistory: order.statusHistory.map((h) => {
        let changedByName = 'System';
        if (h.changedByUser) {
          const prof = h.changedByUser.profile;
          changedByName = prof?.firstName
            ? `${prof.firstName} ${prof.lastName || ''}`.trim()
            : h.changedByUser.email;
        }
        return {
          id: h.id,
          fromStatus: h.fromStatus,
          toStatus: h.toStatus,
          reason: h.reason,
          changedByUserId: h.changedByUserId,
          changedByName,
          changedByRole: h.changedByUser?.role || null,
          createdAt: h.createdAt.toISOString(),
        };
      }),
      allowedNextStatuses,
      canCancel,
      canMarkCodPaid,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  /**
   * Admin-authorized order status transitions following the approved state machine.
   * PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED.
   * Applies Order-first row locking and validates transition eligibility.
   */
  async updateOrderStatus(
    adminUserId: string,
    idOrOrderNumber: string,
    newStatus: OrderStatus,
    reason: string,
  ): Promise<OrderWithDetails> {
    return await prisma.$transaction(async (tx) => {
      const orderRecord = await tx.order.findFirst({
        where: {
          OR: [{ id: idOrOrderNumber }, { orderNumber: idOrOrderNumber }],
        },
        select: { id: true },
      });

      if (!orderRecord) {
        throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');
      }

      // Order-first row locking to serialize concurrent operations
      await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${orderRecord.id} FOR UPDATE`;

      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderRecord.id },
      });

      if (order.status === 'CANCELLED') {
        throw new BadRequestError(
          'INVALID_STATUS_TRANSITION',
          'Cancelled orders cannot be transitioned.',
        );
      }

      if (order.status === newStatus) {
        throw new BadRequestError(
          'INVALID_STATUS_TRANSITION',
          `Order is already in ${newStatus} status.`,
        );
      }

      // State machine validation
      if (order.status === 'PENDING') {
        if (newStatus === 'CONFIRMED') {
          // Clarification 3: Prohibition on manual confirmation of unpaid SSLCommerz orders
          if (order.paymentMethod === 'SSLCOMMERZ' && order.paymentStatus !== 'PAID') {
            throw new BadRequestError(
              'UNPAID_ONLINE_ORDER_CANNOT_BE_CONFIRMED',
              'Unpaid SSLCommerz online orders cannot be manually confirmed by admin.',
            );
          }
        } else {
          throw new BadRequestError(
            'INVALID_STATUS_TRANSITION',
            `Orders in PENDING status can only transition to CONFIRMED, not ${newStatus}.`,
          );
        }
      } else if (order.status === 'CONFIRMED') {
        if (newStatus !== 'PROCESSING') {
          throw new BadRequestError(
            'INVALID_STATUS_TRANSITION',
            `Orders in CONFIRMED status can only transition to PROCESSING, not ${newStatus}.`,
          );
        }
        // Clarification 3: CONFIRMED -> PROCESSING is allowed only for COD orders or online orders with verified PAID status
        if (order.paymentMethod === 'SSLCOMMERZ' && order.paymentStatus !== 'PAID') {
          throw new BadRequestError(
            'ORDER_NOT_READY_FOR_PROCESSING',
            'Online orders must have verified PAID status before transitioning to PROCESSING.',
          );
        }
      } else if (order.status === 'PROCESSING') {
        if (newStatus !== 'SHIPPED') {
          throw new BadRequestError(
            'INVALID_STATUS_TRANSITION',
            `Orders in PROCESSING status can only transition to SHIPPED, not ${newStatus}.`,
          );
        }
      } else if (order.status === 'SHIPPED') {
        if (newStatus !== 'DELIVERED') {
          throw new BadRequestError(
            'INVALID_STATUS_TRANSITION',
            `Orders in SHIPPED status can only transition to DELIVERED, not ${newStatus}.`,
          );
        }
      } else if (order.status === 'DELIVERED') {
        throw new BadRequestError(
          'INVALID_STATUS_TRANSITION',
          'Delivered orders cannot be transitioned further.',
        );
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: newStatus },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: newStatus,
          reason,
          changedByUserId: adminUserId,
        },
      });

      return await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          items: true,
          payments: true,
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });
    });
  }

  /**
   * Admin cancellation of an eligible unpaid order.
   * Allows PENDING, CONFIRMED, and unpaid COD orders in PROCESSING.
   * Reuses cancelOrderCore inside an atomic transaction.
   */
  async cancelAdminOrder(
    adminUserId: string,
    idOrOrderNumber: string,
    reason: string,
  ): Promise<OrderWithDetails> {
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: idOrOrderNumber }, { orderNumber: idOrOrderNumber }],
      },
      select: { id: true },
    });

    if (!order) {
      throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');
    }

    return await this.cancelOrderCore({
      orderId: order.id,
      adminUserId,
      reason,
      isAdmin: true,
    });
  }

  /**
   * Admin marking of COD payment collection as PAID.
   * Allowed ONLY after order reaches DELIVERED.
   * Locks Order first, then Payments; updates exactly one eligible PENDING COD payment.
   */
  async markCodPaymentPaid(
    adminUserId: string,
    idOrOrderNumber: string,
    note?: string,
  ): Promise<OrderWithDetails> {
    return await prisma.$transaction(async (tx) => {
      const orderRecord = await tx.order.findFirst({
        where: {
          OR: [{ id: idOrOrderNumber }, { orderNumber: idOrOrderNumber }],
        },
        select: { id: true },
      });

      if (!orderRecord) {
        throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');
      }

      // Order-first row locking, then Payment locking
      await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${orderRecord.id} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "Payment" WHERE "orderId" = ${orderRecord.id} FOR UPDATE`;

      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderRecord.id },
        include: { payments: true },
      });

      if (order.paymentMethod !== 'COD') {
        throw new BadRequestError(
          'PAYMENT_METHOD_NOT_COD',
          'Only Cash on Delivery orders can be marked as paid via this endpoint.',
        );
      }

      if (order.paymentStatus === 'PAID') {
        throw new BadRequestError(
          'PAYMENT_ALREADY_PAID',
          'Order payment is already marked as PAID.',
        );
      }

      if (order.status !== 'DELIVERED') {
        throw new BadRequestError(
          'COD_PAYMENT_REQUIRES_DELIVERED_STATUS',
          'COD payment can only be marked as PAID after order reaches DELIVERED status.',
        );
      }

      // Update exactly one eligible PENDING COD payment
      const eligiblePayment = order.payments.find(
        (p) => p.method === 'COD' && p.status === 'PENDING',
      );

      if (!eligiblePayment) {
        throw new BadRequestError(
          'NO_ELIGIBLE_PENDING_PAYMENT',
          'No eligible pending COD payment record found to mark as paid.',
        );
      }

      const now = new Date();
      await tx.payment.update({
        where: { id: eligiblePayment.id },
        data: {
          status: 'PAID',
          paidAt: now,
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
          fromStatus: order.status,
          toStatus: order.status,
          reason: note?.trim() || 'COD payment collected upon delivery',
          changedByUserId: adminUserId,
        },
      });

      return await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          items: true,
          payments: true,
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });
    });
  }
}

export const orderService = new OrderService();
