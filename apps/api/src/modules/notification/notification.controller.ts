import type { Request, Response } from 'express';
import { notificationService } from './notification.service.js';
import { notificationQuerySchema, adminDeliveryLogQuerySchema } from './notification.schemas.js';

export class NotificationController {
  /**
   * Customer: Get paginated notifications
   */
  async listUserNotifications(req: Request, res: Response): Promise<void> {
    const query = notificationQuerySchema.parse(req.query);
    const data = await notificationService.listUserNotifications(req.user!.id, query);
    res.status(200).json({ success: true, data });
  }

  /**
   * Customer: Get unread count
   */
  async getUnreadCount(req: Request, res: Response): Promise<void> {
    const data = await notificationService.getUnreadCount(req.user!.id);
    res.status(200).json({ success: true, data });
  }

  /**
   * Customer: Mark single notification as read
   */
  async markAsRead(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const data = await notificationService.markAsRead(req.user!.id, id);
    res.status(200).json({ success: true, data });
  }

  /**
   * Customer: Mark all notifications as read
   */
  async markAllAsRead(req: Request, res: Response): Promise<void> {
    const data = await notificationService.markAllAsRead(req.user!.id);
    res.status(200).json({ success: true, data });
  }

  /**
   * Customer: Delete notification
   */
  async deleteNotification(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    await notificationService.deleteNotification(req.user!.id, id);
    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully',
    });
  }

  /**
   * Admin: List delivery outbox logs
   */
  async listAdminDeliveryLogs(req: Request, res: Response): Promise<void> {
    const query = adminDeliveryLogQuerySchema.parse(req.query);
    const data = await notificationService.listAdminDeliveryLogs(query);
    res.status(200).json({ success: true, data });
  }

  /**
   * Admin: Manually trigger retry for failed/dead-letter delivery
   */
  async retryDelivery(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const data = await notificationService.retryDelivery(id, req.user!.id);
    res.status(200).json({
      success: true,
      data,
      message: 'Notification delivery re-queued successfully',
    });
  }
}

export const notificationController = new NotificationController();
