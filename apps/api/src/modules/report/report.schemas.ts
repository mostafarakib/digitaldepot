import { z } from 'zod';
import type { ReportDatePreset } from './report.dates.js';

export const reportQuerySchema = z.object({
  preset: z
    .enum(['today', 'yesterday', 'last7days', 'last30days', 'thisMonth', 'lastMonth', 'custom'])
    .optional()
    .default('last30days'),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be in YYYY-MM-DD format')
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be in YYYY-MM-DD format')
    .optional(),
});

export type ReportQueryInput = z.infer<typeof reportQuerySchema>;

// ---------------------------------------------------------------------------
// Sales & Payment Reporting Schemas
// ---------------------------------------------------------------------------

export interface SalesReportDeliveredMetrics {
  deliveredOrdersCount: number;
  grossDeliveredMerchandisePoisha: number;
  deliveredShippingFeePoisha: number;
  deliveredDiscountsPoisha: number;
  grossDeliveredTotalPoisha: number;
  completedMerchandiseRefundsPoisha: number;
  completedShippingRefundsPoisha: number;
  totalCompletedRefundsPoisha: number;
  netDeliveredMerchandisePoisha: number;
  netDeliveredTotalPoisha: number;
  averageOrderValuePoisha: number;
}

export interface SalesReportOrderPipeline {
  totalOrdersPlacedCount: number;
  totalOrdersPlacedValuePoisha: number;
  cancelledOrdersCount: number;
  cancelledOrdersValuePoisha: number;
  byStatus: Record<string, { count: number; totalPoisha: number }>;
}

export interface SalesReportCashMetrics {
  totalPaymentAttemptsCount: number;
  grossCapturedPaymentsPoisha: number;
  capturedPaymentsCount: number;
  completedRefundsCount: number;
  totalCompletedRefundsPoisha: number;
  netRetainedPaymentsPoisha: number;
  byMethod: {
    COD: { attempts: number; capturedCount: number; capturedPoisha: number };
    SSLCOMMERZ: { attempts: number; capturedCount: number; capturedPoisha: number };
  };
}

export interface DailySalesTrendItem {
  date: string; // YYYY-MM-DD in Asia/Dhaka
  deliveredOrdersCount: number;
  deliveredTotalPoisha: number;
  placedOrdersCount: number;
  capturedPaymentsPoisha: number;
}

export interface SalesReportResponse {
  period: {
    preset: ReportDatePreset;
    dateFrom: string;
    dateTo: string;
  };
  deliveredSales: SalesReportDeliveredMetrics;
  orderPipeline: SalesReportOrderPipeline;
  cashAndPayments: SalesReportCashMetrics;
  dailyTrend: DailySalesTrendItem[];
}

// ---------------------------------------------------------------------------
// Fulfillment Reporting Schemas
// ---------------------------------------------------------------------------

export interface FulfillmentReportResponse {
  period: {
    preset: ReportDatePreset;
    dateFrom: string;
    dateTo: string;
  };
  currentPipelineDistribution: Record<string, number>;
  cycleTimes: {
    avgProcessingHours: number | null; // CONFIRMED to SHIPPED
    avgDeliveryHours: number | null; // SHIPPED to DELIVERED
    avgTotalFulfillmentHours: number | null; // CONFIRMED to DELIVERED
    measuredOrdersCount: number;
  };
  cancellationRatePercent: number;
  cancelledOrdersCount: number;
  totalOrdersInPeriod: number;
  recentFulfillmentEvents: Array<{
    id: string;
    orderNumber: string;
    fromStatus: string | null;
    toStatus: string;
    changedAt: string;
    actorName: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Inventory Reporting Schemas
// ---------------------------------------------------------------------------

export interface InventoryReportResponse {
  period: {
    preset: ReportDatePreset;
    dateFrom: string;
    dateTo: string;
  };
  stockHealth: {
    totalTrackedVariants: number;
    totalPhysicalStock: number;
    totalReservedStock: number;
    totalAvailableStock: number;
    outOfStockCount: number;
    lowStockCount: number;
  };
  valuation: {
    retailValuationPoisha: number;
    costValuationPoisha: number;
    costTrackedVariantsCount: number;
    totalVariantsCount: number;
    costCoveragePercent: number;
  };
  lowStockItems: Array<{
    variantId: string;
    sku: string;
    productName: string;
    variantTitle: string;
    categoryName: string;
    quantity: number;
    lowStockThreshold: number;
    retailPrice: number;
  }>;
  movementsInPeriod: Array<{
    type: string;
    deltaQuantity: number;
    eventsCount: number;
  }>;
}

// ---------------------------------------------------------------------------
// Returns & Refunds Reporting Schemas
// ---------------------------------------------------------------------------

export interface ReturnsReportResponse {
  period: {
    preset: ReportDatePreset;
    dateFrom: string;
    dateTo: string;
  };
  returnVolume: {
    totalReturnRequests: number;
    byStatus: Record<string, number>;
    returnRatePercent: number;
  };
  itemDisposition: {
    totalItemsReturned: number;
    restockedItemsCount: number;
    damagedOrUnusableCount: number;
  };
  refundSummary: {
    completedRefundsCount: number;
    completedMerchandiseRefundsPoisha: number;
    completedShippingRefundsPoisha: number;
    totalCompletedRefundsPoisha: number;
    byMethod: {
      SSLCOMMERZ: { count: number; totalPoisha: number };
      COD_PAYOUT: { count: number; totalPoisha: number };
    };
  };
}

// ---------------------------------------------------------------------------
// Overview Dashboard Summary Schema (Phase 8E)
// ---------------------------------------------------------------------------

export interface OperationalActivityItem {
  id: string;
  category: 'ORDER' | 'RETURN' | 'REFUND' | 'INVENTORY';
  action: string;
  description: string;
  actorName: string;
  actorEmail?: string;
  createdAt: string;
}

export interface AgingOrderItem {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  totalPayable: number;
  hoursInStatus: number;
  statusChangedAt: string;
  createdAt: string;
}

export interface UrgentReturnItem {
  id: string;
  returnNumber: string;
  orderNumber: string;
  customerName: string;
  status: string;
  estimatedRefundAmount: number;
  createdAt: string;
}

export interface OverviewReportResponse {
  // Backward compatibility fields
  todayDeliveredSalesPoisha: number;
  todayOrdersPlacedCount: number;
  todayCapturedCashPoisha: number;
  activeOrdersCount: number;
  lowStockAlertsCount: number;
  totalCustomersCount: number;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    totalPayable: number;
    status: string;
    paymentStatus: string;
    paymentMethod: string;
    createdAt: string;
  }>;
  topLowStockItems: Array<{
    sku: string;
    productName: string;
    categoryName: string;
    quantity: number;
    lowStockThreshold: number;
  }>;

  // Enriched Live Operational Dashboard Metrics
  financials: {
    todayDeliveredMerchandisePoisha: number;
    todayDeliveredShippingPoisha: number;
    todayGrossDeliveredSalesPoisha: number;
    todayCompletedRefundsPoisha: number;
    todayNetDeliveredSalesPoisha: number;
    todayCapturedCashPoisha: number;
    todayNetRetainedCashPoisha: number;
    pendingCodOrdersCount: number;
    pendingCodCollectionsPoisha: number;
  };

  pipeline: {
    activeOrdersCount: number;
    pendingOnlineCount: number;
    awaitingProcessingCount: number; // CONFIRMED
    awaitingShipmentCount: number; // PROCESSING
    inTransitCount: number; // SHIPPED
    deliveredTodayCount: number; // DELIVERED today
    cancelledTodayCount: number; // CANCELLED today
    failedPaymentsLast24hCount: number;
  };

  agingOrders: {
    count: number;
    thresholdHours: number;
    orders: AgingOrderItem[];
  };

  returnsQueue: {
    pendingReviewsCount: number; // REQUESTED
    pendingInspectionsCount: number; // APPROVED
    pendingRefundsCount: number; // PENDING
    pendingRefundsPoisha: number;
    failedRefundsCount: number; // FAILED
    urgentReturns: UrgentReturnItem[];
  };

  inventoryWatchlist: {
    outOfStockCount: number;
    lowStockCount: number;
    topAlerts: Array<{
      sku: string;
      productName: string;
      categoryName: string;
      quantity: number;
      lowStockThreshold: number;
      isOutOfStock: boolean;
    }>;
  };

  recentActivities: OperationalActivityItem[];
}
