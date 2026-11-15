export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

export interface EmailTransport {
  send(options: SendEmailOptions): Promise<void>;
}

export interface VerificationEmailData {
  to: string;
  name: string;
  token: string;
  locale?: 'en' | 'bn';
}

export interface PasswordResetEmailData {
  to: string;
  name: string;
  token: string;
  locale?: 'en' | 'bn';
}

export interface OrderItemEmailSnapshot {
  productName: string;
  variantTitle: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderConfirmedEmailData {
  to: string;
  customerName: string;
  orderNumber: string;
  orderId: string;
  orderDate: Date;
  paymentMethod: 'COD' | 'SSLCOMMERZ' | string;
  paymentStatus:
    'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | string;
  shippingRecipientName: string;
  shippingPhone: string;
  shippingAddress: string;
  items: OrderItemEmailSnapshot[];
  merchandiseSubtotal: number;
  discountAmount: number;
  shippingFee: number;
  totalPayable: number;
  isInsideDhaka: boolean;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  locale?: 'en' | 'bn';
  storeName?: string;
  supportEmail?: string;
  supportPhone?: string;
}

export interface OrderStatusEmailData {
  to: string;
  customerName: string;
  orderNumber: string;
  orderId: string;
  status: 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  reason?: string | null;
  items: OrderItemEmailSnapshot[];
  totalPayable: number;
  locale?: 'en' | 'bn';
  storeName?: string;
  supportEmail?: string;
  supportPhone?: string;
}

export interface ReturnStatusEmailData {
  to: string;
  customerName: string;
  returnNumber: string;
  orderNumber: string;
  returnId: string;
  orderId: string;
  status: 'APPROVED' | 'REJECTED';
  reason?: string | null;
  items: Array<{
    productName: string;
    variantTitle: string;
    quantity: number;
  }>;
  locale?: 'en' | 'bn';
  storeName?: string;
  supportEmail?: string;
  supportPhone?: string;
}

export interface RefundProcessedEmailData {
  to: string;
  customerName: string;
  refundNumber: string;
  returnNumber: string;
  orderNumber: string;
  orderId: string;
  refundId: string;
  amount: number;
  merchandiseAmount: number;
  shippingAmount: number;
  method: 'SSLCOMMERZ' | 'MANUAL_CASH';
  processedDate: Date;
  locale?: 'en' | 'bn';
  storeName?: string;
  supportEmail?: string;
  supportPhone?: string;
}
