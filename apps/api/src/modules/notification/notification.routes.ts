import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { Role } from '../../generated/client/client.js';
import { notificationController } from './notification.controller.js';

// -------------------------------------------------------------
// Customer Notifications Router
// -------------------------------------------------------------

export const customerNotificationRouter = Router();

// All customer routes require authentication
customerNotificationRouter.use(authenticate);

customerNotificationRouter.get('/', (req, res, next) => {
  notificationController.listUserNotifications(req, res).catch(next);
});

customerNotificationRouter.get('/unread-count', (req, res, next) => {
  notificationController.getUnreadCount(req, res).catch(next);
});

customerNotificationRouter.patch('/:id/read', csrfProtection, (req, res, next) => {
  notificationController.markAsRead(req, res).catch(next);
});

customerNotificationRouter.post('/read-all', csrfProtection, (req, res, next) => {
  notificationController.markAllAsRead(req, res).catch(next);
});

customerNotificationRouter.delete('/:id', csrfProtection, (req, res, next) => {
  notificationController.deleteNotification(req, res).catch(next);
});

// -------------------------------------------------------------
// Admin Delivery Logs & Outbox Router
// -------------------------------------------------------------

export const adminNotificationRouter = Router();

// All admin notification monitoring routes require active ADMIN authentication
adminNotificationRouter.use(authenticate, requireRole(Role.ADMIN));

adminNotificationRouter.get('/delivery-logs', (req, res, next) => {
  notificationController.listAdminDeliveryLogs(req, res).catch(next);
});

adminNotificationRouter.post('/delivery-logs/:id/retry', csrfProtection, (req, res, next) => {
  notificationController.retryDelivery(req, res).catch(next);
});
