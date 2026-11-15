export type NotificationType =
  | 'ORDER_CONFIRMED'
  | 'ORDER_STATUS_UPDATED'
  | 'RETURN_REQUEST_UPDATED'
  | 'REFUND_PROCESSED'
  | 'LOW_STOCK_ALERT'
  | 'SYSTEM_ALERT';

export type NotificationChannel = 'IN_APP' | 'EMAIL';

export type DeliveryStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'DEAD_LETTER';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  notifications: NotificationItem[];
  unreadCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface NotificationUnreadCountResponse {
  unreadCount: number;
}

export interface AdminDeliveryLogItem {
  id: string;
  channel: NotificationChannel;
  recipient: string;
  userId: string | null;
  eventType: NotificationType;
  subject: string | null;
  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastAttemptAt: string | null;
  lastError: string | null;
  sentAt: string | null;
  manualRetryCount: number;
  lastRetriedBy: string | null;
  lastRetriedAt: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDeliveryLogListResponse {
  logs: AdminDeliveryLogItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminRetryDeliveryResponse {
  message: string;
  delivery: AdminDeliveryLogItem;
}
