import { z } from 'zod';
import type { PaymentStatus, PaymentMethod, OrderStatus } from '../../generated/client/client.js';

export const adminPaymentQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(['ALL', 'PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED']).default('ALL'),
  method: z.enum(['ALL', 'COD', 'SSLCOMMERZ']).default('ALL'),
  dateFrom: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    ),
  dateTo: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    ),
  orderNumber: z.string().trim().optional(),
  customerId: z.string().trim().optional(),
  sortBy: z.enum(['newest', 'oldest', 'amountDesc', 'amountAsc', 'paidAtDesc']).default('newest'),
});

export type AdminPaymentQueryInput = z.infer<typeof adminPaymentQuerySchema>;

export interface SafeGatewayDetails {
  bankTranId?: string;
  cardType?: string;
  cardBrand?: string;
  cardIssuer?: string;
  cardNo?: string;
  gatewayStatus?: string;
}

export interface AdminPaymentListItem {
  id: string;
  transactionId: string;
  gatewayTransactionId: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number; // minor units (poisha)
  currency: string;
  refundedAmount: number; // minor units (poisha) from COMPLETED refunds
  netAmount: number; // max(0, amount - refundedAmount) for captured payments, else 0
  paidAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    totalPayable: number;
    customer: {
      id: string;
      email: string;
      name: string;
      phone: string | null;
    };
  };
}

export interface AdminPaymentStats {
  totalAttempts: number;
  successfulPayments: number;
  failedPayments: number;
  pendingPayments: number;
  cancelledPayments: number;
  totalCapturedPoisha: number;
  totalRefundedPoisha: number;
  netRetainedPoisha: number;
}

export interface AdminPaymentListResponse {
  payments: AdminPaymentListItem[];
  stats: AdminPaymentStats;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminPaymentDetailResponse {
  payment: AdminPaymentListItem & {
    safeGatewayDetails: SafeGatewayDetails | null;
    remainingRefundCapacity: number;
    order: {
      id: string;
      orderNumber: string;
      status: OrderStatus;
      paymentStatus: PaymentStatus;
      paymentMethod: PaymentMethod;
      merchandiseSubtotal: number;
      shippingFee: number;
      discountAmount: number;
      totalPayable: number;
      shippingAddress: {
        recipientName: string;
        phone: string;
        alternativePhone: string | null;
        streetAddress: string;
        upazila: string;
        districtId: string;
        divisionId: string;
      };
      items: Array<{
        id: string;
        productName: string;
        variantTitle: string;
        sku: string;
        unitPrice: number;
        quantity: number;
        lineTotal: number;
        thumbnailUrl: string | null;
      }>;
      customer: {
        id: string;
        email: string;
        name: string;
        phone: string | null;
      };
      otherPaymentAttempts: Array<{
        id: string;
        transactionId: string;
        method: PaymentMethod;
        status: PaymentStatus;
        amount: number;
        createdAt: string;
      }>;
    };
    refunds: Array<{
      id: string;
      refundNumber: string;
      returnRequestId: string;
      returnNumber: string;
      amount: number;
      merchandiseAmount: number;
      shippingAmount: number;
      method: string;
      status: string;
      gatewayReference: string | null;
      payoutReference: string | null;
      payoutChannel: string | null;
      failureReason: string | null;
      processedAt: string | null;
      processedBy: {
        id: string;
        name: string;
        email: string;
      } | null;
      createdAt: string;
    }>;
  };
}
