import { z } from 'zod';
import {
  NotificationType,
  NotificationChannel,
  DeliveryStatus,
} from '../../generated/client/client.js';

export { NotificationType, NotificationChannel, DeliveryStatus };

// -------------------------------------------------------------
// Customer Notification Schemas
// -------------------------------------------------------------

export const notificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z
    .preprocess((val) => {
      if (typeof val === 'string') return val === 'true';
      return Boolean(val);
    }, z.boolean())
    .optional(),
});

export type NotificationQueryInput = z.infer<typeof notificationQuerySchema>;

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

// -------------------------------------------------------------
// Internal Notification & Delivery Creation Types
// -------------------------------------------------------------

export interface CreateInAppNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface QueueEmailDeliveryInput {
  recipient: string;
  userId?: string | null;
  eventType: NotificationType;
  subject: string;
  idempotencyKey?: string | null;
  payload: {
    to: string;
    subject: string;
    html: string;
    text: string;
    metadata?: Record<string, unknown>;
  };
}

export interface NotifyUserInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
  email?: {
    to: string;
    subject: string;
    html: string;
    text: string;
  } | null;
}

export interface NotifyAdminsInput {
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
  sendEmail?: boolean;
  emailSubject?: string;
  emailHtml?: string;
  emailText?: string;
}

// -------------------------------------------------------------
// Admin Delivery Log Schemas
// -------------------------------------------------------------

export const adminDeliveryLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(DeliveryStatus).optional(),
  channel: z.nativeEnum(NotificationChannel).optional(),
  search: z.string().trim().optional(),
});

export type AdminDeliveryLogQueryInput = z.infer<typeof adminDeliveryLogQuerySchema>;

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
