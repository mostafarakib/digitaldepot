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
