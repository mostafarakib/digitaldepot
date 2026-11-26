import type { ConfirmedOrderDetails, PaymentResultStatus } from './order-types';

export function resolveAuthoritativePaymentStatus(
  order: Pick<ConfirmedOrderDetails, 'status' | 'paymentStatus'>,
): Exclude<PaymentResultStatus, 'LOADING'> {
  if (order.paymentStatus === 'PAID') {
    return order.status === 'CANCELLED' ? 'LATE_PAYMENT' : 'SUCCESS';
  }
  if (order.paymentStatus === 'PENDING' && order.status === 'PENDING') {
    return 'PENDING';
  }
  if (order.paymentStatus === 'FAILED') {
    return 'FAILED';
  }
  if (order.paymentStatus === 'CANCELLED' || order.status === 'CANCELLED') {
    return 'CANCELLED';
  }
  return 'FAILED';
}

export function resolveFallbackWithoutOrder(hint?: string): Exclude<PaymentResultStatus, 'LOADING'> {
  const normalized = hint?.trim().toUpperCase();
  if (normalized === 'CANCELLED') return 'CANCELLED';
  if (normalized === 'PENDING') return 'PENDING';
  return 'FAILED';
}
