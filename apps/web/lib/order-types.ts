export type OrderStatus =
  'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';

export type PaymentMethod = 'COD' | 'SSLCOMMERZ';

export interface OrderShippingAddress {
  recipientName: string;
  phone: string;
  alternativePhone?: string | null;
  divisionId: string;
  districtId: string;
  upazila: string;
  streetAddress: string;
  deliveryNotes?: string | null;
}

export interface OrderItemSummary {
  id: string;
  orderId: string;
  productId?: string | null;
  variantId?: string | null;
  productName: string;
  variantTitle: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  attributes?: Record<string, unknown> | null;
  thumbnailUrl?: string | null;
}

export interface PaymentSummary {
  id: string;
  orderId: string;
  transactionId: string;
  gatewayTransactionId?: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  currency: string;
  paidAt?: string | null;
  failedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
}

export interface OrderStatusHistoryEntry {
  id: string;
  orderId: string;
  fromStatus?: OrderStatus | null;
  toStatus: OrderStatus;
  reason?: string | null;
  changedByUserId?: string | null;
  createdAt: string;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  merchandiseSubtotal: number;
  discountAmount: number;
  shippingFee: number;
  totalPayable: number;
  shippingAddress: OrderShippingAddress;
  couponCode?: string | null;
  couponDiscountType?: 'PERCENTAGE' | 'FIXED_AMOUNT' | null;
  couponDiscountValue?: number | null;
  couponDiscountAmount: number;
  paymentExpiresAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  items: OrderItemSummary[];
  payments: PaymentSummary[];
  statusHistory: OrderStatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderInput {
  addressId?: string;
  alternativePhone?: string;
  deliveryNotes?: string;
  paymentMethod: PaymentMethod;
  acknowledgedLivePrices?: boolean;
}

export interface CodCheckoutInput {
  addressId: string;
  deliveryNotes?: string | null;
  alternativePhone?: string | null;
  acknowledgedLivePrices?: boolean;
}

export interface ConfirmedOrderItem {
  id: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  variantTitle: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  attributes: Record<string, unknown> | null;
  thumbnailUrl: string | null;
}

export interface ConfirmedOrderDetails {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  merchandiseSubtotal: number;
  discountAmount: number;
  shippingFee: number;
  totalPayable: number;
  shippingAddress: OrderShippingAddress;
  coupon: {
    code: string;
    discountAmount: number;
  } | null;
  items: ConfirmedOrderItem[];
  payments?: Array<{
    id: string;
    transactionId: string;
    method: PaymentMethod;
    status: PaymentStatus;
    amount: number;
    createdAt: string;
  }>;
  createdAt: string;
}

export interface CodCheckoutResponse {
  order: ConfirmedOrderDetails;
}

export interface OnlineCheckoutInput {
  addressId: string;
  deliveryNotes?: string | null;
  alternativePhone?: string | null;
  acknowledgedLivePrices?: boolean;
}

export interface OnlineCheckoutResponse {
  order: ConfirmedOrderDetails;
  gatewayUrl: string;
  sessionKey: string;
}

export type PaymentResultStatus = 'SUCCESS' | 'LATE_PAYMENT' | 'FAILED' | 'CANCELLED';

export interface OrderConfirmationData {
  order: ConfirmedOrderDetails;
}

export interface CustomerOrderItemPreview {
  id: string;
  productId: string | null;
  productName: string;
  variantTitle: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  thumbnailUrl: string | null;
}

export interface CustomerOrderSummaryItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  totalPayable: number;
  itemCount: number;
  items: CustomerOrderItemPreview[];
  createdAt: string;
}

export interface CustomerOrderListResponse {
  orders: CustomerOrderSummaryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CustomerOrderDetailItem {
  id: string;
  productId: string | null;
  productSlug?: string | null;
  variantId: string | null;
  productName: string;
  variantTitle: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  attributes: Record<string, unknown> | null;
  thumbnailUrl: string | null;
  isReviewable: boolean;
}

export interface CustomerOrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  canCancel: boolean;
  cancelledAt: string | null;
  cancellationReason: string | null;
  merchandiseSubtotal: number;
  discountAmount: number;
  shippingFee: number;
  totalPayable: number;
  shippingAddress: OrderShippingAddress;
  coupon: {
    code: string;
    discountType: string;
    discountValue: number;
    discountAmount: number;
  } | null;
  items: CustomerOrderDetailItem[];
  payments: Array<{
    id: string;
    transactionId: string;
    method: PaymentMethod;
    status: PaymentStatus;
    amount: number;
    createdAt: string;
  }>;
  statusHistory: Array<{
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    reason: string | null;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerOrderDetailResponse {
  order: CustomerOrderDetail;
}

export interface CancelOrderInput {
  reason?: string;
}

export interface AdminOrderQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  sortBy?: 'newest' | 'oldest' | 'totalAsc' | 'totalDesc';
}

export interface AdminOrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  totalPayable: number;
  itemCount: number;
  customer: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
  };
  shippingAddress: {
    recipientName: string;
    phone: string;
    districtId: string;
    streetAddress: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AdminOrderListResponse {
  orders: AdminOrderSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  statusCounts: {
    all: number;
    pending: number;
    confirmed: number;
    processing: number;
    shipped: number;
    delivered: number;
    cancelled: number;
  };
}

export interface AdminOrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  cancelledAt: string | null;
  cancellationReason: string | null;
  merchandiseSubtotal: number;
  discountAmount: number;
  shippingFee: number;
  totalPayable: number;
  customer: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    role: string;
    createdAt: string;
  };
  shippingAddress: OrderShippingAddress;
  coupon: {
    code: string;
    discountType: string;
    discountValue: number;
    discountAmount: number;
  } | null;
  items: CustomerOrderDetailItem[];
  payments: Array<{
    id: string;
    transactionId: string;
    gatewayTransactionId: string | null;
    method: PaymentMethod;
    status: PaymentStatus;
    amount: number;
    currency: string;
    paidAt: string | null;
    failedAt: string | null;
    cancelledAt: string | null;
    createdAt: string;
  }>;
  statusHistory: Array<{
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    reason: string | null;
    changedByUserId: string | null;
    changedByName: string;
    changedByRole: string | null;
    createdAt: string;
  }>;
  allowedNextStatuses: OrderStatus[];
  canCancel: boolean;
  canMarkCodPaid: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOrderDetailResponse {
  order: AdminOrderDetail;
}

export interface UpdateOrderStatusInput {
  status: OrderStatus;
  reason: string;
}

export interface CancelAdminOrderInput {
  reason: string;
}

export interface MarkCodPaidInput {
  note?: string;
}

// ==========================================
// Phase 7: Customer Returns Types
// ==========================================

export type ReturnRequestStatus =
  'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'CANCELLED' | 'COMPLETED';

export type ReturnItemCondition = 'GOOD' | 'DAMAGED' | 'OPENED_UNUSABLE';

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

export interface CreateReturnItemInput {
  orderItemId: string;
  quantity: number;
  reason?: string;
}

export interface CreateReturnInput {
  customerReason: string;
  customerNotes?: string;
  items: CreateReturnItemInput[];
}

export interface CustomerReturnSummary {
  id: string;
  returnNumber: string;
  orderNumber: string;
  status: ReturnRequestStatus;
  itemCount: number;
  estimatedRefundAmount: number;
  actualRefundAmount: number | null;
  createdAt: string;
}

export interface CustomerReturnListResponse {
  returns: CustomerReturnSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
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
  createdAt: string;
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
  createdAt: string;
  updatedAt: string;
  items: CustomerReturnItemDetail[];
  statusHistory: CustomerReturnStatusHistoryItem[];
}

export interface CustomerReturnDetailResponse {
  return: CustomerReturnDetail;
}

// -------------------------------------------------------------
// Admin Return Management Types (Phase 7C)
// -------------------------------------------------------------

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
  createdAt: string;
  updatedAt: string;
}

export interface AdminReturnListResponse {
  returns: AdminReturnSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
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
  inspectedAt: string | null;
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
  createdAt: string;
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
  createdAt: string;
  updatedAt: string;
  orderSummary: {
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
    totalPayable: number;
    merchandiseSubtotal: number;
    deliveredAt: string | null;
  };
  items: AdminReturnItemDetail[];
  statusHistory: AdminReturnStatusHistoryItem[];
  refunds: AdminReturnRefund[];
}

export interface AdminReturnDetailResponse {
  return: AdminReturnDetail;
}

export interface AdminReturnListQuery {
  page?: number;
  limit?: number;
  status?: string;
  orderNumber?: string;
  returnNumber?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: 'createdAt:desc' | 'createdAt:asc';
}

export interface AdminApproveReturnInput {
  notes?: string;
}

export interface AdminRejectReturnInput {
  reason: string;
  notes?: string;
}

export interface AdminInspectReturnItemInput {
  returnItemId: string;
  condition: ReturnItemCondition;
  inspectedQuantity?: number;
  notes?: string;
}

export interface AdminInspectReturnInput {
  items: AdminInspectReturnItemInput[];
  notes?: string;
}

// -------------------------------------------------------------
// Admin Refund Management Types (Phase 7D)
// -------------------------------------------------------------

export type RefundStatus = 'PENDING' | 'COMPLETED' | 'FAILED';
export type PayoutChannel = 'CASH' | 'BKASH' | 'NAGAD' | 'BANK_TRANSFER';

export interface AdminReturnRefund {
  id: string;
  refundNumber: string;
  paymentId: string;
  amount: number;
  merchandiseAmount: number;
  shippingAmount: number;
  currency: string;
  method: string;
  status: RefundStatus;
  gatewayReference: string | null;
  payoutChannel: string | null;
  payoutReference: string | null;
  failureReason: string | null;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AdminRefundPreview {
  returnNumber: string;
  orderNumber: string;
  currency: string;
  merchandiseAmount: number;
  maxOrderRefundCapacity: number;
  maxMerchandiseRefundCapacity: number;
  targetPayment: {
    id: string;
    method: PaymentMethod;
    gateway: string | null;
    gatewayTransactionId: string | null;
    capturedAmount: number;
    totalRefunded: number;
    remainingCapacity: number;
  };
  eligiblePayments: Array<{
    id: string;
    method: PaymentMethod;
    amount: number;
    totalRefunded: number;
    remainingCapacity: number;
  }>;
  hasPendingRefund: boolean;
  pendingRefund?: {
    id: string;
    refundNumber: string;
    amount: number;
    status: RefundStatus;
    createdAt: string;
  } | null;
}

export interface AdminRefundPreviewResponse {
  preview: AdminRefundPreview;
}

export interface AdminProcessRefundInput {
  shippingAmount?: number;
  shippingRefundReason?: string;
  paymentId?: string;
  payoutChannel?: PayoutChannel;
  payoutReference?: string;
  notes?: string;
}

export interface AdminProcessRefundResponse {
  refund: AdminReturnRefund;
  return: AdminReturnDetail;
}

export interface AdminReconcileRefundResponse {
  refund: AdminReturnRefund;
  return: AdminReturnDetail;
}
