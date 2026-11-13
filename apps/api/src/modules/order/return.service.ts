import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import {
  calculateProportionalUnitPrice,
  calculateReturnItemRefunds,
  checkReturnWindowEligibility,
  calculatePaymentRefundCapacity,
  calculateOrderRefundCapacity,
  calculateMerchandiseRefundCapacity,
  calculateCommittedMerchandiseRefunds,
  type ReturnableLineItem,
} from './return-math.js';
import { generateReturnNumber, generateRefundNumber } from './order.utils.js';
import { MAX_ORDER_NUMBER_GENERATION_RETRIES } from './order.constants.js';
import { sslcommerzService } from '../payment/sslcommerz.service.js';
import type {
  CreateReturnInput,
  CustomerReturnListQuery,
  AdminReturnListQuery,
  AdminApproveReturnInput,
  AdminRejectReturnInput,
  AdminInspectReturnInput,
  AdminProcessRefundInput,
} from './return.schemas.js';
import type {
  Prisma,
  ReturnRequest,
  ReturnItem,
  ReturnStatusHistory,
  Refund,
  ReturnRequestStatus,
  ReturnItemCondition,
  RefundStatus,
  RefundMethod,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
} from '../../generated/client/client.js';

export interface CustomerReturnEligibilityItem {
  orderItemId: string;
  productId: string | null;
  productName: string;
  variantTitle: string;
  sku: string;
  thumbnailUrl: string | null;
  unitPrice: number;
  netUnitPrice: number;
  orderedQuantity: number;
  returnableQuantity: number;
  isReturnable: boolean;
}

export interface CustomerReturnEligibilityResponse {
  isEligible: boolean;
  reason?: string;
  calendarDaysPassed: number;
  daysRemaining: number;
  deliveryDateDhaka: string | null;
  cutoffDateDhaka: string | null;
  orderNumber: string;
  items: CustomerReturnEligibilityItem[];
}

export interface CustomerReturnItemDetail {
  id: string;
  orderItemId: string;
  productName: string;
  variantTitle: string;
  sku: string;
  thumbnailUrl: string | null;
  unitPrice: number;
  quantity: number;
  reason: string;
}

export interface CustomerReturnStatusHistoryItem {
  id: string;
  fromStatus: ReturnRequestStatus | null;
  toStatus: ReturnRequestStatus;
  reason: string | null;
  createdAt: Date;
}

export interface CustomerReturnDetail {
  id: string;
  returnNumber: string;
  orderNumber: string;
  status: ReturnRequestStatus;
  customerReason: string;
  customerNotes: string | null;
  rejectionReason: string | null;
  estimatedRefundAmount: number;
  actualRefundAmount: number | null;
  createdAt: Date;
  updatedAt: Date;
  items: CustomerReturnItemDetail[];
  statusHistory: CustomerReturnStatusHistoryItem[];
}

export interface CustomerReturnSummary {
  id: string;
  returnNumber: string;
  orderNumber: string;
  status: ReturnRequestStatus;
  itemCount: number;
  estimatedRefundAmount: number;
  actualRefundAmount: number | null;
  createdAt: Date;
}

export interface AdminReturnSummary {
  id: string;
  returnNumber: string;
  orderNumber: string;
  customer: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
  };
  status: ReturnRequestStatus;
  itemCount: number;
  estimatedRefundAmount: number;
  actualRefundAmount: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminReturnItemDetail {
  id: string;
  orderItemId: string;
  variantId: string | null;
  productName: string;
  variantTitle: string;
  sku: string;
  thumbnailUrl: string | null;
  unitPrice: number;
  quantity: number;
  reason: string;
  condition: ReturnItemCondition | null;
  restockedQuantity: number;
  inspectionNotes: string | null;
  inspectedAt: Date | null;
  inspectedByUser: {
    id: string;
    email: string;
    name: string;
  } | null;
}

export interface AdminReturnStatusHistoryItem {
  id: string;
  fromStatus: ReturnRequestStatus | null;
  toStatus: ReturnRequestStatus;
  reason: string | null;
  createdAt: Date;
  changedByUser: {
    id: string;
    email: string;
    name: string;
  } | null;
}

export interface AdminReturnDetail {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  customer: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
  };
  status: ReturnRequestStatus;
  customerReason: string;
  customerNotes: string | null;
  rejectionReason: string | null;
  estimatedRefundAmount: number;
  actualRefundAmount: number | null;
  shippingFeeRefunded: boolean;
  createdAt: Date;
  updatedAt: Date;
  orderSummary: {
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
    totalPayable: number;
    merchandiseSubtotal: number;
    deliveredAt: Date | null;
  };
  items: AdminReturnItemDetail[];
  statusHistory: AdminReturnStatusHistoryItem[];
  refunds: Array<{
    id: string;
    refundNumber: string;
    paymentId: string;
    amount: number;
    merchandiseAmount: number;
    shippingAmount: number;
    method: RefundMethod;
    status: RefundStatus;
    gatewayReference: string | null;
    payoutReference: string | null;
    payoutChannel: string | null;
    failureReason: string | null;
    processedAt: Date | null;
    createdAt: Date;
  }>;
}

export interface AdminRefundPreview {
  returnNumber: string;
  returnStatus: ReturnRequestStatus;
  orderNumber: string;
  orderStatus: OrderStatus;
  orderPaymentStatus: PaymentStatus;
  calculatedMerchandiseRefund: number;
  defaultShippingRefund: number;
  availableOrderCapacity: number;
  availableMerchandiseCapacity: number;
  targetPayment: {
    id: string;
    method: PaymentMethod;
    transactionId: string;
    gatewayTransactionId: string | null;
    amount: number;
    availableCapacity: number;
  } | null;
  eligiblePayments: Array<{
    id: string;
    method: PaymentMethod;
    transactionId: string;
    gatewayTransactionId: string | null;
    amount: number;
    availableCapacity: number;
  }>;
  hasPendingRefund: boolean;
  pendingRefund?: {
    id: string;
    refundNumber: string;
    amount: number;
    method: RefundMethod;
    status: RefundStatus;
    createdAt: Date;
  };
}

type AdminReturnRecordWithRelations = ReturnRequest & {
  order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
    totalPayable: number;
    merchandiseSubtotal: number;
    statusHistory?: Array<{ createdAt: Date }>;
  };
  user: {
    id: string;
    email: string;
    profile: { firstName: string; lastName: string; phone: string | null } | null;
  };
  items: Array<
    ReturnItem & {
      orderItem: {
        variantId: string | null;
        productName: string;
        variantTitle: string;
        sku: string;
        thumbnailUrl: string | null;
        unitPrice: number;
      };
      inspectedByUser: {
        id: string;
        email: string;
        profile: { firstName: string; lastName: string } | null;
      } | null;
    }
  >;
  statusHistory: Array<
    ReturnStatusHistory & {
      changedByUser: {
        id: string;
        email: string;
        profile: { firstName: string; lastName: string } | null;
      } | null;
    }
  >;
  refunds?: Refund[];
};

type ReturnWithDetails = ReturnRequest & {
  order: { orderNumber: string };
  items: Array<
    ReturnItem & {
      orderItem: {
        productName: string;
        variantTitle: string;
        sku: string;
        thumbnailUrl: string | null;
        unitPrice: number;
      };
    }
  >;
  statusHistory: ReturnStatusHistory[];
};

export class ReturnService {
  /**
   * Evaluates customer return eligibility for a delivered and paid order.
   * Calculates the 7-calendar-day Asia/Dhaka window and remaining returnable quantities.
   */
  async checkCustomerReturnEligibility(
    userId: string,
    orderNumber: string,
  ): Promise<CustomerReturnEligibilityResponse> {
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');
    }

    if (order.status !== 'DELIVERED') {
      return {
        isEligible: false,
        reason: 'ORDER_NOT_DELIVERED',
        calendarDaysPassed: 0,
        daysRemaining: 0,
        deliveryDateDhaka: null,
        cutoffDateDhaka: null,
        orderNumber,
        items: [],
      };
    }

    if (order.paymentStatus !== 'PAID') {
      return {
        isEligible: false,
        reason: 'ORDER_NOT_PAID',
        calendarDaysPassed: 0,
        daysRemaining: 0,
        deliveryDateDhaka: null,
        cutoffDateDhaka: null,
        orderNumber,
        items: [],
      };
    }

    // Identify most recent DELIVERED status transition
    const deliveredHistory = order.statusHistory.find((sh) => sh.toStatus === 'DELIVERED');
    const windowResult = checkReturnWindowEligibility(deliveredHistory?.createdAt, new Date());

    if (!windowResult.isEligible) {
      return {
        isEligible: false,
        reason: windowResult.reason,
        calendarDaysPassed: windowResult.calendarDaysPassed,
        daysRemaining: windowResult.daysRemaining,
        deliveryDateDhaka: windowResult.deliveryDateDhaka,
        cutoffDateDhaka: windowResult.cutoffDateDhaka,
        orderNumber,
        items: [],
      };
    }

    // Query active committed return quantities (REQUESTED, APPROVED, RECEIVED, COMPLETED)
    const activeReturnItems = await prisma.returnItem.findMany({
      where: {
        returnRequest: {
          orderId: order.id,
          status: { in: ['REQUESTED', 'APPROVED', 'RECEIVED', 'COMPLETED'] },
        },
      },
      select: { orderItemId: true, quantity: true },
    });

    const committedMap = new Map<string, number>();
    for (const rItem of activeReturnItems) {
      committedMap.set(
        rItem.orderItemId,
        (committedMap.get(rItem.orderItemId) ?? 0) + rItem.quantity,
      );
    }

    const items: CustomerReturnEligibilityItem[] = order.items.map((item) => {
      const committedQty = committedMap.get(item.id) ?? 0;
      const returnableQuantity = Math.max(0, item.quantity - committedQty);
      const netUnitPrice = calculateProportionalUnitPrice(
        item.unitPrice,
        order.merchandiseSubtotal,
        order.couponDiscountAmount,
      );

      return {
        orderItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        variantTitle: item.variantTitle,
        sku: item.sku,
        thumbnailUrl: item.thumbnailUrl,
        unitPrice: item.unitPrice,
        netUnitPrice,
        orderedQuantity: item.quantity,
        returnableQuantity,
        isReturnable: returnableQuantity > 0,
      };
    });

    const hasAnyReturnable = items.some((i) => i.isReturnable);

    return {
      isEligible: hasAnyReturnable,
      reason: hasAnyReturnable ? undefined : 'NO_RETURNABLE_ITEMS',
      calendarDaysPassed: windowResult.calendarDaysPassed,
      daysRemaining: windowResult.daysRemaining,
      deliveryDateDhaka: windowResult.deliveryDateDhaka,
      cutoffDateDhaka: windowResult.cutoffDateDhaka,
      orderNumber,
      items,
    };
  }

  /**
   * Submits a customer return request under an atomic Order row-lock transaction.
   * Revalidates eligibility, remaining quantities, and computes estimated refund.
   */
  async createCustomerReturnRequest(
    userId: string,
    orderNumber: string,
    input: CreateReturnInput,
  ): Promise<CustomerReturnDetail> {
    return await prisma.$transaction(async (tx) => {
      // 1. Initial order lookup
      const order = await tx.order.findUnique({
        where: { orderNumber },
        include: {
          items: true,
          statusHistory: { orderBy: { createdAt: 'desc' } },
        },
      });

      if (!order || order.userId !== userId) {
        throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');
      }

      // 2. Lock Order row strictly
      await tx.$queryRaw`SELECT id, "userId", status, "paymentStatus" FROM "Order" WHERE id = ${order.id} FOR UPDATE`;

      // 3. Re-verify order state under lock
      if (order.status !== 'DELIVERED') {
        throw new BadRequestError(
          'ORDER_NOT_DELIVERED',
          'Returns can only be requested for delivered orders',
        );
      }

      if (order.paymentStatus !== 'PAID') {
        throw new BadRequestError(
          'ORDER_NOT_PAID',
          'Returns can only be requested for paid orders',
        );
      }

      const deliveredHistory = order.statusHistory.find((sh) => sh.toStatus === 'DELIVERED');
      const windowResult = checkReturnWindowEligibility(deliveredHistory?.createdAt, new Date());
      if (!windowResult.isEligible) {
        throw new BadRequestError(
          windowResult.reason || 'RETURN_WINDOW_EXPIRED',
          'Return window has expired for this order',
        );
      }

      // 4. Query active committed return quantities under lock
      const activeReturnItems = await tx.returnItem.findMany({
        where: {
          returnRequest: {
            orderId: order.id,
            status: { in: ['REQUESTED', 'APPROVED', 'RECEIVED', 'COMPLETED'] },
          },
        },
        select: { orderItemId: true, quantity: true },
      });

      const committedMap = new Map<string, number>();
      for (const rItem of activeReturnItems) {
        committedMap.set(
          rItem.orderItemId,
          (committedMap.get(rItem.orderItemId) ?? 0) + rItem.quantity,
        );
      }

      const deliveredItems: ReturnableLineItem[] = order.items.map((item) => ({
        orderItemId: item.id,
        unitPrice: item.unitPrice,
        deliveredQuantity: item.quantity,
        previouslyCommittedQuantity: committedMap.get(item.id) ?? 0,
      }));

      // 5. Compute estimated refund & validate quantities
      const refundCalc = calculateReturnItemRefunds({
        merchandiseSubtotal: order.merchandiseSubtotal,
        couponDiscountAmount: order.couponDiscountAmount,
        deliveredItems,
        requestedItems: input.items.map((it) => ({
          orderItemId: it.orderItemId,
          quantity: it.quantity,
        })),
      });

      // 6. Generate unique returnNumber
      let returnNumber = generateReturnNumber();
      let attempts = 0;
      while (attempts < MAX_ORDER_NUMBER_GENERATION_RETRIES) {
        const existing = await tx.returnRequest.findUnique({ where: { returnNumber } });
        if (!existing) break;
        returnNumber = generateReturnNumber();
        attempts++;
      }

      // 7. Atomically create ReturnRequest, ReturnItems, and ReturnStatusHistory
      const createdReturn = await tx.returnRequest.create({
        data: {
          returnNumber,
          orderId: order.id,
          userId,
          status: 'REQUESTED',
          customerReason: input.customerReason,
          customerNotes: input.customerNotes,
          estimatedRefundAmount: refundCalc.totalMerchandiseRefundAmount,
          shippingFeeRefunded: false,
          items: {
            create: input.items.map((it) => ({
              orderItemId: it.orderItemId,
              quantity: it.quantity,
              reason: it.reason || input.customerReason,
              condition: null,
              restockedQuantity: 0,
            })),
          },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'REQUESTED',
              reason: 'Customer initiated return request',
              changedByUserId: userId,
            },
          },
        },
        include: {
          order: { select: { orderNumber: true } },
          items: { include: { orderItem: true } },
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });

      return this.formatCustomerReturnDetail(createdReturn);
    });
  }

  /**
   * Retrieves paginated list of returns submitted by authenticated customer.
   */
  async listCustomerReturns(
    userId: string,
    query: CustomerReturnListQuery,
  ): Promise<{
    returns: CustomerReturnSummary[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const where = {
      userId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, rawReturns] = await Promise.all([
      prisma.returnRequest.count({ where }),
      prisma.returnRequest.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: { select: { orderNumber: true } },
          items: { select: { quantity: true } },
        },
      }),
    ]);

    const returns: CustomerReturnSummary[] = rawReturns.map((r) => ({
      id: r.id,
      returnNumber: r.returnNumber,
      orderNumber: r.order.orderNumber,
      status: r.status,
      itemCount: r.items.reduce((s, it) => s + it.quantity, 0),
      estimatedRefundAmount: r.estimatedRefundAmount,
      actualRefundAmount: r.actualRefundAmount,
      createdAt: r.createdAt,
    }));

    return {
      returns,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }

  /**
   * Retrieves single return detail for authenticated customer with safe field projection.
   */
  async getCustomerReturnDetail(
    userId: string,
    returnNumber: string,
  ): Promise<CustomerReturnDetail> {
    const returnRequest = await prisma.returnRequest.findUnique({
      where: { returnNumber },
      include: {
        order: { select: { orderNumber: true } },
        items: { include: { orderItem: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!returnRequest || returnRequest.userId !== userId) {
      throw new NotFoundError('RETURN_NOT_FOUND', 'Return request not found');
    }

    return this.formatCustomerReturnDetail(returnRequest);
  }

  /**
   * Cancels a customer return request in REQUESTED status following strict Order-first row locking.
   */
  async cancelCustomerReturnRequest(
    userId: string,
    returnNumber: string,
    reason?: string,
  ): Promise<CustomerReturnDetail> {
    // 1. Preliminary ownership-scoped lookup
    const initialReturn = await prisma.returnRequest.findUnique({
      where: { returnNumber },
      select: { id: true, userId: true, orderId: true, status: true },
    });

    if (!initialReturn || initialReturn.userId !== userId) {
      throw new NotFoundError('RETURN_NOT_FOUND', 'Return request not found');
    }

    return await prisma.$transaction(async (tx) => {
      // 2. Lock Order first
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${initialReturn.orderId} FOR UPDATE`;

      // 3. Lock ReturnRequest second
      const [lockedReturn] = await tx.$queryRaw<
        Array<{ id: string; userId: string; status: ReturnRequestStatus }>
      >`
        SELECT id, "userId", status FROM "ReturnRequest" WHERE id = ${initialReturn.id} FOR UPDATE
      `;

      // 4. Recheck ownership and status
      if (!lockedReturn || lockedReturn.userId !== userId) {
        throw new NotFoundError('RETURN_NOT_FOUND', 'Return request not found');
      }

      if (lockedReturn.status === 'CANCELLED') {
        throw new BadRequestError(
          'RETURN_ALREADY_CANCELLED',
          'Return request is already cancelled',
        );
      }

      if (lockedReturn.status !== 'REQUESTED') {
        throw new BadRequestError(
          'RETURN_NOT_CANCELLABLE',
          `Cannot cancel return in status "${lockedReturn.status}". Only REQUESTED returns can be cancelled.`,
        );
      }

      // 5. Update status and insert ReturnStatusHistory atomically
      const updatedReturn = await tx.returnRequest.update({
        where: { id: lockedReturn.id },
        data: {
          status: 'CANCELLED',
          statusHistory: {
            create: {
              fromStatus: 'REQUESTED',
              toStatus: 'CANCELLED',
              reason: reason || 'Customer cancelled return request',
              changedByUserId: userId,
            },
          },
        },
        include: {
          order: { select: { orderNumber: true } },
          items: { include: { orderItem: true } },
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });

      return this.formatCustomerReturnDetail(updatedReturn);
    });
  }

  /**
   * Helper formatting customer-safe ReturnDetail projection.
   * Redacts administrative internal data, staff user IDs, and raw financial data.
   */
  private formatCustomerReturnDetail(r: ReturnWithDetails): CustomerReturnDetail {
    return {
      id: r.id,
      returnNumber: r.returnNumber,
      orderNumber: r.order.orderNumber,
      status: r.status,
      customerReason: r.customerReason,
      customerNotes: r.customerNotes,
      rejectionReason: r.rejectionReason,
      estimatedRefundAmount: r.estimatedRefundAmount,
      actualRefundAmount: r.actualRefundAmount,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      items: r.items.map((it) => ({
        id: it.id,
        orderItemId: it.orderItemId,
        productName: it.orderItem.productName,
        variantTitle: it.orderItem.variantTitle,
        sku: it.orderItem.sku,
        thumbnailUrl: it.orderItem.thumbnailUrl,
        unitPrice: it.orderItem.unitPrice,
        quantity: it.quantity,
        reason: it.reason,
      })),
      statusHistory: r.statusHistory.map((sh) => ({
        id: sh.id,
        fromStatus: sh.fromStatus,
        toStatus: sh.toStatus,
        reason: sh.reason,
        createdAt: sh.createdAt,
      })),
    };
  }

  /**
   * Retrieves paginated list of return requests for admin operations.
   * Supports filtering by status, orderNumber, returnNumber, and date range.
   */
  async listAdminReturns(query: AdminReturnListQuery): Promise<{
    returns: AdminReturnSummary[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const where: Prisma.ReturnRequestWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.returnNumber) {
      where.returnNumber = { contains: query.returnNumber.trim(), mode: 'insensitive' };
    }

    if (query.orderNumber) {
      where.order = { orderNumber: { contains: query.orderNumber.trim(), mode: 'insensitive' } };
    }

    const createdAtFilter: Prisma.DateTimeFilter = {};
    if (query.startDate) {
      const start = new Date(query.startDate);
      if (isNaN(start.getTime()))
        throw new BadRequestError('INVALID_DATE_FORMAT', 'Invalid startDate format');
      createdAtFilter.gte = start;
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      if (isNaN(end.getTime()))
        throw new BadRequestError('INVALID_DATE_FORMAT', 'Invalid endDate format');
      createdAtFilter.lte = end;
    }
    if (Object.keys(createdAtFilter).length > 0) {
      where.createdAt = createdAtFilter;
    }

    const [total, rawReturns] = await Promise.all([
      prisma.returnRequest.count({ where }),
      prisma.returnRequest.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: query.sortBy === 'createdAt:asc' ? { createdAt: 'asc' } : { createdAt: 'desc' },
        include: {
          order: { select: { orderNumber: true } },
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { firstName: true, lastName: true, phone: true } },
            },
          },
          items: { select: { quantity: true } },
        },
      }),
    ]);

    const returns: AdminReturnSummary[] = rawReturns.map((r) => {
      const name = r.user.profile
        ? `${r.user.profile.firstName} ${r.user.profile.lastName}`.trim()
        : r.user.email;
      return {
        id: r.id,
        returnNumber: r.returnNumber,
        orderNumber: r.order.orderNumber,
        customer: {
          id: r.user.id,
          email: r.user.email,
          name: name || r.user.email,
          phone: r.user.profile?.phone || null,
        },
        status: r.status,
        itemCount: r.items.reduce((s, it) => s + it.quantity, 0),
        estimatedRefundAmount: r.estimatedRefundAmount,
        actualRefundAmount: r.actualRefundAmount,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });

    return {
      returns,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /**
   * Retrieves detailed operational return data for admin inspection.
   * Excludes sensitive payment tokens, hashes, and secrets.
   */
  async getAdminReturnDetail(returnNumber: string): Promise<AdminReturnDetail> {
    return this.fetchAdminReturnDetailInTx(prisma, returnNumber);
  }

  /**
   * Approves a return request under an atomic Order row-lock transaction.
   * State transition: REQUESTED -> APPROVED.
   */
  async approveReturnRequest(
    adminId: string,
    returnNumber: string,
    input: AdminApproveReturnInput,
  ): Promise<AdminReturnDetail> {
    const initialReturn = await prisma.returnRequest.findUnique({
      where: { returnNumber },
      select: { id: true, orderId: true, status: true },
    });

    if (!initialReturn) {
      throw new NotFoundError('RETURN_NOT_FOUND', 'Return request not found');
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Lock Order first
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${initialReturn.orderId} FOR UPDATE`;

      // 2. Lock ReturnRequest second
      const [locked] = await tx.$queryRaw<Array<{ id: string; status: ReturnRequestStatus }>>`
        SELECT id, status FROM "ReturnRequest" WHERE id = ${initialReturn.id} FOR UPDATE
      `;

      if (!locked) {
        throw new NotFoundError('RETURN_NOT_FOUND', 'Return request not found');
      }

      if (locked.status !== 'REQUESTED') {
        throw new BadRequestError(
          'INVALID_RETURN_STATUS',
          `Cannot approve return in status "${locked.status}". Only REQUESTED returns can be approved.`,
        );
      }

      await tx.returnRequest.update({
        where: { id: locked.id },
        data: {
          status: 'APPROVED',
          statusHistory: {
            create: {
              fromStatus: 'REQUESTED',
              toStatus: 'APPROVED',
              reason: input.notes?.trim() || 'Return request approved by admin',
              changedByUserId: adminId,
            },
          },
        },
      });

      return await this.fetchAdminReturnDetailInTx(tx, returnNumber);
    });
  }

  /**
   * Rejects a return request under an atomic Order row-lock transaction.
   * State transition: REQUESTED -> REJECTED.
   * Requires mandatory rejectionReason.
   */
  async rejectReturnRequest(
    adminId: string,
    returnNumber: string,
    input: AdminRejectReturnInput,
  ): Promise<AdminReturnDetail> {
    const initialReturn = await prisma.returnRequest.findUnique({
      where: { returnNumber },
      select: { id: true, orderId: true, status: true },
    });

    if (!initialReturn) {
      throw new NotFoundError('RETURN_NOT_FOUND', 'Return request not found');
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Lock Order first
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${initialReturn.orderId} FOR UPDATE`;

      // 2. Lock ReturnRequest second
      const [locked] = await tx.$queryRaw<Array<{ id: string; status: ReturnRequestStatus }>>`
        SELECT id, status FROM "ReturnRequest" WHERE id = ${initialReturn.id} FOR UPDATE
      `;

      if (!locked) {
        throw new NotFoundError('RETURN_NOT_FOUND', 'Return request not found');
      }

      if (locked.status !== 'REQUESTED') {
        throw new BadRequestError(
          'INVALID_RETURN_STATUS',
          `Cannot reject return in status "${locked.status}". Only REQUESTED returns can be rejected.`,
        );
      }

      const rejectionReason = input.reason.trim();
      await tx.returnRequest.update({
        where: { id: locked.id },
        data: {
          status: 'REJECTED',
          rejectionReason,
          statusHistory: {
            create: {
              fromStatus: 'REQUESTED',
              toStatus: 'REJECTED',
              reason: input.notes?.trim()
                ? `${rejectionReason} - ${input.notes.trim()}`
                : rejectionReason,
              changedByUserId: adminId,
            },
          },
        },
      });

      return await this.fetchAdminReturnDetailInTx(tx, returnNumber);
    });
  }

  /**
   * Executes physical inspection of returned items under an atomic transaction.
   * Lock sequence: Order first -> ReturnRequest second -> InventoryItem rows (sorted by variantId ASC).
   *
   * Clarification 1:
   * - Must cover the full approved quantity of every ReturnItem before transitioning to RECEIVED.
   * - inspectedQuantity may be omitted and default to ReturnItem.quantity.
   * - If supplied, it must equal ReturnItem.quantity.
   * - Reject partial inspection; do not transition to RECEIVED with uninspected quantities.
   *
   * Clarification 2:
   * - GOOD-item restocking must preserve inventory invariants:
   *   quantity >= 0, quantity >= reservedQuantity, reservedQuantity unchanged.
   * - Inventory quantity updates and RETURN_RESTOCK audit records must commit atomically.
   */
  async inspectReturnRequest(
    adminId: string,
    returnNumber: string,
    input: AdminInspectReturnInput,
  ): Promise<AdminReturnDetail> {
    const initialReturn = await prisma.returnRequest.findUnique({
      where: { returnNumber },
      include: {
        items: {
          include: { orderItem: true },
        },
      },
    });

    if (!initialReturn) {
      throw new NotFoundError('RETURN_NOT_FOUND', 'Return request not found');
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Lock Order first
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${initialReturn.orderId} FOR UPDATE`;

      // 2. Lock ReturnRequest second
      const [locked] = await tx.$queryRaw<Array<{ id: string; status: ReturnRequestStatus }>>`
        SELECT id, status FROM "ReturnRequest" WHERE id = ${initialReturn.id} FOR UPDATE
      `;

      if (!locked) {
        throw new NotFoundError('RETURN_NOT_FOUND', 'Return request not found');
      }

      if (locked.status === 'RECEIVED') {
        throw new BadRequestError(
          'RETURN_ALREADY_INSPECTED',
          'Return request has already been inspected',
        );
      }

      if (locked.status !== 'APPROVED') {
        throw new BadRequestError(
          'INVALID_RETURN_STATUS',
          `Cannot inspect return in status "${locked.status}". Only APPROVED returns can be inspected.`,
        );
      }

      // 3. Clarification 1 Validation:
      // Verify every ReturnItem is covered and no duplicate or invalid returnItemId is passed
      const returnItemsMap = new Map(initialReturn.items.map((it) => [it.id, it]));

      if (input.items.length !== initialReturn.items.length) {
        throw new BadRequestError(
          'INCOMPLETE_INSPECTION',
          `Physical inspection must cover all ${initialReturn.items.length} return item(s).`,
        );
      }

      const seenItemIds = new Set<string>();
      for (const insp of input.items) {
        if (seenItemIds.has(insp.returnItemId)) {
          throw new BadRequestError(
            'DUPLICATE_INSPECTION_ITEM',
            `Duplicate inspection entry for return item ${insp.returnItemId}.`,
          );
        }
        seenItemIds.add(insp.returnItemId);

        const returnItem = returnItemsMap.get(insp.returnItemId);
        if (!returnItem) {
          throw new BadRequestError(
            'INVALID_RETURN_ITEM',
            `Return item ${insp.returnItemId} does not belong to return request ${returnNumber}.`,
          );
        }

        // If supplied, inspectedQuantity must equal ReturnItem.quantity
        if (
          insp.inspectedQuantity !== undefined &&
          insp.inspectedQuantity !== returnItem.quantity
        ) {
          throw new BadRequestError(
            'PARTIAL_INSPECTION_NOT_ALLOWED',
            `Inspected quantity for item "${returnItem.orderItem.productName}" must equal the full approved quantity of ${returnItem.quantity}.`,
          );
        }
      }

      // 4. Clarification 2: Restock GOOD items
      const goodRestockItems: Array<{
        variantId: string;
        quantity: number;
        productName: string;
      }> = [];

      for (const insp of input.items) {
        if (insp.condition === 'GOOD') {
          const returnItem = returnItemsMap.get(insp.returnItemId)!;
          const variantId = returnItem.orderItem.variantId;
          if (!variantId) {
            throw new BadRequestError(
              'CANNOT_RESTOCK_NO_VARIANT',
              `Cannot restock item "${returnItem.orderItem.productName}": product variant no longer exists`,
            );
          }
          const qty = insp.inspectedQuantity ?? returnItem.quantity;
          goodRestockItems.push({
            variantId,
            quantity: qty,
            productName: returnItem.orderItem.productName,
          });
        }
      }

      // Acquire exclusive row locks on InventoryItem in sorted variantId ASC order
      const sortedVariantIds = [...new Set(goodRestockItems.map((g) => g.variantId))].sort((a, b) =>
        a.localeCompare(b),
      );

      for (const variantId of sortedVariantIds) {
        await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE "variantId" = ${variantId} FOR UPDATE`;
      }

      // Apply restock and create RETURN_RESTOCK adjustments
      for (const item of goodRestockItems) {
        const inventory = await tx.inventoryItem.findUnique({
          where: { variantId: item.variantId },
        });

        if (!inventory) {
          throw new NotFoundError(
            'INVENTORY_ITEM_NOT_FOUND',
            `Inventory record not found for variant ${item.variantId}`,
          );
        }

        const newQuantity = inventory.quantity + item.quantity;

        // Invariants: quantity >= 0, quantity >= reservedQuantity, reservedQuantity unchanged
        if (newQuantity < 0 || newQuantity < inventory.reservedQuantity) {
          throw new BadRequestError(
            'INVENTORY_INVARIANT_VIOLATION',
            `Restocking would violate inventory invariant: quantity (${newQuantity}) must be >= reservedQuantity (${inventory.reservedQuantity})`,
          );
        }

        await tx.inventoryItem.update({
          where: { id: inventory.id },
          data: {
            quantity: newQuantity,
          },
        });

        await tx.inventoryAdjustment.create({
          data: {
            inventoryItemId: inventory.id,
            type: 'RETURN_RESTOCK',
            quantityDelta: item.quantity,
            oldQuantity: inventory.quantity,
            newQuantity,
            reason: `Return ${returnNumber} restock: ${item.productName} (${item.quantity} units, condition: GOOD)`,
            adjustedByUserId: adminId,
          },
        });
      }

      // 5. Update ReturnItem records
      for (const insp of input.items) {
        const returnItem = returnItemsMap.get(insp.returnItemId)!;
        const qty = returnItem.quantity;
        const isGood = insp.condition === 'GOOD';

        await tx.returnItem.update({
          where: { id: returnItem.id },
          data: {
            condition: insp.condition,
            restockedQuantity: isGood ? qty : 0,
            inspectionNotes: insp.notes?.trim() || null,
            inspectedAt: new Date(),
            inspectedByUserId: adminId,
          },
        });
      }

      // 6. Transition ReturnRequest status to RECEIVED
      await tx.returnRequest.update({
        where: { id: locked.id },
        data: {
          status: 'RECEIVED',
          statusHistory: {
            create: {
              fromStatus: 'APPROVED',
              toStatus: 'RECEIVED',
              reason:
                input.notes?.trim() || 'Physical inspection completed and inventory restocked',
              changedByUserId: adminId,
            },
          },
        },
      });

      // 7. Return refreshed admin return detail
      return await this.fetchAdminReturnDetailInTx(tx, returnNumber);
    });
  }

  /**
   * Internal helper to fetch and format AdminReturnDetail under a Prisma transaction client.
   */
  private async fetchAdminReturnDetailInTx(
    tx: Prisma.TransactionClient | typeof prisma,
    returnNumber: string,
  ): Promise<AdminReturnDetail> {
    const r = await tx.returnRequest.findUnique({
      where: { returnNumber },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            paymentMethod: true,
            totalPayable: true,
            merchandiseSubtotal: true,
            statusHistory: {
              where: { toStatus: 'DELIVERED' },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
        items: {
          include: {
            orderItem: true,
            inspectedByUser: {
              select: {
                id: true,
                email: true,
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          include: {
            changedByUser: {
              select: {
                id: true,
                email: true,
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
        refunds: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!r) {
      throw new NotFoundError('RETURN_NOT_FOUND', 'Return request not found');
    }

    return this.formatAdminReturnDetail(r as AdminReturnRecordWithRelations);
  }

  /**
   * Helper formatting admin operational ReturnDetail projection.
   */
  private formatAdminReturnDetail(r: AdminReturnRecordWithRelations): AdminReturnDetail {
    const customerName = r.user.profile
      ? `${r.user.profile.firstName} ${r.user.profile.lastName}`.trim()
      : r.user.email;

    const deliveredHistory = r.order.statusHistory?.[0];

    return {
      id: r.id,
      returnNumber: r.returnNumber,
      orderId: r.order.id,
      orderNumber: r.order.orderNumber,
      customer: {
        id: r.user.id,
        email: r.user.email,
        name: customerName || r.user.email,
        phone: r.user.profile?.phone || null,
      },
      status: r.status,
      customerReason: r.customerReason,
      customerNotes: r.customerNotes,
      rejectionReason: r.rejectionReason,
      estimatedRefundAmount: r.estimatedRefundAmount,
      actualRefundAmount: r.actualRefundAmount,
      shippingFeeRefunded: r.shippingFeeRefunded,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      orderSummary: {
        status: r.order.status,
        paymentStatus: r.order.paymentStatus,
        paymentMethod: r.order.paymentMethod,
        totalPayable: r.order.totalPayable,
        merchandiseSubtotal: r.order.merchandiseSubtotal,
        deliveredAt: deliveredHistory?.createdAt || null,
      },
      items: r.items.map((it) => {
        const inspectorName = it.inspectedByUser?.profile
          ? `${it.inspectedByUser.profile.firstName} ${it.inspectedByUser.profile.lastName}`.trim()
          : it.inspectedByUser?.email || null;

        return {
          id: it.id,
          orderItemId: it.orderItemId,
          variantId: it.orderItem.variantId,
          productName: it.orderItem.productName,
          variantTitle: it.orderItem.variantTitle,
          sku: it.orderItem.sku,
          thumbnailUrl: it.orderItem.thumbnailUrl,
          unitPrice: it.orderItem.unitPrice,
          quantity: it.quantity,
          reason: it.reason,
          condition: it.condition,
          restockedQuantity: it.restockedQuantity,
          inspectionNotes: it.inspectionNotes,
          inspectedAt: it.inspectedAt,
          inspectedByUser: it.inspectedByUser
            ? {
                id: it.inspectedByUser.id,
                email: it.inspectedByUser.email,
                name: inspectorName || it.inspectedByUser.email,
              }
            : null,
        };
      }),
      statusHistory: r.statusHistory.map((sh) => {
        const changerName = sh.changedByUser?.profile
          ? `${sh.changedByUser.profile.firstName} ${sh.changedByUser.profile.lastName}`.trim()
          : sh.changedByUser?.email || null;

        return {
          id: sh.id,
          fromStatus: sh.fromStatus,
          toStatus: sh.toStatus,
          reason: sh.reason,
          createdAt: sh.createdAt,
          changedByUser: sh.changedByUser
            ? {
                id: sh.changedByUser.id,
                email: sh.changedByUser.email,
                name: changerName || sh.changedByUser.email,
              }
            : null,
        };
      }),
      refunds: (r.refunds || []).map((rf) => ({
        id: rf.id,
        refundNumber: rf.refundNumber,
        paymentId: rf.paymentId,
        amount: rf.amount,
        merchandiseAmount: rf.merchandiseAmount,
        shippingAmount: rf.shippingAmount,
        method: rf.method,
        status: rf.status,
        gatewayReference: rf.gatewayReference,
        payoutReference: rf.payoutReference,
        payoutChannel: rf.payoutChannel,
        failureReason: rf.failureReason,
        processedAt: rf.processedAt,
        createdAt: rf.createdAt,
      })),
    };
  }

  /**
   * Generates a preview of refund calculations, remaining capacities, and target payment.
   */
  async getAdminRefundPreview(returnNumber: string): Promise<AdminRefundPreview> {
    const returnRequest = await prisma.returnRequest.findUnique({
      where: { returnNumber },
      include: {
        order: {
          include: {
            items: true,
            payments: {
              orderBy: { id: 'asc' },
            },
            returnRequests: {
              include: {
                refunds: true,
              },
            },
          },
        },
        items: {
          include: {
            orderItem: true,
          },
        },
        refunds: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!returnRequest) {
      throw new NotFoundError('RETURN_NOT_FOUND', 'Return request not found');
    }

    if (returnRequest.status !== 'RECEIVED' && returnRequest.status !== 'COMPLETED') {
      throw new BadRequestError(
        'INVALID_RETURN_STATUS',
        `Return request is in ${returnRequest.status} status. Only RECEIVED or COMPLETED returns can be previewed for refunds.`,
      );
    }

    const allOrderRefunds = returnRequest.order.returnRequests.flatMap((rr) => rr.refunds);
    const pendingRefund = returnRequest.refunds.find((rf) => rf.status === 'PENDING');

    const deliveredLineItems: ReturnableLineItem[] = returnRequest.order.items.map((it) => ({
      orderItemId: it.id,
      unitPrice: it.unitPrice,
      deliveredQuantity: it.quantity,
    }));

    const requestedItems = returnRequest.items.map((it) => ({
      orderItemId: it.orderItemId,
      quantity: it.quantity,
    }));

    const otherCommittedMerchandise = calculateCommittedMerchandiseRefunds(
      allOrderRefunds.filter((rf) => rf.returnRequestId !== returnRequest.id),
    );

    const calculated = calculateReturnItemRefunds({
      merchandiseSubtotal: returnRequest.order.merchandiseSubtotal,
      couponDiscountAmount: returnRequest.order.couponDiscountAmount,
      deliveredItems: deliveredLineItems,
      requestedItems,
      previouslyCommittedMerchandiseRefunds: otherCommittedMerchandise,
    });

    const calculatedMerchandiseRefund = calculated.totalMerchandiseRefundAmount;

    const availableMerchandiseCapacity = calculateMerchandiseRefundCapacity(
      {
        merchandiseSubtotal: returnRequest.order.merchandiseSubtotal,
        couponDiscountAmount: returnRequest.order.couponDiscountAmount,
      },
      allOrderRefunds,
    );

    const orderCapacityEval = calculateOrderRefundCapacity({
      merchandiseSubtotal: returnRequest.order.merchandiseSubtotal,
      couponDiscountAmount: returnRequest.order.couponDiscountAmount,
      shippingFee: returnRequest.order.shippingFee,
      payments: returnRequest.order.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
      })),
      refunds: allOrderRefunds.map((rf) => ({
        id: rf.id,
        paymentId: rf.paymentId,
        amount: rf.amount,
        merchandiseAmount: rf.merchandiseAmount,
        shippingAmount: rf.shippingAmount,
        status: rf.status,
      })),
    });

    const paidPayments = returnRequest.order.payments.filter((p) => p.status === 'PAID');
    const eligiblePayments = paidPayments.map((p) => {
      const cap = calculatePaymentRefundCapacity(
        { id: p.id, amount: p.amount, status: p.status },
        allOrderRefunds.map((rf) => ({
          paymentId: rf.paymentId,
          amount: rf.amount,
          status: rf.status,
        })),
      );
      return {
        id: p.id,
        method: p.method,
        transactionId: p.transactionId,
        gatewayTransactionId: p.gatewayTransactionId,
        amount: p.amount,
        availableCapacity: cap,
      };
    });

    let targetPayment = eligiblePayments.find((p) => p.availableCapacity > 0) || null;
    if (returnRequest.order.paymentMethod === 'SSLCOMMERZ') {
      const sslPayment = eligiblePayments.find(
        (p) => p.method === 'SSLCOMMERZ' && p.availableCapacity > 0,
      );
      if (sslPayment) targetPayment = sslPayment;
    } else if (returnRequest.order.paymentMethod === 'COD') {
      const codPayment = eligiblePayments.find(
        (p) => p.method === 'COD' && p.availableCapacity > 0,
      );
      if (codPayment) targetPayment = codPayment;
    }

    return {
      returnNumber: returnRequest.returnNumber,
      returnStatus: returnRequest.status,
      orderNumber: returnRequest.order.orderNumber,
      orderStatus: returnRequest.order.status,
      orderPaymentStatus: returnRequest.order.paymentStatus,
      calculatedMerchandiseRefund,
      defaultShippingRefund: 0,
      availableOrderCapacity: orderCapacityEval.availableOrderCapacity,
      availableMerchandiseCapacity,
      targetPayment,
      eligiblePayments,
      hasPendingRefund: !!pendingRefund,
      pendingRefund: pendingRefund
        ? {
            id: pendingRefund.id,
            refundNumber: pendingRefund.refundNumber,
            amount: pendingRefund.amount,
            method: pendingRefund.method,
            status: pendingRefund.status,
            createdAt: pendingRefund.createdAt,
          }
        : undefined,
    };
  }

  /**
   * Processes a refund for an inspected return request in RECEIVED status.
   * Lock sequence: Order -> ReturnRequest -> Payments (sorted by ID ASC) -> Refunds (sorted by ID ASC).
   * SSLCommerz calls happen outside database transactions.
   */
  async processAdminRefund(
    adminUserId: string,
    returnNumber: string,
    input: AdminProcessRefundInput,
  ): Promise<AdminReturnDetail> {
    const initial = await prisma.returnRequest.findUnique({
      where: { returnNumber },
      select: { id: true, orderId: true, status: true },
    });

    if (!initial) {
      throw new NotFoundError('RETURN_NOT_FOUND', 'Return request not found');
    }

    if (initial.status !== 'RECEIVED') {
      throw new BadRequestError(
        'INVALID_RETURN_STATUS',
        `Return request is in ${initial.status} status. Only inspected returns in RECEIVED status can be refunded.`,
      );
    }

    let targetPaymentMethod: PaymentMethod;
    let gatewayBankTranId: string | null = null;
    let pendingRefundNumber: string | null = null;
    let refundTotalAmount: number = 0;
    let refundMerchandiseAmount: number = 0;
    let refundShippingAmount: number = 0;

    // PHASE 1: DB Transaction - Validate, Check Capacities, and Persist PENDING / COD COMPLETED
    await prisma.$transaction(async (tx) => {
      // 1. Row locks in strict hierarchical order
      await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${initial.orderId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "ReturnRequest" WHERE id = ${initial.id} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "Payment" WHERE "orderId" = ${initial.orderId} ORDER BY id ASC FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "Refund" WHERE "returnRequestId" IN (SELECT id FROM "ReturnRequest" WHERE "orderId" = ${initial.orderId}) ORDER BY id ASC FOR UPDATE`;

      const returnRequest = await tx.returnRequest.findUnique({
        where: { id: initial.id },
        include: {
          order: {
            include: {
              items: true,
              payments: { orderBy: { id: 'asc' } },
              returnRequests: { include: { refunds: true } },
            },
          },
          items: true,
          refunds: true,
        },
      });

      if (!returnRequest || returnRequest.status !== 'RECEIVED') {
        throw new BadRequestError(
          'INVALID_RETURN_STATUS',
          'Return request must be in RECEIVED status to process a refund.',
        );
      }

      // Clarification 3: Prevent multiple active PENDING refunds for the same return
      const existingPending = returnRequest.refunds.find((rf) => rf.status === 'PENDING');
      if (existingPending) {
        throw new BadRequestError(
          'REFUND_ALREADY_PENDING',
          `A refund attempt (${existingPending.refundNumber}) is already pending. Reconcile gateway status or wait for completion.`,
        );
      }

      const allOrderRefunds = returnRequest.order.returnRequests.flatMap((rr) => rr.refunds);

      // Server-side calculation of merchandise refund
      const deliveredLineItems: ReturnableLineItem[] = returnRequest.order.items.map((it) => ({
        orderItemId: it.id,
        unitPrice: it.unitPrice,
        deliveredQuantity: it.quantity,
      }));

      const requestedItems = returnRequest.items.map((it) => ({
        orderItemId: it.orderItemId,
        quantity: it.quantity,
      }));

      const otherCommittedMerchandise = calculateCommittedMerchandiseRefunds(
        allOrderRefunds.filter((rf) => rf.returnRequestId !== returnRequest.id),
      );

      const calculated = calculateReturnItemRefunds({
        merchandiseSubtotal: returnRequest.order.merchandiseSubtotal,
        couponDiscountAmount: returnRequest.order.couponDiscountAmount,
        deliveredItems: deliveredLineItems,
        requestedItems,
        previouslyCommittedMerchandiseRefunds: otherCommittedMerchandise,
      });

      refundMerchandiseAmount = calculated.totalMerchandiseRefundAmount;

      // Shipping refund calculation
      refundShippingAmount = input.shippingAmount ?? 0;
      if (refundShippingAmount > 0) {
        if (!input.shippingRefundReason?.trim()) {
          throw new BadRequestError(
            'SHIPPING_REFUND_REASON_REQUIRED',
            'An explicit reason is required when refunding shipping fees.',
          );
        }
      }

      refundTotalAmount = refundMerchandiseAmount + refundShippingAmount;

      if (refundTotalAmount <= 0) {
        throw new BadRequestError(
          'INVALID_REFUND_AMOUNT',
          'Calculated refund amount must be greater than zero.',
        );
      }

      // Check merchandise capacity
      const availableMerchandiseCapacity = calculateMerchandiseRefundCapacity(
        {
          merchandiseSubtotal: returnRequest.order.merchandiseSubtotal,
          couponDiscountAmount: returnRequest.order.couponDiscountAmount,
        },
        allOrderRefunds,
      );

      if (refundMerchandiseAmount > availableMerchandiseCapacity) {
        throw new BadRequestError(
          'MERCHANDISE_CAPACITY_EXCEEDED',
          `Merchandise refund (৳${refundMerchandiseAmount / 100}) exceeds available merchandise capacity (৳${availableMerchandiseCapacity / 100}).`,
        );
      }

      // Check order capacity
      const orderCapacityEval = calculateOrderRefundCapacity({
        merchandiseSubtotal: returnRequest.order.merchandiseSubtotal,
        couponDiscountAmount: returnRequest.order.couponDiscountAmount,
        shippingFee: returnRequest.order.shippingFee,
        payments: returnRequest.order.payments.map((p) => ({
          id: p.id,
          amount: p.amount,
          status: p.status,
        })),
        refunds: allOrderRefunds.map((rf) => ({
          id: rf.id,
          paymentId: rf.paymentId,
          amount: rf.amount,
          merchandiseAmount: rf.merchandiseAmount,
          shippingAmount: rf.shippingAmount,
          status: rf.status,
        })),
      });

      if (refundTotalAmount > orderCapacityEval.availableOrderCapacity) {
        throw new BadRequestError(
          'ORDER_CAPACITY_EXCEEDED',
          `Total refund (৳${refundTotalAmount / 100}) exceeds available order capacity (৳${orderCapacityEval.availableOrderCapacity / 100}).`,
        );
      }

      // Target Payment selection (Clarification 2)
      let selectedPayment = input.paymentId
        ? returnRequest.order.payments.find((p) => p.id === input.paymentId)
        : null;

      if (!selectedPayment) {
        const eligiblePaid = returnRequest.order.payments.filter((p) => p.status === 'PAID');
        if (returnRequest.order.paymentMethod === 'SSLCOMMERZ') {
          selectedPayment = eligiblePaid.find((p) => p.method === 'SSLCOMMERZ') || null;
        } else if (returnRequest.order.paymentMethod === 'COD') {
          selectedPayment = eligiblePaid.find((p) => p.method === 'COD') || null;
        }
        if (!selectedPayment && eligiblePaid.length > 0) {
          selectedPayment = eligiblePaid[0];
        }
      }

      if (!selectedPayment || selectedPayment.status !== 'PAID') {
        throw new BadRequestError(
          'NO_ELIGIBLE_PAYMENT',
          'No eligible captured PAID payment found on this order to refund.',
        );
      }

      // Check target payment remaining capacity
      const paymentCap = calculatePaymentRefundCapacity(
        { id: selectedPayment.id, amount: selectedPayment.amount, status: selectedPayment.status },
        allOrderRefunds.map((rf) => ({
          paymentId: rf.paymentId,
          amount: rf.amount,
          status: rf.status,
        })),
      );

      if (refundTotalAmount > paymentCap) {
        throw new BadRequestError(
          'PAYMENT_CAPACITY_EXCEEDED',
          `Refund amount (৳${refundTotalAmount / 100}) exceeds target payment capacity (৳${paymentCap / 100}).`,
        );
      }

      targetPaymentMethod = selectedPayment.method;
      gatewayBankTranId = selectedPayment.gatewayTransactionId || null;

      const refundNumber = generateRefundNumber();
      pendingRefundNumber = refundNumber;

      if (selectedPayment.method === 'SSLCOMMERZ') {
        // Online payment: persist PENDING refund to reserve capacity
        await tx.refund.create({
          data: {
            refundNumber,
            returnRequestId: returnRequest.id,
            paymentId: selectedPayment.id,
            amount: refundTotalAmount,
            merchandiseAmount: refundMerchandiseAmount,
            shippingAmount: refundShippingAmount,
            method: 'SSLCOMMERZ',
            status: 'PENDING',
            processedByUserId: adminUserId,
          },
        });
      } else {
        // COD manual payout: execute atomically inside this transaction
        const payoutChannel = input.payoutChannel || 'CASH';
        if (payoutChannel !== 'CASH' && !input.payoutReference?.trim()) {
          throw new BadRequestError(
            'PAYOUT_REFERENCE_REQUIRED',
            'Payout reference is required for non-cash payout channels.',
          );
        }

        await tx.refund.create({
          data: {
            refundNumber,
            returnRequestId: returnRequest.id,
            paymentId: selectedPayment.id,
            amount: refundTotalAmount,
            merchandiseAmount: refundMerchandiseAmount,
            shippingAmount: refundShippingAmount,
            method: 'COD_PAYOUT',
            status: 'COMPLETED',
            payoutChannel,
            payoutReference: input.payoutReference?.trim() || null,
            processedByUserId: adminUserId,
            processedAt: new Date(),
          },
        });

        await tx.returnRequest.update({
          where: { id: returnRequest.id },
          data: {
            status: 'COMPLETED',
            actualRefundAmount: refundTotalAmount,
            shippingFeeRefunded: refundShippingAmount > 0,
            statusHistory: {
              create: {
                fromStatus: 'RECEIVED',
                toStatus: 'COMPLETED',
                reason: input.notes?.trim()
                  ? `COD payout recorded via ${payoutChannel} (${input.payoutReference || 'Cash'}) - ${input.notes.trim()}`
                  : `COD payout recorded via ${payoutChannel} (${input.payoutReference || 'Cash'})`,
                changedByUserId: adminUserId,
              },
            },
          },
        });

        // Check & update Payment and Order statuses (Clarification 1)
        await this.checkAndUpdatePaymentAndOrderStatus(
          tx,
          returnRequest.orderId,
          selectedPayment.id,
        );
      }
    });

    if (targetPaymentMethod! !== 'SSLCOMMERZ') {
      return this.fetchAdminReturnDetailInTx(prisma, returnNumber);
    }

    // PHASE 2: Gateway Call (Outside DB Transaction)
    const refundRefId = pendingRefundNumber!;
    const bankTranId = gatewayBankTranId || 'MOCK_BANK_TRAN_ID';

    const gatewayResult = await sslcommerzService.initiateRefund({
      bankTranId,
      refundAmount: refundTotalAmount,
      refundRemarks: input.notes?.trim() || `Return refund ${returnNumber}`,
      refundRefId,
    });

    // PHASE 3: DB Transaction - Finalize SSLCommerz Outcome
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${initial.orderId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "ReturnRequest" WHERE id = ${initial.id} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "Payment" WHERE "orderId" = ${initial.orderId} ORDER BY id ASC FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "Refund" WHERE "returnRequestId" IN (SELECT id FROM "ReturnRequest" WHERE "orderId" = ${initial.orderId}) ORDER BY id ASC FOR UPDATE`;

      const refundRecord = await tx.refund.findUnique({
        where: { refundNumber: refundRefId },
      });

      if (!refundRecord || refundRecord.status !== 'PENDING') {
        return;
      }

      if (gatewayResult.status === 'SUCCESS') {
        await tx.refund.update({
          where: { id: refundRecord.id },
          data: {
            status: 'COMPLETED',
            gatewayReference: gatewayResult.refundRefId || refundRefId,
            gatewayResponse: this.sanitizeGatewayPayload(gatewayResult.raw),
            processedAt: new Date(),
          },
        });

        await tx.returnRequest.update({
          where: { id: initial.id },
          data: {
            status: 'COMPLETED',
            actualRefundAmount: refundRecord.amount,
            shippingFeeRefunded: refundRecord.shippingAmount > 0,
            statusHistory: {
              create: {
                fromStatus: 'RECEIVED',
                toStatus: 'COMPLETED',
                reason: input.notes?.trim()
                  ? `SSLCommerz refund completed (${refundRefId}) - ${input.notes.trim()}`
                  : `SSLCommerz refund completed (${refundRefId})`,
                changedByUserId: adminUserId,
              },
            },
          },
        });

        await this.checkAndUpdatePaymentAndOrderStatus(tx, initial.orderId, refundRecord.paymentId);
      } else if (gatewayResult.status === 'FAILED') {
        await tx.refund.update({
          where: { id: refundRecord.id },
          data: {
            status: 'FAILED',
            failureReason: gatewayResult.errorReason || 'Gateway rejected refund',
            gatewayResponse: this.sanitizeGatewayPayload(gatewayResult.raw),
            processedAt: new Date(),
          },
        });
      } else {
        // AMBIGUOUS: keep PENDING so capacity remains reserved
        await tx.refund.update({
          where: { id: refundRecord.id },
          data: {
            gatewayResponse: this.sanitizeGatewayPayload({
              error: gatewayResult.errorReason,
              ...gatewayResult.raw,
            }),
          },
        });
      }
    });

    return this.fetchAdminReturnDetailInTx(prisma, returnNumber);
  }

  /**
   * Reconciles an in-flight PENDING refund attempt with the SSLCommerz gateway.
   * Lock sequence: Order -> ReturnRequest -> Payments (sorted by ID ASC) -> Refunds (sorted by ID ASC).
   * Gateway query happens outside database transaction.
   */
  async reconcileAdminRefund(
    adminUserId: string,
    returnNumber: string,
  ): Promise<AdminReturnDetail> {
    const initial = await prisma.returnRequest.findUnique({
      where: { returnNumber },
      select: { id: true, orderId: true, status: true },
    });

    if (!initial) {
      throw new NotFoundError('RETURN_NOT_FOUND', 'Return request not found');
    }

    const pendingRefund = await prisma.refund.findFirst({
      where: {
        returnRequestId: initial.id,
        status: 'PENDING',
      },
      include: { payment: true },
    });

    if (!pendingRefund) {
      throw new BadRequestError(
        'NO_PENDING_REFUND',
        'No pending refund attempt found for this return to reconcile.',
      );
    }

    if (pendingRefund.method !== 'SSLCOMMERZ') {
      throw new BadRequestError(
        'CANNOT_RECONCILE',
        'Only online SSLCommerz refunds can be queried and reconciled with the gateway.',
      );
    }

    // Step 2: Gateway Query outside transaction (Clarification 3: reuse existing refundNumber)
    const queryResult = await sslcommerzService.queryRefundStatus(
      pendingRefund.gatewayReference || pendingRefund.refundNumber,
    );

    // Step 3: DB Transaction
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${initial.orderId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "ReturnRequest" WHERE id = ${initial.id} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "Payment" WHERE "orderId" = ${initial.orderId} ORDER BY id ASC FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "Refund" WHERE "returnRequestId" IN (SELECT id FROM "ReturnRequest" WHERE "orderId" = ${initial.orderId}) ORDER BY id ASC FOR UPDATE`;

      const lockedRefund = await tx.refund.findUnique({
        where: { id: pendingRefund.id },
      });

      if (!lockedRefund || lockedRefund.status !== 'PENDING') {
        return;
      }

      if (queryResult.status === 'SUCCESS') {
        await tx.refund.update({
          where: { id: lockedRefund.id },
          data: {
            status: 'COMPLETED',
            gatewayReference: queryResult.refundRefId || lockedRefund.refundNumber,
            gatewayResponse: this.sanitizeGatewayPayload(queryResult.raw),
            processedAt: new Date(),
          },
        });

        await tx.returnRequest.update({
          where: { id: initial.id },
          data: {
            status: 'COMPLETED',
            actualRefundAmount: lockedRefund.amount,
            shippingFeeRefunded: lockedRefund.shippingAmount > 0,
            statusHistory: {
              create: {
                fromStatus: 'RECEIVED',
                toStatus: 'COMPLETED',
                reason: `SSLCommerz refund reconciled and confirmed (${lockedRefund.refundNumber})`,
                changedByUserId: adminUserId,
              },
            },
          },
        });

        await this.checkAndUpdatePaymentAndOrderStatus(tx, initial.orderId, lockedRefund.paymentId);
      } else if (queryResult.status === 'FAILED') {
        await tx.refund.update({
          where: { id: lockedRefund.id },
          data: {
            status: 'FAILED',
            failureReason: queryResult.errorReason || 'Gateway confirmed refund failed',
            gatewayResponse: this.sanitizeGatewayPayload(queryResult.raw),
            processedAt: new Date(),
          },
        });
      } else {
        await tx.refund.update({
          where: { id: lockedRefund.id },
          data: {
            gatewayResponse: this.sanitizeGatewayPayload({
              reconcileError: queryResult.errorReason,
              ...queryResult.raw,
            }),
          },
        });
      }
    });

    return this.fetchAdminReturnDetailInTx(prisma, returnNumber);
  }

  /**
   * Helper enforcing full-refund accounting transitions (Clarification 1).
   * - Set Payment.status = REFUNDED only when that Payment is fully refunded.
   * - Set Order.paymentStatus = REFUNDED only when all captured payments for the Order are fully refunded.
   * - Retained, non-refundable shipping does not prevent a fully refunded status if all captured amounts are refunded.
   */
  private async checkAndUpdatePaymentAndOrderStatus(
    tx: Prisma.TransactionClient,
    orderId: string,
    paymentId: string,
  ): Promise<void> {
    const paymentCompletedRefunds = await tx.refund.aggregate({
      where: { paymentId, status: 'COMPLETED' },
      _sum: { amount: true },
    });
    const totalPaymentRefunded = paymentCompletedRefunds._sum.amount ?? 0;

    const targetPayment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { amount: true, status: true },
    });

    if (targetPayment && targetPayment.status === 'PAID') {
      if (totalPaymentRefunded >= targetPayment.amount) {
        await tx.payment.update({
          where: { id: paymentId },
          data: { status: 'REFUNDED' },
        });
      }
    }

    const allOrderPayments = await tx.payment.findMany({
      where: { orderId },
      select: { id: true, amount: true, status: true },
    });

    const capturedPayments = allOrderPayments.filter(
      (p) => p.status === 'PAID' || p.status === 'REFUNDED',
    );
    const totalCaptured = capturedPayments.reduce((acc, p) => acc + p.amount, 0);

    const orderCompletedRefunds = await tx.refund.aggregate({
      where: {
        paymentId: { in: capturedPayments.map((p) => p.id) },
        status: 'COMPLETED',
      },
      _sum: { amount: true },
    });
    const totalOrderRefunded = orderCompletedRefunds._sum.amount ?? 0;

    if (totalCaptured > 0 && totalOrderRefunded >= totalCaptured) {
      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'REFUNDED' },
      });
    }
  }

  /**
   * Helper sanitizing gateway payloads by removing credentials, keys, and tokens.
   */
  private sanitizeGatewayPayload(payload: unknown): Prisma.InputJsonValue {
    if (!payload || typeof payload !== 'object') return {};
    const sensitiveKeys = new Set([
      'store_id',
      'store_passwd',
      'store_password',
      'password',
      'secret',
      'key',
      'apikey',
      'api_key',
      'token',
      'cookie',
      'auth',
      'authorization',
    ]);
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(payload as Record<string, unknown>)) {
      if (!sensitiveKeys.has(key.toLowerCase())) {
        sanitized[key] = val;
      }
    }
    return sanitized as Prisma.InputJsonValue;
  }
}

export const returnService = new ReturnService();
