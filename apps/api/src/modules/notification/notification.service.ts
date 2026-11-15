import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../lib/errors.js';
import type { Prisma } from '../../generated/client/client.js';
import { settingsService } from '../settings/settings.service.js';
import { shippingService } from '../cart/shipping.service.js';
import {
  renderOrderConfirmedEmail,
  renderOrderStatusEmail,
  renderReturnStatusEmail,
  renderRefundProcessedEmail,
} from '../email/email.service.js';
import type {
  OrderConfirmedEmailData,
  OrderStatusEmailData,
  ReturnStatusEmailData,
  RefundProcessedEmailData,
} from '../email/email.types.js';
import type {
  NotificationQueryInput,
  NotificationListResponse,
  NotificationUnreadCountResponse,
  CreateInAppNotificationInput,
  QueueEmailDeliveryInput,
  NotifyUserInput,
  NotifyAdminsInput,
  AdminDeliveryLogQueryInput,
  AdminDeliveryLogListResponse,
  AdminDeliveryLogItem,
  NotificationItem,
  NotificationChannel,
  NotificationType,
  DeliveryStatus,
} from './notification.schemas.js';

export class NotificationService {
  /**
   * Creates an in-app notification for a specific user.
   * Can be executed within an existing Prisma transaction client for atomicity.
   */
  async createInAppNotification(data: CreateInAppNotificationInput, tx?: Prisma.TransactionClient) {
    const db = tx ?? prisma;

    const notification = await db.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        link: data.link ?? null,
        metadata: data.metadata ? (data.metadata as Prisma.InputJsonValue) : undefined,
      },
    });

    logger.debug(
      { notificationId: notification.id, userId: data.userId, type: data.type },
      'In-app notification created',
    );

    return notification;
  }

  /**
   * Queues an email delivery record in the persistent outbox table.
   * Can be executed within an existing Prisma transaction client.
   * Review Clarification 4: Race-safe idempotency via PostgreSQL ON CONFLICT DO NOTHING.
   */
  async queueEmailDelivery(data: QueueEmailDeliveryInput, tx?: Prisma.TransactionClient) {
    const db = tx ?? prisma;

    if (data.idempotencyKey) {
      const newId = `del_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const payloadJson = JSON.stringify(data.payload);

      await db.$executeRaw`
        INSERT INTO "NotificationDelivery" (
          "id", "channel", "recipient", "userId", "eventType", "subject",
          "payload", "status", "attempts", "maxAttempts", "nextAttemptAt",
          "idempotencyKey", "createdAt", "updatedAt"
        )
        VALUES (
          ${newId},
          'EMAIL'::"NotificationChannel",
          ${data.recipient},
          ${data.userId ?? null},
          ${data.eventType}::"NotificationType",
          ${data.subject ?? null},
          ${payloadJson}::jsonb,
          'PENDING'::"DeliveryStatus",
          0,
          3,
          NOW(),
          ${data.idempotencyKey},
          NOW(),
          NOW()
        )
        ON CONFLICT ("idempotencyKey") DO NOTHING
      `;

      const delivery = await db.notificationDelivery.findUniqueOrThrow({
        where: { idempotencyKey: data.idempotencyKey },
      });

      logger.debug(
        { deliveryId: delivery.id, recipient: data.recipient, idempotencyKey: data.idempotencyKey },
        'Email delivery queued in outbox with race-safe idempotency',
      );

      return delivery;
    }

    const delivery = await db.notificationDelivery.create({
      data: {
        channel: 'EMAIL',
        recipient: data.recipient,
        userId: data.userId ?? null,
        eventType: data.eventType,
        subject: data.subject,
        payload: data.payload as Prisma.InputJsonValue,
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: new Date(),
        idempotencyKey: null,
      },
    });

    logger.debug(
      { deliveryId: delivery.id, recipient: data.recipient, eventType: data.eventType },
      'Email delivery queued in outbox',
    );

    return delivery;
  }

  /**
   * Convenience helper to create an in-app notification and optionally queue an email delivery.
   * Supports transactional execution.
   */
  async notifyUser(data: NotifyUserInput, tx?: Prisma.TransactionClient) {
    const db = tx ?? prisma;

    const notification = await this.createInAppNotification(
      {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        link: data.link,
        metadata: data.metadata,
      },
      db,
    );

    let delivery;
    if (data.email) {
      delivery = await this.queueEmailDelivery(
        {
          recipient: data.email.to,
          userId: data.userId,
          eventType: data.type,
          subject: data.email.subject,
          payload: {
            to: data.email.to,
            subject: data.email.subject,
            html: data.email.html,
            text: data.email.text,
            metadata: data.metadata ?? undefined,
          },
        },
        db,
      );
    }

    return { notification, delivery };
  }

  /**
   * Explicitly resolves all active administrators and creates user-scoped notifications for each.
   */
  async notifyAdmins(data: NotifyAdminsInput, tx?: Prisma.TransactionClient) {
    const db = tx ?? prisma;

    const activeAdmins = await db.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true, email: true },
    });

    if (activeAdmins.length === 0) {
      logger.warn({ type: data.type }, 'No active administrators found to notify');
      return [];
    }

    const results = await Promise.all(
      activeAdmins.map(async (admin) => {
        const notification = await this.createInAppNotification(
          {
            userId: admin.id,
            type: data.type,
            title: data.title,
            message: data.message,
            link: data.link,
            metadata: data.metadata,
          },
          db,
        );

        let delivery;
        if (data.sendEmail && data.emailSubject && data.emailHtml && data.emailText) {
          delivery = await this.queueEmailDelivery(
            {
              recipient: admin.email,
              userId: admin.id,
              eventType: data.type,
              subject: data.emailSubject,
              payload: {
                to: admin.email,
                subject: data.emailSubject,
                html: data.emailHtml,
                text: data.emailText,
                metadata: data.metadata ?? undefined,
              },
            },
            db,
          );
        }

        return { adminId: admin.id, notification, delivery };
      }),
    );

    return results;
  }

  /**
   * Returns a paginated list of notifications for the authenticated user with total and unread count.
   * Strict user ownership is enforced.
   */
  async listUserNotifications(
    userId: string,
    query: NotificationQueryInput,
  ): Promise<NotificationListResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(50, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const [total, unreadCount, rows] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, readAt: null } }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const notifications: NotificationItem[] = rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      message: r.message,
      link: r.link,
      metadata: (r.metadata as Record<string, unknown>) ?? null,
      readAt: r.readAt ? r.readAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Returns the unread notification count for a user.
   */
  async getUnreadCount(userId: string): Promise<NotificationUnreadCountResponse> {
    const unreadCount = await prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { unreadCount };
  }

  /**
   * Marks a specific notification as read.
   * Enforces strict user ownership: returns 404/403 if it does not belong to the user.
   */
  async markAsRead(userId: string, notificationId: string): Promise<NotificationItem> {
    const existing = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!existing) {
      throw new NotFoundError('NOTIFICATION_NOT_FOUND', 'Notification not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenError(
        'FORBIDDEN_NOTIFICATION_ACCESS',
        'You are not authorized to modify this notification',
      );
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });

    return {
      id: updated.id,
      type: updated.type,
      title: updated.title,
      message: updated.message,
      link: updated.link,
      metadata: (updated.metadata as Record<string, unknown>) ?? null,
      readAt: updated.readAt ? updated.readAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * Marks all unread notifications of the user as read.
   */
  async markAllAsRead(userId: string): Promise<{ count: number }> {
    const result = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { count: result.count };
  }

  /**
   * Deletes a notification after verifying user ownership.
   */
  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    const existing = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!existing) {
      throw new NotFoundError('NOTIFICATION_NOT_FOUND', 'Notification not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenError(
        'FORBIDDEN_NOTIFICATION_ACCESS',
        'You are not authorized to delete this notification',
      );
    }

    await prisma.notification.delete({
      where: { id: notificationId },
    });
  }

  /**
   * Admin delivery outbox monitoring: lists paginated delivery attempts with status and error info.
   */
  async listAdminDeliveryLogs(
    query: AdminDeliveryLogQueryInput,
  ): Promise<AdminDeliveryLogListResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationDeliveryWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.channel) {
      where.channel = query.channel;
    }

    if (query.search) {
      where.OR = [
        { recipient: { contains: query.search, mode: 'insensitive' } },
        { subject: { contains: query.search, mode: 'insensitive' } },
        { lastError: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.notificationDelivery.count({ where }),
      prisma.notificationDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const logs: AdminDeliveryLogItem[] = rows.map((r) => this.mapDeliveryLogItem(r));

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Admin controlled retry: re-queues a FAILED or DEAD_LETTER delivery.
   * Requirement 7: Preserves attempt history, increments manualRetryCount, and records acting admin.
   */
  async retryDelivery(deliveryId: string, adminId: string): Promise<AdminDeliveryLogItem> {
    const existing = await prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
    });

    if (!existing) {
      throw new NotFoundError('DELIVERY_NOT_FOUND', 'Notification delivery record not found');
    }

    if (existing.status === 'PROCESSING') {
      throw new BadRequestError(
        'DELIVERY_IN_PROGRESS',
        'Cannot retry a delivery that is currently being processed by a worker',
      );
    }

    if (existing.status !== 'FAILED' && existing.status !== 'DEAD_LETTER') {
      throw new BadRequestError(
        'DELIVERY_NOT_RETRYABLE',
        `Cannot retry delivery with status '${existing.status}'. Only FAILED or DEAD_LETTER deliveries can be manually retried.`,
      );
    }

    const MAX_MANUAL_RETRIES = 3;
    if (existing.manualRetryCount >= MAX_MANUAL_RETRIES) {
      throw new BadRequestError(
        'MAX_MANUAL_RETRIES_EXCEEDED',
        `Maximum manual retry limit (${MAX_MANUAL_RETRIES}) reached for this delivery`,
      );
    }

    const updated = await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
        claimedAt: null,
        claimedBy: null,
        manualRetryCount: { increment: 1 },
        lastRetriedBy: adminId,
        lastRetriedAt: new Date(),
      },
    });

    logger.info(
      { deliveryId, adminId, manualRetryCount: updated.manualRetryCount },
      'Notification delivery manually re-queued by administrator',
    );

    return this.mapDeliveryLogItem(updated);
  }

  private mapDeliveryLogItem(row: {
    id: string;
    channel: string;
    recipient: string;
    userId: string | null;
    eventType: string;
    subject: string | null;
    status: string;
    attempts: number;
    maxAttempts: number;
    nextAttemptAt: Date;
    lastAttemptAt: Date | null;
    lastError: string | null;
    sentAt: Date | null;
    manualRetryCount: number;
    lastRetriedBy: string | null;
    lastRetriedAt: Date | null;
    idempotencyKey?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): AdminDeliveryLogItem {
    return {
      id: row.id,
      channel: row.channel as NotificationChannel,
      recipient: row.recipient,
      userId: row.userId,
      eventType: row.eventType as NotificationType,
      subject: row.subject,
      status: row.status as DeliveryStatus,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      nextAttemptAt: row.nextAttemptAt.toISOString(),
      lastAttemptAt: row.lastAttemptAt ? row.lastAttemptAt.toISOString() : null,
      lastError: row.lastError,
      sentAt: row.sentAt ? row.sentAt.toISOString() : null,
      manualRetryCount: row.manualRetryCount,
      lastRetriedBy: row.lastRetriedBy,
      lastRetriedAt: row.lastRetriedAt ? row.lastRetriedAt.toISOString() : null,
      idempotencyKey: row.idempotencyKey ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // -------------------------------------------------------------
  // Order Lifecycle Event Helpers (Phase 9B)
  // -------------------------------------------------------------

  /**
   * Dispatches Order Confirmed in-app notification & transactional email.
   * Review Clarification 2: Uses dynamic delivery windows from Store Settings.
   * Review Clarification 3: Captures selected customer locale at queueing time.
   * Review Clarification 4: Race-safe idempotency via PostgreSQL ON CONFLICT DO NOTHING.
   */
  async sendOrderConfirmedNotification(
    params: { orderId: string; locale?: 'en' | 'bn' },
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? prisma;
    const locale = params.locale || 'en';

    const order = await db.order.findUnique({
      where: { id: params.orderId },
      include: {
        items: true,
        user: { select: { id: true, email: true, profile: true } },
      },
    });

    if (!order || !order.user) {
      return;
    }

    const customerName = order.user.profile
      ? `${order.user.profile.firstName} ${order.user.profile.lastName}`.trim()
      : order.shippingRecipientName || 'Valued Customer';

    // Dynamic delivery windows from Store Settings
    const settings = await settingsService.getRawSettings(db);
    const isInsideDhaka = shippingService.isInsideDhaka(order.shippingDistrictId);
    const estimatedDaysMin = isInsideDhaka
      ? settings.estimatedDaysInsideDhakaMin
      : settings.estimatedDaysOutsideDhakaMin;
    const estimatedDaysMax = isInsideDhaka
      ? settings.estimatedDaysInsideDhakaMax
      : settings.estimatedDaysOutsideDhakaMax;

    // 1. In-app notification
    const existingInApp = await db.notification.findFirst({
      where: {
        userId: order.userId,
        type: 'ORDER_CONFIRMED',
        metadata: { path: ['orderId'], equals: order.id },
      },
    });

    if (!existingInApp) {
      const isCod = order.paymentMethod === 'COD';
      const titleEn = isCod ? 'Order Placed (Cash on Delivery)' : 'Order Paid & Confirmed';
      const titleBn = isCod
        ? 'অর্ডার সফলভাবে গৃহীত (ক্যাশ অন ডেলিভারি)'
        : 'অর্ডার নিশ্চিত ও পরিশোধিত';
      const messageEn = `Your order #${order.orderNumber} has been confirmed.`;
      const messageBn = `আপনার অর্ডার #${order.orderNumber} নিশ্চিত করা হয়েছে।`;

      await db.notification.create({
        data: {
          userId: order.userId,
          type: 'ORDER_CONFIRMED',
          title: locale === 'bn' ? titleBn : titleEn,
          message: locale === 'bn' ? messageBn : messageEn,
          link: `/account/orders/${order.id}`,
          metadata: { orderId: order.id, orderNumber: order.orderNumber },
        },
      });
    }

    // 2. Transactional Email with Idempotency Key
    const emailData: OrderConfirmedEmailData = {
      to: order.user.email,
      customerName,
      orderNumber: order.orderNumber,
      orderId: order.id,
      orderDate: order.createdAt,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      shippingRecipientName: order.shippingRecipientName,
      shippingPhone: order.shippingPhone,
      shippingAddress: `${order.shippingStreetAddress}, ${order.shippingUpazila}, ${order.shippingDistrictId}`,
      items: order.items.map((i) => ({
        productName: i.productName,
        variantTitle: i.variantTitle,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
      })),
      merchandiseSubtotal: order.merchandiseSubtotal,
      discountAmount: order.discountAmount,
      shippingFee: order.shippingFee,
      totalPayable: order.totalPayable,
      isInsideDhaka,
      estimatedDaysMin,
      estimatedDaysMax,
      locale,
      storeName: settings.storeName,
      supportEmail: settings.supportEmail,
      supportPhone: settings.supportPhone ?? undefined,
    };

    const rendered = renderOrderConfirmedEmail(emailData);

    await this.queueEmailDelivery(
      {
        recipient: order.user.email,
        userId: order.userId,
        eventType: 'ORDER_CONFIRMED',
        subject: rendered.subject,
        idempotencyKey: `email:order-confirmed:${order.id}`,
        payload: {
          to: order.user.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          metadata: { orderId: order.id, orderNumber: order.orderNumber, locale },
        },
      },
      db,
    );
  }

  /**
   * Dispatches Order Status in-app notification & transactional email.
   * Handles PROCESSING, SHIPPED, DELIVERED, and CANCELLED transitions.
   */
  async sendOrderStatusNotification(
    params: {
      orderId: string;
      status: 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
      reason?: string | null;
      locale?: 'en' | 'bn';
    },
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? prisma;
    const locale = params.locale || 'en';

    const order = await db.order.findUnique({
      where: { id: params.orderId },
      include: {
        items: true,
        user: { select: { id: true, email: true, profile: true } },
      },
    });

    if (!order || !order.user) {
      return;
    }

    const customerName = order.user.profile
      ? `${order.user.profile.firstName} ${order.user.profile.lastName}`.trim()
      : order.shippingRecipientName || 'Valued Customer';

    const settings = await settingsService.getRawSettings(db);

    // 1. In-app notification
    const alreadyHasStatusNotif = await db.notification.findFirst({
      where: {
        userId: order.userId,
        type: 'ORDER_STATUS_UPDATED',
        AND: [
          { metadata: { path: ['orderId'], equals: order.id } },
          { metadata: { path: ['status'], equals: params.status } },
        ],
      },
    });

    if (!alreadyHasStatusNotif) {
      const isBn = locale === 'bn';
      let title = `Order #${order.orderNumber} ${params.status}`;
      let message = `Your order #${order.orderNumber} status has updated to ${params.status}.`;
      if (isBn) {
        if (params.status === 'PROCESSING') {
          title = `অর্ডার #${order.orderNumber} প্রক্রিয়াকরণ চলছে`;
          message = `আপনার অর্ডার #${order.orderNumber} প্রস্তুত করা হচ্ছে।`;
        } else if (params.status === 'SHIPPED') {
          title = `অর্ডার #${order.orderNumber} ডেলিভারির জন্য প্রেরিত`;
          message = `আপনার পার্সেলটি কুরিয়ারে হস্তান্তর করা হয়েছে।`;
        } else if (params.status === 'DELIVERED') {
          title = `অর্ডার #${order.orderNumber} ডেলিভারি সম্পন্ন`;
          message = `আপনার অর্ডারটি সফলভাবে ডেলিভারি হয়েছে।`;
        } else if (params.status === 'CANCELLED') {
          title = `অর্ডার #${order.orderNumber} বাতিল করা হয়েছে`;
          message = `আপনার অর্ডারটি বাতিল করা হয়েছে।`;
        }
      }

      await db.notification.create({
        data: {
          userId: order.userId,
          type: 'ORDER_STATUS_UPDATED',
          title,
          message,
          link: `/account/orders/${order.id}`,
          metadata: { orderId: order.id, orderNumber: order.orderNumber, status: params.status },
        },
      });
    }

    // 2. Transactional Email with Idempotency Key
    const emailData: OrderStatusEmailData = {
      to: order.user.email,
      customerName,
      orderNumber: order.orderNumber,
      orderId: order.id,
      status: params.status,
      reason: params.reason,
      items: order.items.map((i) => ({
        productName: i.productName,
        variantTitle: i.variantTitle,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
      })),
      totalPayable: order.totalPayable,
      locale,
      storeName: settings.storeName,
      supportEmail: settings.supportEmail,
      supportPhone: settings.supportPhone ?? undefined,
    };

    const rendered = renderOrderStatusEmail(emailData);

    await this.queueEmailDelivery(
      {
        recipient: order.user.email,
        userId: order.userId,
        eventType: 'ORDER_STATUS_UPDATED',
        subject: rendered.subject,
        idempotencyKey: `email:order-status:${order.id}:${params.status}`,
        payload: {
          to: order.user.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: params.status,
            locale,
          },
        },
      },
      db,
    );
  }

  /**
   * Dispatches Return Request Status in-app notification & transactional email.
   * Review Clarification 7: Persists both in-app notification and email delivery in the same domain tx.
   */
  async sendReturnStatusNotification(
    params: {
      returnRequestId: string;
      status: 'APPROVED' | 'REJECTED';
      reason?: string | null;
      locale?: 'en' | 'bn';
    },
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? prisma;
    const locale = params.locale || 'en';

    const returnReq = await db.returnRequest.findUnique({
      where: { id: params.returnRequestId },
      include: {
        order: { select: { id: true, orderNumber: true } },
        items: {
          include: {
            orderItem: true,
          },
        },
        user: { select: { id: true, email: true, profile: true } },
      },
    });

    if (!returnReq || !returnReq.user) {
      return;
    }

    const customer = returnReq.user;
    const customerName = customer.profile
      ? `${customer.profile.firstName} ${customer.profile.lastName}`.trim()
      : 'Valued Customer';

    const settings = await settingsService.getRawSettings(db);

    // 1. In-app notification
    const isBn = locale === 'bn';
    const isApproved = params.status === 'APPROVED';
    const title = isApproved
      ? isBn
        ? `রিটার্ন আবেদন #${returnReq.returnNumber} অনুমোদিত`
        : `Return Request #${returnReq.returnNumber} Approved`
      : isBn
        ? `রিটার্ন আবেদন #${returnReq.returnNumber} প্রত্যাখ্যাত`
        : `Return Request #${returnReq.returnNumber} Rejected`;

    const message = isApproved
      ? isBn
        ? `আপনার রিটার্ন আবেদন #${returnReq.returnNumber} অনুমোদিত হয়েছে। অনুগ্রহ করে পণ্যটি প্রস্তুত রাখুন।`
        : `Your return request #${returnReq.returnNumber} has been approved. Please prepare items for return.`
      : isBn
        ? `আপনার রিটার্ন আবেদন #${returnReq.returnNumber} প্রত্যাখ্যাত হয়েছে।${
            params.reason ? ` কারণ: ${params.reason}` : ''
          }`
        : `Your return request #${returnReq.returnNumber} was rejected.${
            params.reason ? ` Reason: ${params.reason}` : ''
          }`;

    const alreadyHasNotif = await db.notification.findFirst({
      where: {
        userId: returnReq.userId,
        type: 'RETURN_REQUEST_UPDATED',
        AND: [
          { metadata: { path: ['returnRequestId'], equals: returnReq.id } },
          { metadata: { path: ['status'], equals: params.status } },
        ],
      },
    });

    if (!alreadyHasNotif) {
      await db.notification.create({
        data: {
          userId: returnReq.userId,
          type: 'RETURN_REQUEST_UPDATED',
          title,
          message,
          link: `/account/returns/${returnReq.id}`,
          metadata: {
            returnRequestId: returnReq.id,
            returnNumber: returnReq.returnNumber,
            status: params.status,
          },
        },
      });
    }

    // 2. Transactional Email with Idempotency Key
    const emailData: ReturnStatusEmailData = {
      to: customer.email,
      customerName,
      returnNumber: returnReq.returnNumber,
      orderNumber: returnReq.order.orderNumber,
      returnId: returnReq.id,
      orderId: returnReq.order.id,
      status: params.status,
      reason: params.reason,
      items: returnReq.items.map((i) => ({
        productName: i.orderItem.productName,
        variantTitle: i.orderItem.variantTitle,
        quantity: i.quantity,
      })),
      locale,
      storeName: settings.storeName,
      supportEmail: settings.supportEmail,
      supportPhone: settings.supportPhone ?? undefined,
    };

    const rendered = renderReturnStatusEmail(emailData);

    await this.queueEmailDelivery(
      {
        recipient: customer.email,
        userId: returnReq.userId,
        eventType: 'RETURN_REQUEST_UPDATED',
        subject: rendered.subject,
        idempotencyKey: `email:return-status:${returnReq.id}:${params.status}`,
        payload: {
          to: customer.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          metadata: {
            returnRequestId: returnReq.id,
            returnNumber: returnReq.returnNumber,
            status: params.status,
            locale,
          },
        },
      },
      db,
    );
  }

  /**
   * Dispatches Refund Processed in-app notification & transactional email.
   * Review Clarification 6: Does not promise fixed settlement timelines unless guaranteed.
   * Review Clarification 7: Persists both in-app notification and email delivery in the same domain tx.
   */
  async sendRefundProcessedNotification(
    params: {
      refundId: string;
      locale?: 'en' | 'bn';
    },
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? prisma;
    const locale = params.locale || 'en';

    const refund = await db.refund.findUnique({
      where: { id: params.refundId },
      include: {
        returnRequest: {
          include: {
            order: { select: { id: true, orderNumber: true, userId: true } },
            user: { select: { id: true, email: true, profile: true } },
          },
        },
      },
    });

    if (!refund || !refund.returnRequest.user) {
      return;
    }

    const customer = refund.returnRequest.user;
    const customerName = customer.profile
      ? `${customer.profile.firstName} ${customer.profile.lastName}`.trim()
      : 'Valued Customer';

    const settings = await settingsService.getRawSettings(db);

    // 1. In-app notification
    const isBn = locale === 'bn';
    const title = isBn
      ? `রিফান্ড সম্পন্ন #${refund.refundNumber}`
      : `Refund Processed #${refund.refundNumber}`;
    const message = isBn
      ? `আপনার রিটার্ন #${refund.returnRequest.returnNumber} এর জন্য রিফান্ড সম্পন্ন হয়েছে।`
      : `Refund has been processed for return #${refund.returnRequest.returnNumber}.`;

    const alreadyHasNotif = await db.notification.findFirst({
      where: {
        userId: customer.id,
        type: 'REFUND_PROCESSED',
        metadata: { path: ['refundId'], equals: refund.id },
      },
    });

    if (!alreadyHasNotif) {
      await db.notification.create({
        data: {
          userId: customer.id,
          type: 'REFUND_PROCESSED',
          title,
          message,
          link: `/account/orders/${refund.returnRequest.order.id}`,
          metadata: {
            refundId: refund.id,
            refundNumber: refund.refundNumber,
            amount: refund.amount,
          },
        },
      });
    }

    // 2. Transactional Email with Idempotency Key
    const emailData: RefundProcessedEmailData = {
      to: customer.email,
      customerName,
      refundNumber: refund.refundNumber,
      returnNumber: refund.returnRequest.returnNumber,
      orderNumber: refund.returnRequest.order.orderNumber,
      orderId: refund.returnRequest.order.id,
      refundId: refund.id,
      amount: refund.amount,
      merchandiseAmount: refund.merchandiseAmount,
      shippingAmount: refund.shippingAmount,
      method: refund.method === 'SSLCOMMERZ' ? 'SSLCOMMERZ' : 'MANUAL_CASH',
      processedDate: refund.processedAt || refund.createdAt,
      locale,
      storeName: settings.storeName,
      supportEmail: settings.supportEmail,
      supportPhone: settings.supportPhone ?? undefined,
    };

    const rendered = renderRefundProcessedEmail(emailData);

    await this.queueEmailDelivery(
      {
        recipient: customer.email,
        userId: customer.id,
        eventType: 'REFUND_PROCESSED',
        subject: rendered.subject,
        idempotencyKey: `email:refund-processed:${refund.id}`,
        payload: {
          to: customer.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          metadata: {
            refundId: refund.id,
            refundNumber: refund.refundNumber,
            amount: refund.amount,
            locale,
          },
        },
      },
      db,
    );
  }
}

export const notificationService = new NotificationService();
