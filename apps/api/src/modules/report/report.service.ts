import { prisma } from '../../lib/prisma.js';
import { resolveDhakaDateRange, formatDhakaDateStr } from './report.dates.js';
import type {
  ReportQueryInput,
  SalesReportResponse,
  FulfillmentReportResponse,
  InventoryReportResponse,
  ReturnsReportResponse,
  OverviewReportResponse,
  DailySalesTrendItem,
  OperationalActivityItem,
} from './report.schemas.js';

export class ReportService {
  /**
   * 1. Sales and Payment Reporting
   */
  async getSalesReport(query: ReportQueryInput): Promise<SalesReportResponse> {
    const range = resolveDhakaDateRange(query.preset, query.dateFrom, query.dateTo);
    const { startDate, endDate } = range;

    // A. Delivered Sales Attribution:
    // Orders whose status transition to DELIVERED occurred in [startDate, endDate)
    const deliveredStatusTransitions = await prisma.orderStatusHistory.findMany({
      where: {
        toStatus: 'DELIVERED',
        createdAt: { gte: startDate, lt: endDate },
      },
      select: {
        orderId: true,
        createdAt: true,
      },
      distinct: ['orderId'],
    });

    const deliveredOrderIds = deliveredStatusTransitions.map((t) => t.orderId);

    const deliveredOrders =
      deliveredOrderIds.length > 0
        ? await prisma.order.findMany({
            where: { id: { in: deliveredOrderIds } },
            select: {
              id: true,
              merchandiseSubtotal: true,
              shippingFee: true,
              discountAmount: true,
              totalPayable: true,
            },
          })
        : [];

    const grossDeliveredMerchandisePoisha = deliveredOrders.reduce(
      (sum, o) => sum + o.merchandiseSubtotal,
      0,
    );
    const deliveredShippingFeePoisha = deliveredOrders.reduce((sum, o) => sum + o.shippingFee, 0);
    const deliveredDiscountsPoisha = deliveredOrders.reduce((sum, o) => sum + o.discountAmount, 0);
    const grossDeliveredTotalPoisha = deliveredOrders.reduce((sum, o) => sum + o.totalPayable, 0);

    // B. Completed Refunds in Period (attributed by processedAt)
    const completedRefunds = await prisma.refund.findMany({
      where: {
        status: 'COMPLETED',
        OR: [
          { processedAt: { gte: startDate, lt: endDate } },
          { processedAt: null, createdAt: { gte: startDate, lt: endDate } },
        ],
      },
      select: {
        amount: true,
        merchandiseAmount: true,
        shippingAmount: true,
        method: true,
      },
    });

    const completedMerchandiseRefundsPoisha = completedRefunds.reduce(
      (sum, r) => sum + r.merchandiseAmount,
      0,
    );
    const completedShippingRefundsPoisha = completedRefunds.reduce(
      (sum, r) => sum + r.shippingAmount,
      0,
    );
    const totalCompletedRefundsPoisha = completedRefunds.reduce((sum, r) => sum + r.amount, 0);

    const netDeliveredMerchandisePoisha =
      grossDeliveredMerchandisePoisha - completedMerchandiseRefundsPoisha;
    const netDeliveredTotalPoisha = grossDeliveredTotalPoisha - totalCompletedRefundsPoisha;

    const deliveredOrdersCount = deliveredOrders.length;
    const averageOrderValuePoisha =
      deliveredOrdersCount > 0 ? Math.round(netDeliveredTotalPoisha / deliveredOrdersCount) : 0;

    // C. Orders Placed in Period (attributed by Order.createdAt)
    const placedOrders = await prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lt: endDate },
      },
      select: {
        id: true,
        status: true,
        totalPayable: true,
        createdAt: true,
      },
    });

    const totalOrdersPlacedCount = placedOrders.length;
    const totalOrdersPlacedValuePoisha = placedOrders.reduce((sum, o) => sum + o.totalPayable, 0);

    const ordersByStatus: Record<string, { count: number; totalPoisha: number }> = {};
    for (const order of placedOrders) {
      if (!ordersByStatus[order.status]) {
        ordersByStatus[order.status] = { count: 0, totalPoisha: 0 };
      }
      ordersByStatus[order.status]!.count += 1;
      ordersByStatus[order.status]!.totalPoisha += order.totalPayable;
    }

    const cancelledOrdersCount = ordersByStatus['CANCELLED']?.count || 0;
    const cancelledOrdersValuePoisha = ordersByStatus['CANCELLED']?.totalPoisha || 0;

    // D. Captured Payments in Period (attributed by Payment.paidAt)
    const capturedPayments = await prisma.payment.findMany({
      where: {
        status: { in: ['PAID', 'REFUNDED'] },
        paidAt: { gte: startDate, lt: endDate },
      },
      select: {
        id: true,
        method: true,
        amount: true,
        paidAt: true,
      },
    });

    const grossCapturedPaymentsPoisha = capturedPayments.reduce((sum, p) => sum + p.amount, 0);
    const capturedPaymentsCount = capturedPayments.length;
    const netRetainedPaymentsPoisha = grossCapturedPaymentsPoisha - totalCompletedRefundsPoisha;

    // Payment attempts created in period
    const paymentAttempts = await prisma.payment.findMany({
      where: {
        createdAt: { gte: startDate, lt: endDate },
      },
      select: {
        method: true,
        status: true,
        amount: true,
      },
    });

    const codAttempts = paymentAttempts.filter((p) => p.method === 'COD');
    const sslAttempts = paymentAttempts.filter((p) => p.method === 'SSLCOMMERZ');

    const codCaptured = capturedPayments.filter((p) => p.method === 'COD');
    const sslCaptured = capturedPayments.filter((p) => p.method === 'SSLCOMMERZ');

    const byMethod = {
      COD: {
        attempts: codAttempts.length,
        capturedCount: codCaptured.length,
        capturedPoisha: codCaptured.reduce((sum, p) => sum + p.amount, 0),
      },
      SSLCOMMERZ: {
        attempts: sslAttempts.length,
        capturedCount: sslCaptured.length,
        capturedPoisha: sslCaptured.reduce((sum, p) => sum + p.amount, 0),
      },
    };

    // E. Daily Sales Trend (bucketed by Asia/Dhaka day)
    const dailyMap = new Map<string, DailySalesTrendItem>();

    // Initialize all days in range
    let curTime = startDate.getTime();
    while (curTime < endDate.getTime()) {
      const curDate = new Date(curTime);
      const dateKey = formatDhakaDateStr(curDate);
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          date: dateKey,
          deliveredOrdersCount: 0,
          deliveredTotalPoisha: 0,
          placedOrdersCount: 0,
          capturedPaymentsPoisha: 0,
        });
      }
      curTime += 24 * 60 * 60 * 1000;
    }

    // Populate placed orders
    for (const po of placedOrders) {
      const key = formatDhakaDateStr(po.createdAt);
      const item = dailyMap.get(key);
      if (item) {
        item.placedOrdersCount += 1;
      }
    }

    // Populate delivered orders by transition time
    const deliveredOrderMap = new Map(deliveredOrders.map((o) => [o.id, o]));
    for (const tr of deliveredStatusTransitions) {
      const key = formatDhakaDateStr(tr.createdAt);
      const item = dailyMap.get(key);
      const ord = deliveredOrderMap.get(tr.orderId);
      if (item && ord) {
        item.deliveredOrdersCount += 1;
        item.deliveredTotalPoisha += ord.totalPayable;
      }
    }

    // Populate captured payments by paidAt
    for (const cp of capturedPayments) {
      if (cp.paidAt) {
        const key = formatDhakaDateStr(cp.paidAt);
        const item = dailyMap.get(key);
        if (item) {
          item.capturedPaymentsPoisha += cp.amount;
        }
      }
    }

    const dailyTrend = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return {
      period: {
        preset: range.preset,
        dateFrom: range.dateFromStr,
        dateTo: range.dateToStr,
      },
      deliveredSales: {
        deliveredOrdersCount,
        grossDeliveredMerchandisePoisha,
        deliveredShippingFeePoisha,
        deliveredDiscountsPoisha,
        grossDeliveredTotalPoisha,
        completedMerchandiseRefundsPoisha,
        completedShippingRefundsPoisha,
        totalCompletedRefundsPoisha,
        netDeliveredMerchandisePoisha,
        netDeliveredTotalPoisha,
        averageOrderValuePoisha,
      },
      orderPipeline: {
        totalOrdersPlacedCount,
        totalOrdersPlacedValuePoisha,
        cancelledOrdersCount,
        cancelledOrdersValuePoisha,
        byStatus: ordersByStatus,
      },
      cashAndPayments: {
        totalPaymentAttemptsCount: paymentAttempts.length,
        grossCapturedPaymentsPoisha,
        capturedPaymentsCount,
        completedRefundsCount: completedRefunds.length,
        totalCompletedRefundsPoisha,
        netRetainedPaymentsPoisha,
        byMethod,
      },
      dailyTrend,
    };
  }

  /**
   * 2. Fulfillment Reporting
   */
  async getFulfillmentReport(query: ReportQueryInput): Promise<FulfillmentReportResponse> {
    const range = resolveDhakaDateRange(query.preset, query.dateFrom, query.dateTo);
    const { startDate, endDate } = range;

    // A. Current pipeline distribution (active status breakdown in store)
    const allOrdersGroupByStatus = await prisma.order.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    const currentPipelineDistribution: Record<string, number> = {
      PENDING: 0,
      CONFIRMED: 0,
      PROCESSING: 0,
      SHIPPED: 0,
      DELIVERED: 0,
      CANCELLED: 0,
    };

    for (const g of allOrdersGroupByStatus) {
      currentPipelineDistribution[g.status] = g._count.id;
    }

    // B. Orders placed in period for cancellation analysis
    const placedOrders = await prisma.order.findMany({
      where: { createdAt: { gte: startDate, lt: endDate } },
      select: { id: true, status: true },
    });

    const totalOrdersInPeriod = placedOrders.length;
    const cancelledOrdersCount = placedOrders.filter((o) => o.status === 'CANCELLED').length;
    const cancellationRatePercent =
      totalOrdersInPeriod > 0
        ? Math.round((cancelledOrdersCount / totalOrdersInPeriod) * 1000) / 10
        : 0;

    // C. Cycle times derived from actual OrderStatusHistory transitions
    // Find all transition records for orders fulfilled in period
    const relevantTransitions = await prisma.orderStatusHistory.findMany({
      where: {
        order: {
          createdAt: { gte: new Date(startDate.getTime() - 60 * 24 * 60 * 60 * 1000) }, // Look back up to 60 days
        },
        toStatus: { in: ['CONFIRMED', 'SHIPPED', 'DELIVERED'] },
      },
      select: {
        orderId: true,
        toStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Map order transitions
    const orderTransitionMap = new Map<
      string,
      { confirmedAt?: Date; shippedAt?: Date; deliveredAt?: Date }
    >();

    for (const tr of relevantTransitions) {
      let rec = orderTransitionMap.get(tr.orderId);
      if (!rec) {
        rec = {};
        orderTransitionMap.set(tr.orderId, rec);
      }
      if (tr.toStatus === 'CONFIRMED' && !rec.confirmedAt) rec.confirmedAt = tr.createdAt;
      if (tr.toStatus === 'SHIPPED' && !rec.shippedAt) rec.shippedAt = tr.createdAt;
      if (tr.toStatus === 'DELIVERED' && !rec.deliveredAt) rec.deliveredAt = tr.createdAt;
    }

    let processingSumMs = 0;
    let processingCount = 0;

    let deliverySumMs = 0;
    let deliveryCount = 0;

    let totalSumMs = 0;
    let totalCount = 0;

    for (const [, times] of orderTransitionMap) {
      // Confirmed to Shipped
      if (times.confirmedAt && times.shippedAt && times.shippedAt > times.confirmedAt) {
        processingSumMs += times.shippedAt.getTime() - times.confirmedAt.getTime();
        processingCount += 1;
      }
      // Shipped to Delivered
      if (times.shippedAt && times.deliveredAt && times.deliveredAt > times.shippedAt) {
        deliverySumMs += times.deliveredAt.getTime() - times.shippedAt.getTime();
        deliveryCount += 1;
      }
      // Confirmed to Delivered
      if (times.confirmedAt && times.deliveredAt && times.deliveredAt > times.confirmedAt) {
        totalSumMs += times.deliveredAt.getTime() - times.confirmedAt.getTime();
        totalCount += 1;
      }
    }

    const msToHours = (ms: number) => Math.round((ms / (1000 * 60 * 60)) * 10) / 10;

    const cycleTimes = {
      avgProcessingHours: processingCount > 0 ? msToHours(processingSumMs / processingCount) : null,
      avgDeliveryHours: deliveryCount > 0 ? msToHours(deliverySumMs / deliveryCount) : null,
      avgTotalFulfillmentHours: totalCount > 0 ? msToHours(totalSumMs / totalCount) : null,
      measuredOrdersCount: totalCount,
    };

    // D. Recent fulfillment status history events
    const recentFulfillmentEventsRaw = await prisma.orderStatusHistory.findMany({
      where: {
        toStatus: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'] },
      },
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        createdAt: true,
        order: { select: { orderNumber: true } },
        changedByUser: {
          select: {
            email: true,
            profile: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    const recentFulfillmentEvents = recentFulfillmentEventsRaw.map((ev) => {
      const actorName =
        ev.changedByUser?.profile?.firstName && ev.changedByUser?.profile?.lastName
          ? `${ev.changedByUser.profile.firstName} ${ev.changedByUser.profile.lastName}`
          : ev.changedByUser?.email || null;
      return {
        id: ev.id,
        orderNumber: ev.order.orderNumber,
        fromStatus: ev.fromStatus,
        toStatus: ev.toStatus,
        changedAt: ev.createdAt.toISOString(),
        actorName,
      };
    });

    return {
      period: {
        preset: range.preset,
        dateFrom: range.dateFromStr,
        dateTo: range.dateToStr,
      },
      currentPipelineDistribution,
      cycleTimes,
      cancellationRatePercent,
      cancelledOrdersCount,
      totalOrdersInPeriod,
      recentFulfillmentEvents,
    };
  }

  /**
   * 3. Inventory Reporting & Valuation
   */
  async getInventoryReport(query: ReportQueryInput): Promise<InventoryReportResponse> {
    const range = resolveDhakaDateRange(query.preset, query.dateFrom, query.dateTo);
    const { startDate, endDate } = range;

    // Fetch all active variants and current inventory
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: {
        variant: {
          isActive: true,
        },
      },
      select: {
        id: true,
        quantity: true,
        reservedQuantity: true,
        lowStockThreshold: true,
        variantId: true,
        variant: {
          select: {
            id: true,
            sku: true,
            name: true,
            price: true,
            costPrice: true,
            product: {
              select: {
                id: true,
                name: true,
                category: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    });

    const totalTrackedVariants = inventoryItems.length;
    let totalPhysicalStock = 0;
    let totalReservedStock = 0;
    let totalAvailableStock = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;

    let retailValuationPoisha = 0;
    let costValuationPoisha = 0;
    let costTrackedVariantsCount = 0;

    const lowStockList: InventoryReportResponse['lowStockItems'] = [];

    for (const item of inventoryItems) {
      const qty = item.quantity;
      const reserved = item.reservedQuantity;
      const avail = Math.max(0, qty - reserved);
      const threshold = item.lowStockThreshold ?? 5;

      totalPhysicalStock += qty;
      totalReservedStock += reserved;
      totalAvailableStock += avail;

      if (qty <= 0) {
        outOfStockCount += 1;
      } else if (qty <= threshold) {
        lowStockCount += 1;
      }

      // Retail Valuation: quantity * variant.price (poisha)
      retailValuationPoisha += qty * item.variant.price;

      // Cost Valuation: only if costPrice is reliably populated
      if (item.variant.costPrice !== null && item.variant.costPrice !== undefined) {
        costValuationPoisha += qty * item.variant.costPrice;
        costTrackedVariantsCount += 1;
      }

      if (qty <= threshold) {
        lowStockList.push({
          variantId: item.variant.id,
          sku: item.variant.sku,
          productName: item.variant.product.name,
          variantTitle: item.variant.name,
          categoryName: item.variant.product.category?.name || 'Uncategorized',
          quantity: qty,
          lowStockThreshold: threshold,
          retailPrice: item.variant.price,
        });
      }
    }

    lowStockList.sort((a, b) => a.quantity - b.quantity);

    const costCoveragePercent =
      totalTrackedVariants > 0
        ? Math.round((costTrackedVariantsCount / totalTrackedVariants) * 1000) / 10
        : 0;

    // Movement summary in period
    const adjustmentsInPeriod = await prisma.inventoryAdjustment.findMany({
      where: {
        createdAt: { gte: startDate, lt: endDate },
      },
      select: {
        type: true,
        quantityDelta: true,
      },
    });

    const movementMap = new Map<string, { deltaQuantity: number; eventsCount: number }>();
    for (const adj of adjustmentsInPeriod) {
      let rec = movementMap.get(adj.type);
      if (!rec) {
        rec = { deltaQuantity: 0, eventsCount: 0 };
        movementMap.set(adj.type, rec);
      }
      rec.deltaQuantity += adj.quantityDelta;
      rec.eventsCount += 1;
    }

    const movementsInPeriod = Array.from(movementMap.entries()).map(([type, val]) => ({
      type,
      deltaQuantity: val.deltaQuantity,
      eventsCount: val.eventsCount,
    }));

    return {
      period: {
        preset: range.preset,
        dateFrom: range.dateFromStr,
        dateTo: range.dateToStr,
      },
      stockHealth: {
        totalTrackedVariants,
        totalPhysicalStock,
        totalReservedStock,
        totalAvailableStock,
        outOfStockCount,
        lowStockCount,
      },
      valuation: {
        retailValuationPoisha,
        costValuationPoisha,
        costTrackedVariantsCount,
        totalVariantsCount: totalTrackedVariants,
        costCoveragePercent,
      },
      lowStockItems: lowStockList.slice(0, 20),
      movementsInPeriod,
    };
  }

  /**
   * 4. Returns and Refunds Reporting
   */
  async getReturnsReport(query: ReportQueryInput): Promise<ReturnsReportResponse> {
    const range = resolveDhakaDateRange(query.preset, query.dateFrom, query.dateTo);
    const { startDate, endDate } = range;

    // Return requests created in period
    const returnRequests = await prisma.returnRequest.findMany({
      where: {
        createdAt: { gte: startDate, lt: endDate },
      },
      select: {
        id: true,
        status: true,
        items: {
          select: {
            quantity: true,
            restockedQuantity: true,
            condition: true,
          },
        },
      },
    });

    const totalReturnRequests = returnRequests.length;
    const byStatus: Record<string, number> = {
      REQUESTED: 0,
      APPROVED: 0,
      REJECTED: 0,
      RECEIVED: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };

    let totalItemsReturned = 0;
    let restockedItemsCount = 0;
    let damagedOrUnusableCount = 0;

    for (const req of returnRequests) {
      byStatus[req.status] = (byStatus[req.status] || 0) + 1;
      for (const it of req.items) {
        totalItemsReturned += it.quantity;
        restockedItemsCount += it.restockedQuantity;
        if (it.condition === 'DAMAGED' || it.condition === 'OPENED_UNUSABLE') {
          damagedOrUnusableCount += it.quantity - it.restockedQuantity;
        }
      }
    }

    // Delivered orders in period to compute return rate
    const deliveredCount = await prisma.orderStatusHistory.count({
      where: {
        toStatus: 'DELIVERED',
        createdAt: { gte: startDate, lt: endDate },
      },
    });

    const returnRatePercent =
      deliveredCount > 0
        ? Math.round(((byStatus['COMPLETED'] || 0) / deliveredCount) * 1000) / 10
        : 0;

    // Refunds in period
    const completedRefunds = await prisma.refund.findMany({
      where: {
        status: 'COMPLETED',
        OR: [
          { processedAt: { gte: startDate, lt: endDate } },
          { processedAt: null, createdAt: { gte: startDate, lt: endDate } },
        ],
      },
      select: {
        amount: true,
        merchandiseAmount: true,
        shippingAmount: true,
        method: true,
      },
    });

    let completedMerchandiseRefundsPoisha = 0;
    let completedShippingRefundsPoisha = 0;
    let totalCompletedRefundsPoisha = 0;

    const byMethod = {
      SSLCOMMERZ: { count: 0, totalPoisha: 0 },
      COD_PAYOUT: { count: 0, totalPoisha: 0 },
    };

    for (const r of completedRefunds) {
      completedMerchandiseRefundsPoisha += r.merchandiseAmount;
      completedShippingRefundsPoisha += r.shippingAmount;
      totalCompletedRefundsPoisha += r.amount;

      if (r.method === 'SSLCOMMERZ') {
        byMethod.SSLCOMMERZ.count += 1;
        byMethod.SSLCOMMERZ.totalPoisha += r.amount;
      } else if (r.method === 'COD_PAYOUT') {
        byMethod.COD_PAYOUT.count += 1;
        byMethod.COD_PAYOUT.totalPoisha += r.amount;
      }
    }

    return {
      period: {
        preset: range.preset,
        dateFrom: range.dateFromStr,
        dateTo: range.dateToStr,
      },
      returnVolume: {
        totalReturnRequests,
        byStatus,
        returnRatePercent,
      },
      itemDisposition: {
        totalItemsReturned,
        restockedItemsCount,
        damagedOrUnusableCount,
      },
      refundSummary: {
        completedRefundsCount: completedRefunds.length,
        completedMerchandiseRefundsPoisha,
        completedShippingRefundsPoisha,
        totalCompletedRefundsPoisha,
        byMethod,
      },
    };
  }

  /**
   * 5. Overview Dashboard Live Summary (Phase 8E)
   */
  async getDashboardOverview(): Promise<OverviewReportResponse> {
    const now = new Date();
    const todayRange = resolveDhakaDateRange('today');
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. Today's Delivered Orders & Refunds (Phase 8D rules)
    const todayDeliveredTransitions = await prisma.orderStatusHistory.findMany({
      where: {
        toStatus: 'DELIVERED',
        createdAt: { gte: todayRange.startDate, lt: todayRange.endDate },
      },
      select: { orderId: true },
      distinct: ['orderId'],
    });

    let todayDeliveredMerchandisePoisha = 0;
    let todayDeliveredShippingPoisha = 0;
    let todayGrossDeliveredSalesPoisha = 0;
    let todayDeliveredOrdersCount = 0;

    if (todayDeliveredTransitions.length > 0) {
      const deliveredOrders = await prisma.order.findMany({
        where: { id: { in: todayDeliveredTransitions.map((t) => t.orderId) } },
        select: {
          merchandiseSubtotal: true,
          discountAmount: true,
          shippingFee: true,
          totalPayable: true,
        },
      });
      todayDeliveredMerchandisePoisha = deliveredOrders.reduce(
        (sum, o) => sum + (o.merchandiseSubtotal - o.discountAmount),
        0,
      );
      todayDeliveredShippingPoisha = deliveredOrders.reduce((sum, o) => sum + o.shippingFee, 0);
      todayGrossDeliveredSalesPoisha = deliveredOrders.reduce((sum, o) => sum + o.totalPayable, 0);
      todayDeliveredOrdersCount = deliveredOrders.length;
    }

    const todayCompletedRefunds = await prisma.refund.findMany({
      where: {
        status: 'COMPLETED',
        OR: [
          { processedAt: { gte: todayRange.startDate, lt: todayRange.endDate } },
          { processedAt: null, createdAt: { gte: todayRange.startDate, lt: todayRange.endDate } },
        ],
      },
      select: { amount: true },
    });
    const todayCompletedRefundsPoisha = todayCompletedRefunds.reduce((sum, r) => sum + r.amount, 0);
    const todayNetDeliveredSalesPoisha =
      todayGrossDeliveredSalesPoisha - todayCompletedRefundsPoisha;

    // 2. Captured Cash & Retained Cash
    const todayCapturedPayments = await prisma.payment.findMany({
      where: {
        status: { in: ['PAID', 'REFUNDED'] },
        paidAt: { gte: todayRange.startDate, lt: todayRange.endDate },
      },
      select: { amount: true },
    });
    const todayCapturedCashPoisha = todayCapturedPayments.reduce((sum, p) => sum + p.amount, 0);
    const todayNetRetainedCashPoisha = todayCapturedCashPoisha - todayCompletedRefundsPoisha;

    // 3. COD Awaiting Collection (Clarification 1)
    const pendingCodOrders = await prisma.order.findMany({
      where: {
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        status: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED'] },
      },
      select: { totalPayable: true },
    });
    const pendingCodOrdersCount = pendingCodOrders.length;
    const pendingCodCollectionsPoisha = pendingCodOrders.reduce(
      (sum, o) => sum + o.totalPayable,
      0,
    );

    // 4. Online Orders Awaiting Payment (Clarification 2)
    const pendingOnlineCount = await prisma.order.count({
      where: {
        paymentMethod: 'SSLCOMMERZ',
        status: 'PENDING',
        paymentStatus: 'PENDING',
        paymentExpiresAt: { gt: now },
      },
    });

    // 5. Pipeline Stages & Counters
    const [
      awaitingProcessingCount,
      awaitingShipmentCount,
      inTransitCount,
      cancelledTodayCount,
      failedPaymentsLast24hCount,
      todayOrdersPlacedCount,
      totalCustomersCount,
    ] = await Promise.all([
      prisma.order.count({ where: { status: 'CONFIRMED' } }),
      prisma.order.count({ where: { status: 'PROCESSING' } }),
      prisma.order.count({ where: { status: 'SHIPPED' } }),
      prisma.order.count({
        where: {
          status: 'CANCELLED',
          cancelledAt: { gte: todayRange.startDate, lt: todayRange.endDate },
        },
      }),
      prisma.payment.count({
        where: {
          status: 'FAILED',
          createdAt: { gte: twentyFourHoursAgo },
        },
      }),
      prisma.order.count({
        where: { createdAt: { gte: todayRange.startDate, lt: todayRange.endDate } },
      }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
    ]);

    const activeOrdersCount =
      pendingOnlineCount + awaitingProcessingCount + awaitingShipmentCount + inTransitCount;

    // 6. Aging Orders (Clarification 3: latest transition into current status)
    const activeCandidateOrders = await prisma.order.findMany({
      where: {
        status: { in: ['CONFIRMED', 'PROCESSING'] },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        totalPayable: true,
        createdAt: true,
        user: {
          select: {
            email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          select: { toStatus: true, createdAt: true },
        },
      },
    });

    const agingList = activeCandidateOrders
      .map((o) => {
        const latestTransition = o.statusHistory.find((h) => h.toStatus === o.status);
        const statusChangedAt = latestTransition ? latestTransition.createdAt : o.createdAt;
        const hoursInStatus = Math.floor(
          (now.getTime() - statusChangedAt.getTime()) / (1000 * 60 * 60),
        );
        const customerName =
          o.user?.profile?.firstName && o.user?.profile?.lastName
            ? `${o.user.profile.firstName} ${o.user.profile.lastName}`.trim()
            : o.user?.email || 'Customer';
        return {
          id: o.id,
          orderNumber: o.orderNumber,
          customerName,
          status: o.status,
          paymentMethod: o.paymentMethod,
          paymentStatus: o.paymentStatus,
          totalPayable: o.totalPayable,
          hoursInStatus,
          statusChangedAt: statusChangedAt.toISOString(),
          createdAt: o.createdAt.toISOString(),
        };
      })
      .filter((o) => o.hoursInStatus >= 24)
      .sort((a, b) => b.hoursInStatus - a.hoursInStatus);

    // 7. Returns & Refunds Queue
    const [
      pendingReviewsCount,
      pendingInspectionsCount,
      pendingRefunds,
      failedRefundsCount,
      urgentReturnsRaw,
    ] = await Promise.all([
      prisma.returnRequest.count({ where: { status: 'REQUESTED' } }),
      prisma.returnRequest.count({ where: { status: 'APPROVED' } }),
      prisma.refund.findMany({
        where: { status: 'PENDING' },
        select: { amount: true },
      }),
      prisma.refund.count({ where: { status: 'FAILED' } }),
      prisma.returnRequest.findMany({
        where: { status: { in: ['REQUESTED', 'APPROVED'] } },
        orderBy: { createdAt: 'asc' }, // oldest first = most urgent
        take: 5,
        select: {
          id: true,
          returnNumber: true,
          status: true,
          estimatedRefundAmount: true,
          createdAt: true,
          order: { select: { orderNumber: true } },
          user: {
            select: {
              email: true,
              profile: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
    ]);

    const pendingRefundsCount = pendingRefunds.length;
    const pendingRefundsPoisha = pendingRefunds.reduce((sum, r) => sum + r.amount, 0);
    const urgentReturns = urgentReturnsRaw.map((r) => {
      const customerName =
        r.user?.profile?.firstName && r.user?.profile?.lastName
          ? `${r.user.profile.firstName} ${r.user.profile.lastName}`.trim()
          : r.user?.email || 'Customer';
      return {
        id: r.id,
        returnNumber: r.returnNumber,
        orderNumber: r.order.orderNumber,
        customerName,
        status: r.status,
        estimatedRefundAmount: r.estimatedRefundAmount,
        createdAt: r.createdAt.toISOString(),
      };
    });

    // 8. Inventory Watchlist (Out of Stock + Low Stock)
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: {
        variant: { isActive: true },
      },
      select: {
        quantity: true,
        lowStockThreshold: true,
        variant: {
          select: {
            sku: true,
            product: {
              select: {
                name: true,
                category: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    let outOfStockCount = 0;
    let lowStockCount = 0;
    const depletedItems: Array<{
      sku: string;
      productName: string;
      categoryName: string;
      quantity: number;
      lowStockThreshold: number;
      isOutOfStock: boolean;
    }> = [];

    for (const item of inventoryItems) {
      const threshold = item.lowStockThreshold ?? 5;
      if (item.quantity <= 0) {
        outOfStockCount++;
        depletedItems.push({
          sku: item.variant.sku,
          productName: item.variant.product.name,
          categoryName: item.variant.product.category?.name || 'Uncategorized',
          quantity: item.quantity,
          lowStockThreshold: threshold,
          isOutOfStock: true,
        });
      } else if (item.quantity <= threshold) {
        lowStockCount++;
        depletedItems.push({
          sku: item.variant.sku,
          productName: item.variant.product.name,
          categoryName: item.variant.product.category?.name || 'Uncategorized',
          quantity: item.quantity,
          lowStockThreshold: threshold,
          isOutOfStock: false,
        });
      }
    }

    depletedItems.sort((a, b) => a.quantity - b.quantity);
    const topAlerts = depletedItems.slice(0, 5);
    const lowStockAlertsCount = outOfStockCount + lowStockCount;

    // 9. Recent 5 Orders
    const recentOrdersRaw = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        totalPayable: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        createdAt: true,
        user: {
          select: {
            profile: {
              select: { firstName: true, lastName: true },
            },
            email: true,
          },
        },
      },
    });

    const recentOrders = recentOrdersRaw.map((o) => {
      const name =
        o.user?.profile?.firstName && o.user?.profile?.lastName
          ? `${o.user.profile.firstName} ${o.user.profile.lastName}`.trim()
          : o.user?.email || 'Customer';
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: name,
        totalPayable: o.totalPayable,
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt.toISOString(),
      };
    });

    // 10. Recent Durable Operational Activities (Clarification 4)
    const [recentOrderHistory, recentReturnHistory, recentRefunds, recentInventory] =
      await Promise.all([
        prisma.orderStatusHistory.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            order: { select: { orderNumber: true } },
            changedByUser: {
              select: {
                email: true,
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        }),
        prisma.returnStatusHistory.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            returnRequest: { select: { returnNumber: true } },
            changedByUser: {
              select: {
                email: true,
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        }),
        prisma.refund.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            processedByUser: {
              select: {
                email: true,
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        }),
        prisma.inventoryAdjustment.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            inventoryItem: { select: { variant: { select: { sku: true } } } },
            adjustedByUser: {
              select: {
                email: true,
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        }),
      ]);

    const formatActor = (
      u: { email: string; profile?: { firstName: string; lastName: string } | null } | null,
    ) => {
      if (!u) return 'System';
      if (u.profile?.firstName && u.profile?.lastName) {
        return `${u.profile.firstName} ${u.profile.lastName}`.trim();
      }
      return u.email;
    };

    const rawActivities: OperationalActivityItem[] = [
      ...recentOrderHistory.map((h) => ({
        id: `ord-${h.id}`,
        category: 'ORDER' as const,
        action: `Status -> ${h.toStatus}`,
        description: `Order ${h.order.orderNumber} moved to ${h.toStatus}${h.reason ? ` (${h.reason})` : ''}`,
        actorName: formatActor(h.changedByUser),
        actorEmail: h.changedByUser?.email,
        createdAt: h.createdAt.toISOString(),
      })),
      ...recentReturnHistory.map((h) => ({
        id: `ret-${h.id}`,
        category: 'RETURN' as const,
        action: `Return -> ${h.toStatus}`,
        description: `Return ${h.returnRequest.returnNumber} marked ${h.toStatus}${h.reason ? ` (${h.reason})` : ''}`,
        actorName: formatActor(h.changedByUser),
        actorEmail: h.changedByUser?.email,
        createdAt: h.createdAt.toISOString(),
      })),
      ...recentRefunds.map((r) => ({
        id: `ref-${r.id}`,
        category: 'REFUND' as const,
        action: `Refund ${r.status}`,
        description: `Refund ৳${(r.amount / 100).toFixed(2)} (${r.method}) ${r.status.toLowerCase()}`,
        actorName: formatActor(r.processedByUser),
        actorEmail: r.processedByUser?.email,
        createdAt: r.createdAt.toISOString(),
      })),
      ...recentInventory.map((i) => ({
        id: `inv-${i.id}`,
        category: 'INVENTORY' as const,
        action: `Stock ${i.type}`,
        description: `${i.quantityDelta > 0 ? `+${i.quantityDelta}` : i.quantityDelta} for ${i.inventoryItem.variant.sku} (${i.type})`,
        actorName: formatActor(i.adjustedByUser),
        actorEmail: i.adjustedByUser?.email,
        createdAt: i.createdAt.toISOString(),
      })),
    ];

    rawActivities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const recentActivities = rawActivities.slice(0, 8);

    return {
      // Backward compatibility
      todayDeliveredSalesPoisha: todayGrossDeliveredSalesPoisha,
      todayOrdersPlacedCount,
      todayCapturedCashPoisha,
      activeOrdersCount,
      lowStockAlertsCount,
      totalCustomersCount,
      recentOrders,
      topLowStockItems: topAlerts.map((a) => ({
        sku: a.sku,
        productName: a.productName,
        categoryName: a.categoryName,
        quantity: a.quantity,
        lowStockThreshold: a.lowStockThreshold,
      })),

      // Operational Dashboard
      financials: {
        todayDeliveredMerchandisePoisha,
        todayDeliveredShippingPoisha,
        todayGrossDeliveredSalesPoisha,
        todayCompletedRefundsPoisha,
        todayNetDeliveredSalesPoisha,
        todayCapturedCashPoisha,
        todayNetRetainedCashPoisha,
        pendingCodOrdersCount,
        pendingCodCollectionsPoisha,
      },
      pipeline: {
        activeOrdersCount,
        pendingOnlineCount,
        awaitingProcessingCount,
        awaitingShipmentCount,
        inTransitCount,
        deliveredTodayCount: todayDeliveredOrdersCount,
        cancelledTodayCount,
        failedPaymentsLast24hCount,
      },
      agingOrders: {
        count: agingList.length,
        thresholdHours: 24,
        orders: agingList.slice(0, 5),
      },
      returnsQueue: {
        pendingReviewsCount,
        pendingInspectionsCount,
        pendingRefundsCount,
        pendingRefundsPoisha,
        failedRefundsCount,
        urgentReturns,
      },
      inventoryWatchlist: {
        outOfStockCount,
        lowStockCount,
        topAlerts,
      },
      recentActivities,
    };
  }
}

export const reportService = new ReportService();
