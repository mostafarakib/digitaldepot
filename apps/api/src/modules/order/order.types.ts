import type {
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  CouponDiscountType,
  Prisma,
} from '../../generated/client/client.js';

export type { OrderStatus, PaymentStatus, PaymentMethod, CouponDiscountType };

export type OrderWithDetails = Prisma.OrderGetPayload<{
  include: {
    items: true;
    payments: true;
    statusHistory: true;
  };
}>;

export interface ShippingAddressSnapshot {
  recipientName: string;
  phone: string;
  alternativePhone: string | null;
  divisionId: string;
  districtId: string;
  upazila: string;
  streetAddress: string;
  deliveryNotes: string | null;
}

export interface OrderItemSnapshot {
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

export interface CouponSnapshot {
  couponId: string;
  couponCode: string;
  couponDiscountType: CouponDiscountType;
  couponDiscountValue: number;
  couponDiscountAmount: number;
}

export interface FinancialSnapshot {
  merchandiseSubtotal: number;
  discountAmount: number;
  shippingFee: number;
  totalPayable: number;
}

export interface CreateOrderCoreInput {
  userId: string;
  addressId?: string;
  alternativePhone?: string;
  deliveryNotes?: string;
  acknowledgedLivePrices?: boolean;
  paymentMethod: PaymentMethod;
  adminUserId?: string; // If placed/assisted by admin
}

export interface OrderStockItem {
  variantId: string;
  quantity: number;
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

export interface CustomerOrderDetailItem extends OrderItemSnapshot {
  id: string;
  productSlug?: string | null;
  isReviewable: boolean;
}

export interface CustomerOrderDetailResponse {
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
  shippingAddress: ShippingAddressSnapshot;
  coupon: {
    code: string;
    discountType: CouponDiscountType;
    discountValue: number;
    discountAmount: number;
  } | null;
  items: CustomerOrderDetailItem[];
  payments: {
    id: string;
    transactionId: string;
    method: PaymentMethod;
    status: PaymentStatus;
    amount: number;
    createdAt: string;
  }[];
  statusHistory: {
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    reason: string | null;
    createdAt: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminOrderCustomer {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: string;
  createdAt: string;
}

export interface AdminOrderSummaryItem {
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
  orders: AdminOrderSummaryItem[];
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

export interface AdminOrderPaymentItem {
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
}

export interface AdminOrderStatusHistoryItem {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  reason: string | null;
  changedByUserId: string | null;
  changedByName: string;
  changedByRole: string | null;
  createdAt: string;
}

export interface AdminOrderDetailResponse {
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
  customer: AdminOrderCustomer;
  shippingAddress: ShippingAddressSnapshot;
  coupon: {
    code: string;
    discountType: CouponDiscountType;
    discountValue: number;
    discountAmount: number;
  } | null;
  items: CustomerOrderDetailItem[];
  payments: AdminOrderPaymentItem[];
  statusHistory: AdminOrderStatusHistoryItem[];
  allowedNextStatuses: OrderStatus[];
  canCancel: boolean;
  canMarkCodPaid: boolean;
  createdAt: string;
  updatedAt: string;
}
