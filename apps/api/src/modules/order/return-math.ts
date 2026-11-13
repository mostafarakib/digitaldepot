import { BadRequestError } from '../../lib/errors.js';

export const ASIA_DHAKA_TIMEZONE = 'Asia/Dhaka';
export const RETURN_WINDOW_CALENDAR_DAYS = 7;

export interface ReturnableLineItem {
  orderItemId: string;
  unitPrice: number; // In integer BDT poisha
  deliveredQuantity: number;
  previouslyCommittedQuantity?: number; // REQUESTED, APPROVED, RECEIVED, COMPLETED
}

export interface RequestedReturnItem {
  orderItemId: string;
  quantity: number;
}

export interface OrderMerchandiseSnapshot {
  merchandiseSubtotal: number; // In integer BDT poisha
  couponDiscountAmount: number; // In integer BDT poisha
}

export interface CalculatedReturnItemRefund {
  orderItemId: string;
  quantity: number;
  unitPrice: number;
  netUnitPrice: number;
  baseRefundAmount: number;
  reconciledRefundAmount: number;
}

export interface CalculatedReturnRefund {
  items: CalculatedReturnItemRefund[];
  totalMerchandiseRefundAmount: number;
  isFullOrderReturn: boolean;
  remainingOrderMerchandiseCapacity: number;
}

export interface RefundCapacityRecord {
  id?: string;
  paymentId?: string;
  amount: number;
  merchandiseAmount: number;
  shippingAmount: number;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
}

export interface PaymentCapacityRecord {
  id: string;
  amount: number;
  status: string; // 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED'
}

export interface OrderFinancialCapacitySnapshot {
  merchandiseSubtotal: number;
  couponDiscountAmount: number;
  shippingFee: number;
  payments: PaymentCapacityRecord[];
  refunds: RefundCapacityRecord[];
}

export interface ReturnWindowResult {
  isEligible: boolean;
  reason?: 'ORDER_NOT_DELIVERED' | 'RETURN_WINDOW_EXPIRED';
  calendarDaysPassed: number;
  daysRemaining: number;
  deliveryDateDhaka: string | null;
  currentDateDhaka: string;
  cutoffDateDhaka: string | null;
}

// ---------------------------------------------------------------------------
// 1. Proportional Coupon Allocation & Integer Poisha Reconciliation
// ---------------------------------------------------------------------------

/**
 * Calculates net unit price after proportional coupon discount allocation.
 * Formula: round(unitPrice * (merchandiseSubtotal - couponDiscountAmount) / merchandiseSubtotal)
 */
export function calculateProportionalUnitPrice(
  unitPrice: number,
  merchandiseSubtotal: number,
  couponDiscountAmount: number,
): number {
  if (!Number.isInteger(unitPrice) || unitPrice < 0) {
    throw new BadRequestError(
      'INVALID_UNIT_PRICE',
      'Unit price must be a non-negative integer poisha',
    );
  }
  if (!Number.isInteger(merchandiseSubtotal) || merchandiseSubtotal < 0) {
    throw new BadRequestError(
      'INVALID_SUBTOTAL',
      'Merchandise subtotal must be a non-negative integer poisha',
    );
  }
  if (!Number.isInteger(couponDiscountAmount) || couponDiscountAmount < 0) {
    throw new BadRequestError(
      'INVALID_COUPON_DISCOUNT',
      'Coupon discount must be a non-negative integer poisha',
    );
  }

  if (merchandiseSubtotal === 0 || unitPrice === 0) {
    return 0;
  }

  const netMerchandise = Math.max(0, merchandiseSubtotal - couponDiscountAmount);
  if (netMerchandise === 0) {
    return 0;
  }

  return Math.round((unitPrice * netMerchandise) / merchandiseSubtotal);
}

/**
 * Calculates line item refunds with deterministic integer-poisha reconciliation.
 * Ensures the sum of item refunds never exceeds the net merchandise paid and that
 * a full return recovers exactly 100% of the remaining paid merchandise without rounding drift.
 */
export function calculateReturnItemRefunds(params: {
  merchandiseSubtotal: number;
  couponDiscountAmount: number;
  deliveredItems: ReturnableLineItem[];
  requestedItems: RequestedReturnItem[];
  previouslyCommittedMerchandiseRefunds?: number;
}): CalculatedReturnRefund {
  const {
    merchandiseSubtotal,
    couponDiscountAmount,
    deliveredItems,
    requestedItems,
    previouslyCommittedMerchandiseRefunds = 0,
  } = params;

  if (requestedItems.length === 0) {
    throw new BadRequestError('EMPTY_RETURN_ITEMS', 'At least one return item must be requested');
  }

  const netMerchandisePaid = Math.max(0, merchandiseSubtotal - couponDiscountAmount);
  const remainingMerchandiseCapacity = Math.max(
    0,
    netMerchandisePaid - previouslyCommittedMerchandiseRefunds,
  );

  // Map delivered items for fast lookup
  const deliveredMap = new Map<string, ReturnableLineItem>();
  for (const item of deliveredItems) {
    deliveredMap.set(item.orderItemId, item);
  }

  let totalDeliveredUnits = 0;
  let totalCommittedUnits = 0;
  for (const item of deliveredItems) {
    totalDeliveredUnits += item.deliveredQuantity;
    totalCommittedUnits += item.previouslyCommittedQuantity ?? 0;
  }

  let totalRequestedUnits = 0;
  const intermediateItems: Array<{
    orderItemId: string;
    quantity: number;
    unitPrice: number;
    netUnitPrice: number;
    baseRefundAmount: number;
  }> = [];

  for (const req of requestedItems) {
    if (!Number.isInteger(req.quantity) || req.quantity <= 0) {
      throw new BadRequestError(
        'INVALID_RETURN_QUANTITY',
        `Quantity for item ${req.orderItemId} must be positive integer`,
      );
    }

    const del = deliveredMap.get(req.orderItemId);
    if (!del) {
      throw new BadRequestError(
        'ORDER_ITEM_NOT_FOUND',
        `Order item ${req.orderItemId} was not found on this order`,
      );
    }

    const previouslyCommitted = del.previouslyCommittedQuantity ?? 0;
    const returnable = del.deliveredQuantity - previouslyCommitted;
    if (req.quantity > returnable) {
      throw new BadRequestError(
        'RETURN_QUANTITY_EXCEEDED',
        `Requested quantity (${req.quantity}) exceeds returnable quantity (${returnable}) for item ${req.orderItemId}`,
      );
    }

    totalRequestedUnits += req.quantity;

    const netUnitPrice = calculateProportionalUnitPrice(
      del.unitPrice,
      merchandiseSubtotal,
      couponDiscountAmount,
    );

    // Calculate base refund proportionally
    let baseRefundAmount = 0;
    if (merchandiseSubtotal > 0 && netMerchandisePaid > 0) {
      baseRefundAmount = Math.round(
        (req.quantity * del.unitPrice * netMerchandisePaid) / merchandiseSubtotal,
      );
    }

    intermediateItems.push({
      orderItemId: req.orderItemId,
      quantity: req.quantity,
      unitPrice: del.unitPrice,
      netUnitPrice,
      baseRefundAmount,
    });
  }

  const isFullOrderReturn = totalCommittedUnits + totalRequestedUnits === totalDeliveredUnits;

  // Determine target total merchandise refund amount
  const sumBaseRefunds = intermediateItems.reduce((acc, it) => acc + it.baseRefundAmount, 0);

  let targetTotal: number;
  if (isFullOrderReturn) {
    // Exact reconciliation: full return recovers 100% of remaining merchandise poisha
    targetTotal = remainingMerchandiseCapacity;
  } else {
    // Partial return capped at remaining merchandise capacity
    targetTotal = Math.min(sumBaseRefunds, remainingMerchandiseCapacity);
  }

  // Proportional allocation with deterministic integer-poisha remainder distribution
  let reconciledItems: CalculatedReturnItemRefund[];

  if (targetTotal === 0) {
    reconciledItems = intermediateItems.map((it) => ({
      ...it,
      reconciledRefundAmount: 0,
    }));
  } else if (sumBaseRefunds === targetTotal) {
    // Fast path: exact match, no discrepancy
    reconciledItems = intermediateItems.map((it) => ({
      ...it,
      reconciledRefundAmount: it.baseRefundAmount,
    }));
  } else if (sumBaseRefunds > 0) {
    // Scale items proportionally
    let allocatedSum = 0;
    reconciledItems = intermediateItems.map((it) => {
      const allocated = Math.floor((it.baseRefundAmount * targetTotal) / sumBaseRefunds);
      allocatedSum += allocated;
      return {
        ...it,
        reconciledRefundAmount: allocated,
      };
    });

    let remainder = targetTotal - allocatedSum;
    if (remainder > 0) {
      // Sort deterministically: highest base refund first, orderItemId as tie-breaker
      const sortedIndices = reconciledItems
        .map((item, index) => ({ index, refund: item.baseRefundAmount, id: item.orderItemId }))
        .sort((a, b) => b.refund - a.refund || a.id.localeCompare(b.id));

      let ptr = 0;
      while (remainder > 0 && sortedIndices.length > 0) {
        const targetIdx = sortedIndices[ptr % sortedIndices.length].index;
        reconciledItems[targetIdx].reconciledRefundAmount += 1;
        remainder -= 1;
        ptr++;
      }
    }
  } else {
    // sumBaseRefunds === 0 but targetTotal > 0 (e.g. promo items with manual reconciliation)
    let remainder = targetTotal;
    reconciledItems = intermediateItems.map((it) => ({
      ...it,
      reconciledRefundAmount: 0,
    }));
    let ptr = 0;
    while (remainder > 0 && reconciledItems.length > 0) {
      reconciledItems[ptr % reconciledItems.length].reconciledRefundAmount += 1;
      remainder -= 1;
      ptr++;
    }
  }

  const finalTotalRefund = reconciledItems.reduce((acc, it) => acc + it.reconciledRefundAmount, 0);

  return {
    items: reconciledItems,
    totalMerchandiseRefundAmount: finalTotalRefund,
    isFullOrderReturn,
    remainingOrderMerchandiseCapacity: Math.max(0, remainingMerchandiseCapacity - finalTotalRefund),
  };
}

// ---------------------------------------------------------------------------
// 2. Refund Capacity Calculations (Order, Payment, Merchandise)
// ---------------------------------------------------------------------------

/**
 * Checks whether a refund record actively reserves capacity.
 * PENDING and COMPLETED reserve capacity; FAILED releases capacity.
 */
export function isRefundActive(status: 'PENDING' | 'COMPLETED' | 'FAILED'): boolean {
  return status === 'PENDING' || status === 'COMPLETED';
}

/**
 * Sums committed merchandise refund amounts from PENDING and COMPLETED refunds.
 */
export function calculateCommittedMerchandiseRefunds(
  refunds: Array<{ status: 'PENDING' | 'COMPLETED' | 'FAILED'; merchandiseAmount: number }>,
): number {
  return refunds
    .filter((r) => isRefundActive(r.status))
    .reduce((sum, r) => sum + r.merchandiseAmount, 0);
}

/**
 * Sums committed total refund amounts from PENDING and COMPLETED refunds.
 */
export function calculateCommittedTotalRefunds(
  refunds: Array<{ status: 'PENDING' | 'COMPLETED' | 'FAILED'; amount: number }>,
): number {
  return refunds.filter((r) => isRefundActive(r.status)).reduce((sum, r) => sum + r.amount, 0);
}

/**
 * Sums committed shipping refund amounts from PENDING and COMPLETED refunds.
 */
export function calculateCommittedShippingRefunds(
  refunds: Array<{ status: 'PENDING' | 'COMPLETED' | 'FAILED'; shippingAmount: number }>,
): number {
  return refunds
    .filter((r) => isRefundActive(r.status))
    .reduce((sum, r) => sum + r.shippingAmount, 0);
}

/**
 * Calculates available merchandise refund capacity for an order.
 * Only merchandiseAmount from PENDING and COMPLETED refunds counts against capacity.
 */
export function calculateMerchandiseRefundCapacity(
  order: { merchandiseSubtotal: number; couponDiscountAmount: number },
  refunds: Array<{ status: 'PENDING' | 'COMPLETED' | 'FAILED'; merchandiseAmount: number }>,
): number {
  const netMerchandisePaid = Math.max(0, order.merchandiseSubtotal - order.couponDiscountAmount);
  const committedMerchandise = calculateCommittedMerchandiseRefunds(refunds);
  return Math.max(0, netMerchandisePaid - committedMerchandise);
}

/**
 * Calculates available refund capacity for an individual payment.
 * Total amount from PENDING and COMPLETED refunds counts against capacity.
 */
export function calculatePaymentRefundCapacity(
  payment: { id: string; amount: number; status: string },
  refunds: Array<{
    paymentId?: string;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    amount: number;
  }>,
): number {
  if (payment.status !== 'PAID') {
    return 0;
  }
  const committedPaymentRefunds = refunds
    .filter((r) => r.paymentId === payment.id && isRefundActive(r.status))
    .reduce((sum, r) => sum + r.amount, 0);

  return Math.max(0, payment.amount - committedPaymentRefunds);
}

/**
 * Evaluates comprehensive financial refund capacity across an entire order.
 */
export function calculateOrderRefundCapacity(
  order: {
    merchandiseSubtotal: number;
    couponDiscountAmount: number;
    shippingFee: number;
    payments: PaymentCapacityRecord[];
    refunds: RefundCapacityRecord[];
  },
  options?: { allowShippingRefund?: boolean },
): {
  totalCapturedAmount: number;
  totalCommittedRefunds: number;
  availableOrderCapacity: number;
  availableMerchandiseCapacity: number;
  availableShippingCapacity: number;
  isOrderFullyRefunded: boolean;
} {
  const totalCapturedAmount = order.payments
    .filter((p) => p.status === 'PAID' || p.status === 'REFUNDED')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalCommittedRefunds = calculateCommittedTotalRefunds(order.refunds);
  const availableOrderCapacity = Math.max(0, totalCapturedAmount - totalCommittedRefunds);

  const availableMerchandiseCapacity = calculateMerchandiseRefundCapacity(
    {
      merchandiseSubtotal: order.merchandiseSubtotal,
      couponDiscountAmount: order.couponDiscountAmount,
    },
    order.refunds,
  );

  const committedShipping = calculateCommittedShippingRefunds(order.refunds);
  const maxRefundableShipping = options?.allowShippingRefund ? order.shippingFee : 0;
  const availableShippingCapacity = Math.max(0, maxRefundableShipping - committedShipping);

  // An order is fully refunded when all captured payment amounts have been refunded via COMPLETED refunds
  const completedRefundsTotal = order.refunds
    .filter((r) => r.status === 'COMPLETED')
    .reduce((sum, r) => sum + r.amount, 0);

  const isOrderFullyRefunded =
    totalCapturedAmount > 0 && completedRefundsTotal >= totalCapturedAmount;

  return {
    totalCapturedAmount,
    totalCommittedRefunds,
    availableOrderCapacity,
    availableMerchandiseCapacity,
    availableShippingCapacity,
    isOrderFullyRefunded,
  };
}

/**
 * Validates that refund amount equals merchandiseAmount + shippingAmount and adheres to integer poisha constraints.
 */
export function validateRefundBreakdown(
  merchandiseAmount: number,
  shippingAmount: number,
  amount: number,
): { isValid: boolean; error?: string } {
  if (!Number.isInteger(merchandiseAmount) || merchandiseAmount < 0) {
    return { isValid: false, error: 'merchandiseAmount must be a non-negative integer poisha' };
  }
  if (!Number.isInteger(shippingAmount) || shippingAmount < 0) {
    return { isValid: false, error: 'shippingAmount must be a non-negative integer poisha' };
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return { isValid: false, error: 'amount must be a positive integer poisha' };
  }
  if (amount !== merchandiseAmount + shippingAmount) {
    return {
      isValid: false,
      error: `amount (${amount}) must equal merchandiseAmount (${merchandiseAmount}) + shippingAmount (${shippingAmount})`,
    };
  }
  return { isValid: true };
}

// ---------------------------------------------------------------------------
// 3. Asia/Dhaka 7-Calendar-Day Return Window Calculation
// ---------------------------------------------------------------------------

/**
 * Formats a Date object as a YYYY-MM-DD date string in the Asia/Dhaka timezone.
 */
export function toDhakaDateString(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ASIA_DHAKA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Computes calendar day difference between two dates evaluated strictly in Asia/Dhaka timezone.
 * Returns toDate - fromDate in whole calendar days.
 */
export function calculateDhakaCalendarDaysDifference(fromDate: Date, toDate: Date): number {
  const fromStr = toDhakaDateString(fromDate);
  const toStr = toDhakaDateString(toDate);

  const [fromY, fromM, fromD] = fromStr.split('-').map(Number);
  const [toY, toM, toD] = toStr.split('-').map(Number);

  const fromUtc = Date.UTC(fromY, fromM - 1, fromD);
  const toUtc = Date.UTC(toY, toM - 1, toD);

  const diffMs = toUtc - fromUtc;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Checks return eligibility based on the 7-calendar-day policy using Asia/Dhaka dates.
 * Window opens upon delivery and closes at 23:59:59.999 Asia/Dhaka on Day 7.
 */
export function checkReturnWindowEligibility(
  deliveredAt: Date | string | null | undefined,
  currentDate: Date = new Date(),
): ReturnWindowResult {
  const currentDateDhaka = toDhakaDateString(currentDate);

  if (!deliveredAt) {
    return {
      isEligible: false,
      reason: 'ORDER_NOT_DELIVERED',
      calendarDaysPassed: 0,
      daysRemaining: 0,
      deliveryDateDhaka: null,
      currentDateDhaka,
      cutoffDateDhaka: null,
    };
  }

  const deliveryDateObj = typeof deliveredAt === 'string' ? new Date(deliveredAt) : deliveredAt;
  if (isNaN(deliveryDateObj.getTime())) {
    throw new BadRequestError('INVALID_DATE', 'Provided delivery timestamp is invalid');
  }

  const deliveryDateDhaka = toDhakaDateString(deliveryDateObj);
  const diffDays = calculateDhakaCalendarDaysDifference(deliveryDateObj, currentDate);

  // Cutoff date is 7 calendar days after delivery date in Asia/Dhaka
  const [delY, delM, delD] = deliveryDateDhaka.split('-').map(Number);
  const cutoffUtc = Date.UTC(delY, delM - 1, delD) + RETURN_WINDOW_CALENDAR_DAYS * 86400000;
  const cutoffDate = new Date(cutoffUtc);
  const cutoffDateDhaka = cutoffDate.toISOString().slice(0, 10);

  // If clock skew makes diffDays negative, treat as day 0
  const calendarDaysPassed = Math.max(0, diffDays);
  const daysRemaining = Math.max(0, RETURN_WINDOW_CALENDAR_DAYS - calendarDaysPassed);

  if (diffDays > RETURN_WINDOW_CALENDAR_DAYS) {
    return {
      isEligible: false,
      reason: 'RETURN_WINDOW_EXPIRED',
      calendarDaysPassed,
      daysRemaining: 0,
      deliveryDateDhaka,
      currentDateDhaka,
      cutoffDateDhaka,
    };
  }

  return {
    isEligible: true,
    calendarDaysPassed,
    daysRemaining,
    deliveryDateDhaka,
    currentDateDhaka,
    cutoffDateDhaka,
  };
}

/**
 * Calculates net remaining purchased quantity for an order item or product
 * based on delivered quantity minus COMPLETED return quantities.
 *
 * Rules (Phase 7E):
 * 1. Only COMPLETED return quantities reduce delivered quantity.
 * 2. REQUESTED, APPROVED, RECEIVED, REJECTED, and CANCELLED returns do not reduce quantity.
 */
export function calculateNetDeliveredQuantity(
  deliveredQuantity: number,
  returnItems: Array<{ quantity: number; returnRequestStatus: string }>,
): number {
  if (!Number.isInteger(deliveredQuantity) || deliveredQuantity < 0) {
    throw new BadRequestError(
      'INVALID_QUANTITY',
      'Delivered quantity must be a non-negative integer',
    );
  }

  const completedReturnedQuantity = returnItems
    .filter((r) => r.returnRequestStatus === 'COMPLETED')
    .reduce((sum, r) => sum + r.quantity, 0);

  return Math.max(0, deliveredQuantity - completedReturnedQuantity);
}
