import { describe, it, expect } from 'vitest';
import {
  calculateProportionalUnitPrice,
  calculateReturnItemRefunds,
  calculateMerchandiseRefundCapacity,
  calculatePaymentRefundCapacity,
  calculateOrderRefundCapacity,
  validateRefundBreakdown,
  checkReturnWindowEligibility,
  toDhakaDateString,
  calculateDhakaCalendarDaysDifference,
  calculateNetDeliveredQuantity,
  type ReturnableLineItem,
  type RequestedReturnItem,
} from '../return-math.js';
import { BadRequestError } from '../../../lib/errors.js';

describe('return-math: Proportional Coupon Allocation', () => {
  it('calculates proportional net unit price accurately', () => {
    // 1000 poisha unit price, 3000 subtotal, 300 coupon discount (10%)
    // netUnitPrice = round(1000 * 2700 / 3000) = 900 poisha
    const netPrice = calculateProportionalUnitPrice(1000, 3000, 300);
    expect(netPrice).toBe(900);
  });

  it('returns exact unit price when coupon discount is 0', () => {
    const netPrice = calculateProportionalUnitPrice(2500, 5000, 0);
    expect(netPrice).toBe(2500);
  });

  it('returns 0 when coupon discount covers 100% of merchandise', () => {
    const netPrice = calculateProportionalUnitPrice(2500, 5000, 5000);
    expect(netPrice).toBe(0);
  });

  it('handles rounding fractions deterministically', () => {
    // unitPrice = 100, subtotal = 300, coupon = 1
    // netUnitPrice = round(100 * 299 / 300) = round(99.666...) = 100
    const netPrice = calculateProportionalUnitPrice(100, 300, 1);
    expect(netPrice).toBe(100);

    // unitPrice = 100, subtotal = 300, coupon = 2
    // netUnitPrice = round(100 * 298 / 300) = round(99.333...) = 99
    const netPrice2 = calculateProportionalUnitPrice(100, 300, 2);
    expect(netPrice2).toBe(99);
  });

  it('rejects invalid inputs with BadRequestError', () => {
    expect(() => calculateProportionalUnitPrice(-10, 100, 0)).toThrow(BadRequestError);
    expect(() => calculateProportionalUnitPrice(100, -50, 0)).toThrow(BadRequestError);
    expect(() => calculateProportionalUnitPrice(100, 500, -20)).toThrow(BadRequestError);
    expect(() => calculateProportionalUnitPrice(10.5, 500, 0)).toThrow(BadRequestError);
  });
});

describe('return-math: Return Item Refund Calculation & Odd-Poisha Reconciliation', () => {
  it('calculates full order return with exact odd-poisha reconciliation', () => {
    // 3 items with prices 333, 333, 334. Total subtotal = 1000.
    // Coupon discount = 100. Net merchandise paid = 900.
    // Base refunds:
    // Item 1: round(1 * 333 * 900 / 1000) = round(299.7) = 300
    // Item 2: round(1 * 333 * 900 / 1000) = round(299.7) = 300
    // Item 3: round(1 * 334 * 900 / 1000) = round(300.6) = 301
    // Sum of base refunds = 901, but net paid = 900.
    // Reconciliation must subtract 1 poisha deterministically so sum is exactly 900!
    const deliveredItems: ReturnableLineItem[] = [
      { orderItemId: 'item-1', unitPrice: 333, deliveredQuantity: 1 },
      { orderItemId: 'item-2', unitPrice: 333, deliveredQuantity: 1 },
      { orderItemId: 'item-3', unitPrice: 334, deliveredQuantity: 1 },
    ];

    const requestedItems: RequestedReturnItem[] = [
      { orderItemId: 'item-1', quantity: 1 },
      { orderItemId: 'item-2', quantity: 1 },
      { orderItemId: 'item-3', quantity: 1 },
    ];

    const result = calculateReturnItemRefunds({
      merchandiseSubtotal: 1000,
      couponDiscountAmount: 100,
      deliveredItems,
      requestedItems,
    });

    expect(result.isFullOrderReturn).toBe(true);
    // Total reconciled matches exact target (900)
    expect(result.totalMerchandiseRefundAmount).toBe(900);
    const sumReconciled = result.items.reduce((s, it) => s + it.reconciledRefundAmount, 0);
    expect(sumReconciled).toBe(900);

    // Item 3 (price 334) maintains higher refund (301) than lower priced items (333)
    const item1 = result.items.find((i) => i.orderItemId === 'item-1');
    const item2 = result.items.find((i) => i.orderItemId === 'item-2');
    const item3 = result.items.find((i) => i.orderItemId === 'item-3');
    expect(item3?.reconciledRefundAmount).toBe(301);
    expect((item1?.reconciledRefundAmount ?? 0) + (item2?.reconciledRefundAmount ?? 0)).toBe(599);
  });

  it('reconciles deficit odd-poisha on full order return', () => {
    // Subtotal 1000, Coupon 50 (net 950)
    // 3 items: 333, 333, 334
    // Base refunds:
    // Item 1: round(333 * 950 / 1000) = round(316.35) = 316
    // Item 2: round(333 * 950 / 1000) = round(316.35) = 316
    // Item 3: round(334 * 950 / 1000) = round(317.3) = 317
    // Sum of base refunds = 316 + 316 + 317 = 949 (1 poisha short of 950!)
    // Reconciliation must add 1 poisha so sum is 950.
    const deliveredItems: ReturnableLineItem[] = [
      { orderItemId: 'item-1', unitPrice: 333, deliveredQuantity: 1 },
      { orderItemId: 'item-2', unitPrice: 333, deliveredQuantity: 1 },
      { orderItemId: 'item-3', unitPrice: 334, deliveredQuantity: 1 },
    ];

    const requestedItems: RequestedReturnItem[] = [
      { orderItemId: 'item-1', quantity: 1 },
      { orderItemId: 'item-2', quantity: 1 },
      { orderItemId: 'item-3', quantity: 1 },
    ];

    const result = calculateReturnItemRefunds({
      merchandiseSubtotal: 1000,
      couponDiscountAmount: 50,
      deliveredItems,
      requestedItems,
    });

    expect(result.isFullOrderReturn).toBe(true);
    expect(result.totalMerchandiseRefundAmount).toBe(950);

    const sumReconciled = result.items.reduce((s, it) => s + it.reconciledRefundAmount, 0);
    expect(sumReconciled).toBe(950);

    // Highest refund item (item 3) receives the +1 poisha adjustment
    const item3 = result.items.find((i) => i.orderItemId === 'item-3');
    expect(item3?.reconciledRefundAmount).toBe(318);
  });

  it('handles partial return without full-order reconciliation', () => {
    const deliveredItems: ReturnableLineItem[] = [
      { orderItemId: 'item-1', unitPrice: 2000, deliveredQuantity: 2 },
      { orderItemId: 'item-2', unitPrice: 1000, deliveredQuantity: 1 },
    ];

    // Returning 1 unit of item-1 (out of 2 delivered)
    const requestedItems: RequestedReturnItem[] = [{ orderItemId: 'item-1', quantity: 1 }];

    const result = calculateReturnItemRefunds({
      merchandiseSubtotal: 5000,
      couponDiscountAmount: 500, // 10% discount
      deliveredItems,
      requestedItems,
    });

    expect(result.isFullOrderReturn).toBe(false);
    // Unit net price: 2000 * 4500 / 5000 = 1800
    expect(result.totalMerchandiseRefundAmount).toBe(1800);
    expect(result.items[0].reconciledRefundAmount).toBe(1800);
    expect(result.remainingOrderMerchandiseCapacity).toBe(4500 - 1800);
  });

  it('caps partial return at remaining merchandise capacity when prior refunds exist', () => {
    const deliveredItems: ReturnableLineItem[] = [
      { orderItemId: 'item-1', unitPrice: 3000, deliveredQuantity: 1 },
    ];

    const requestedItems: RequestedReturnItem[] = [{ orderItemId: 'item-1', quantity: 1 }];

    // Subtotal 3000, coupon 0, but 2500 already refunded
    const result = calculateReturnItemRefunds({
      merchandiseSubtotal: 3000,
      couponDiscountAmount: 0,
      deliveredItems,
      requestedItems,
      previouslyCommittedMerchandiseRefunds: 2500,
    });

    expect(result.totalMerchandiseRefundAmount).toBe(500);
    expect(result.remainingOrderMerchandiseCapacity).toBe(0);
  });

  it('rejects when requested quantity exceeds returnable quantity', () => {
    const deliveredItems: ReturnableLineItem[] = [
      {
        orderItemId: 'item-1',
        unitPrice: 1000,
        deliveredQuantity: 2,
        previouslyCommittedQuantity: 1,
      },
    ];

    const requestedItems: RequestedReturnItem[] = [
      { orderItemId: 'item-1', quantity: 2 }, // Only 1 returnable
    ];

    expect(() =>
      calculateReturnItemRefunds({
        merchandiseSubtotal: 2000,
        couponDiscountAmount: 0,
        deliveredItems,
        requestedItems,
      }),
    ).toThrow(BadRequestError);
  });

  it('rejects unknown order item ID', () => {
    const deliveredItems: ReturnableLineItem[] = [
      { orderItemId: 'item-1', unitPrice: 1000, deliveredQuantity: 1 },
    ];

    const requestedItems: RequestedReturnItem[] = [{ orderItemId: 'unknown-item', quantity: 1 }];

    expect(() =>
      calculateReturnItemRefunds({
        merchandiseSubtotal: 1000,
        couponDiscountAmount: 0,
        deliveredItems,
        requestedItems,
      }),
    ).toThrow(BadRequestError);
  });
});

describe('return-math: Refund Capacity Reservations & Failed Refund Exclusion', () => {
  it('merchandise capacity counts PENDING and COMPLETED but excludes FAILED', () => {
    const order = { merchandiseSubtotal: 5000, couponDiscountAmount: 500 }; // net 4500
    const refunds = [
      { status: 'COMPLETED' as const, merchandiseAmount: 1000 },
      { status: 'PENDING' as const, merchandiseAmount: 1500 }, // Reserving 1500
      { status: 'FAILED' as const, merchandiseAmount: 2000 }, // Released!
    ];

    const capacity = calculateMerchandiseRefundCapacity(order, refunds);
    // 4500 - (1000 + 1500) = 2000 (FAILED 2000 is ignored)
    expect(capacity).toBe(2000);
  });

  it('payment capacity counts PENDING and COMPLETED for target payment only', () => {
    const payment = { id: 'pay-1', amount: 5000, status: 'PAID' };
    const refunds = [
      { paymentId: 'pay-1', status: 'COMPLETED' as const, amount: 1500 },
      { paymentId: 'pay-1', status: 'PENDING' as const, amount: 1000 }, // Reserving 1000
      { paymentId: 'pay-1', status: 'FAILED' as const, amount: 2500 }, // Released!
      { paymentId: 'pay-2', status: 'PENDING' as const, amount: 800 }, // Different payment
    ];

    const capacity = calculatePaymentRefundCapacity(payment, refunds);
    // 5000 - (1500 + 1000) = 2500
    expect(capacity).toBe(2500);
  });

  it('returns 0 payment capacity for unpaid payment', () => {
    const payment = { id: 'pay-1', amount: 5000, status: 'PENDING' };
    const capacity = calculatePaymentRefundCapacity(payment, []);
    expect(capacity).toBe(0);
  });

  it('evaluates order-level capacity and full-refund status correctly', () => {
    const order = {
      merchandiseSubtotal: 4000,
      couponDiscountAmount: 0,
      shippingFee: 100,
      payments: [{ id: 'pay-1', amount: 4100, status: 'PAID' }],
      refunds: [
        {
          id: 'ref-1',
          paymentId: 'pay-1',
          status: 'COMPLETED' as const,
          amount: 2000,
          merchandiseAmount: 2000,
          shippingAmount: 0,
        },
        {
          id: 'ref-2',
          paymentId: 'pay-1',
          status: 'PENDING' as const,
          amount: 1000,
          merchandiseAmount: 1000,
          shippingAmount: 0,
        },
      ],
    };

    const result = calculateOrderRefundCapacity(order);
    expect(result.totalCapturedAmount).toBe(4100);
    expect(result.totalCommittedRefunds).toBe(3000); // 2000 completed + 1000 pending
    expect(result.availableOrderCapacity).toBe(1100); // 4100 - 3000
    expect(result.availableMerchandiseCapacity).toBe(1000); // 4000 - 3000
    expect(result.isOrderFullyRefunded).toBe(false); // Only 2000 completed
  });

  it('keeps isOrderFullyRefunded false when non-refundable shipping is retained', () => {
    // merchandise = 1000, shipping = 100, totalCaptured = 1100.
    // 1000 merchandise refunded. Shipping 100 retained.
    // Captured = 1100, completed refunds = 1000 -> isOrderFullyRefunded = false.
    const order = {
      merchandiseSubtotal: 1000,
      couponDiscountAmount: 0,
      shippingFee: 100,
      payments: [{ id: 'pay-1', amount: 1100, status: 'PAID' }],
      refunds: [
        {
          id: 'ref-1',
          paymentId: 'pay-1',
          status: 'COMPLETED' as const,
          amount: 1000,
          merchandiseAmount: 1000,
          shippingAmount: 0,
        },
      ],
    };

    const result = calculateOrderRefundCapacity(order);
    expect(result.isOrderFullyRefunded).toBe(false);
  });

  it('marks isOrderFullyRefunded true only when all captured amounts are refunded', () => {
    const order = {
      merchandiseSubtotal: 1000,
      couponDiscountAmount: 0,
      shippingFee: 100,
      payments: [{ id: 'pay-1', amount: 1100, status: 'PAID' }],
      refunds: [
        {
          id: 'ref-1',
          paymentId: 'pay-1',
          status: 'COMPLETED' as const,
          amount: 1000,
          merchandiseAmount: 1000,
          shippingAmount: 0,
        },
        {
          id: 'ref-2',
          paymentId: 'pay-1',
          status: 'COMPLETED' as const,
          amount: 100,
          merchandiseAmount: 0,
          shippingAmount: 100, // Shipping refunded too
        },
      ],
    };

    const result = calculateOrderRefundCapacity(order);
    expect(result.isOrderFullyRefunded).toBe(true);
  });
});

describe('return-math: Refund Breakdown Validation', () => {
  it('validates correct integer breakdown', () => {
    const res = validateRefundBreakdown(900, 100, 1000);
    expect(res.isValid).toBe(true);
  });

  it('validates 100% merchandise refund with 0 shipping', () => {
    const res = validateRefundBreakdown(1500, 0, 1500);
    expect(res.isValid).toBe(true);
  });

  it('rejects mismatched sum', () => {
    const res = validateRefundBreakdown(900, 50, 1000);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('must equal');
  });

  it('rejects negative or fractional values', () => {
    expect(validateRefundBreakdown(-10, 100, 90).isValid).toBe(false);
    expect(validateRefundBreakdown(90.5, 10, 100.5).isValid).toBe(false);
    expect(validateRefundBreakdown(0, 0, 0).isValid).toBe(false);
  });
});

describe('return-math: Asia/Dhaka 7-Calendar-Day Return Window', () => {
  it('formats dates in Asia/Dhaka timezone correctly', () => {
    // 2026-11-06T18:30:00.000Z is 2026-11-07 00:30:00 in Asia/Dhaka (+6 hrs)
    const utcDate = new Date('2026-11-06T18:30:00.000Z');
    expect(toDhakaDateString(utcDate)).toBe('2026-11-07');
  });

  it('calculates calendar day differences in Asia/Dhaka', () => {
    const del = new Date('2026-11-06T18:30:00.000Z'); // Dhaka: 2026-11-07
    const now = new Date('2026-11-13T10:00:00.000Z'); // Dhaka: 2026-11-13
    const diff = calculateDhakaCalendarDaysDifference(del, now);
    expect(diff).toBe(6);
  });

  it('allows return on Day 0 (same day as delivery)', () => {
    const deliveredAt = new Date('2026-11-13T02:00:00.000Z');
    const checkedAt = new Date('2026-11-13T14:00:00.000Z');
    const result = checkReturnWindowEligibility(deliveredAt, checkedAt);

    expect(result.isEligible).toBe(true);
    expect(result.calendarDaysPassed).toBe(0);
    expect(result.daysRemaining).toBe(7);
  });

  it('allows return on Day 7 (exact cutoff day)', () => {
    const deliveredAt = new Date('2026-11-06T04:00:00.000Z'); // Dhaka: 2026-11-06
    const checkedAt = new Date('2026-11-13T17:00:00.000Z'); // Dhaka: 2026-11-13 (Day 7)
    const result = checkReturnWindowEligibility(deliveredAt, checkedAt);

    expect(result.isEligible).toBe(true);
    expect(result.calendarDaysPassed).toBe(7);
    expect(result.daysRemaining).toBe(0); // Last day
  });

  it('rejects return on Day 8 (after cutoff day)', () => {
    const deliveredAt = new Date('2026-11-05T04:00:00.000Z'); // Dhaka: 2026-11-05
    const checkedAt = new Date('2026-11-13T17:00:00.000Z'); // Dhaka: 2026-11-13 (Day 8)
    const result = checkReturnWindowEligibility(deliveredAt, checkedAt);

    expect(result.isEligible).toBe(false);
    expect(result.reason).toBe('RETURN_WINDOW_EXPIRED');
    expect(result.calendarDaysPassed).toBe(8);
    expect(result.daysRemaining).toBe(0);
  });

  it('rejects return for undelivered order', () => {
    const result = checkReturnWindowEligibility(null);
    expect(result.isEligible).toBe(false);
    expect(result.reason).toBe('ORDER_NOT_DELIVERED');
  });
});

describe('return-math: calculateNetDeliveredQuantity (Phase 7E)', () => {
  it('returns delivered quantity when there are no returns', () => {
    const net = calculateNetDeliveredQuantity(3, []);
    expect(net).toBe(3);
  });

  it('does not reduce quantity for non-completed returns (REQUESTED, APPROVED, RECEIVED, REJECTED, CANCELLED)', () => {
    const returns = [
      { quantity: 1, returnRequestStatus: 'REQUESTED' },
      { quantity: 1, returnRequestStatus: 'APPROVED' },
      { quantity: 1, returnRequestStatus: 'RECEIVED' },
      { quantity: 1, returnRequestStatus: 'REJECTED' },
      { quantity: 1, returnRequestStatus: 'CANCELLED' },
    ];
    const net = calculateNetDeliveredQuantity(5, returns);
    expect(net).toBe(5);
  });

  it('reduces quantity strictly by COMPLETED return quantities (partial return)', () => {
    const returns = [
      { quantity: 1, returnRequestStatus: 'REQUESTED' },
      { quantity: 2, returnRequestStatus: 'COMPLETED' },
      { quantity: 1, returnRequestStatus: 'RECEIVED' },
    ];
    // Delivered 5, only 2 completed -> 3 remains
    const net = calculateNetDeliveredQuantity(5, returns);
    expect(net).toBe(3);
  });

  it('returns 0 when item is fully returned in COMPLETED return', () => {
    const returns = [{ quantity: 3, returnRequestStatus: 'COMPLETED' }];
    const net = calculateNetDeliveredQuantity(3, returns);
    expect(net).toBe(0);
  });

  it('handles multiple COMPLETED returns summing to full return', () => {
    const returns = [
      { quantity: 1, returnRequestStatus: 'COMPLETED' },
      { quantity: 2, returnRequestStatus: 'COMPLETED' },
    ];
    const net = calculateNetDeliveredQuantity(3, returns);
    expect(net).toBe(0);
  });

  it('rejects invalid deliveredQuantity with BadRequestError', () => {
    expect(() => calculateNetDeliveredQuantity(-1, [])).toThrow(BadRequestError);
    expect(() => calculateNetDeliveredQuantity(2.5, [])).toThrow(BadRequestError);
  });
});
