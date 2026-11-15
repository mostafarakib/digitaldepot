import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { hashPassword, signAccessToken } from '../../../lib/crypto.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { env } from '../../../config/env.js';
import { notificationService } from '../notification.service.js';

describe('Phase 9A: In-App Notifications & Delivery Tracking API', () => {
  let customerId: string;
  let otherCustomerId: string;
  let adminId: string;
  let customerCookie: string;
  let otherCustomerCookie: string;
  let adminCookie: string;
  let csrfToken: string;
  let csrfCookie: string;

  beforeEach(async () => {
    await prisma.notificationDelivery.deleteMany();
    await prisma.notification.deleteMany();

    csrfToken = generateCsrfToken();
    csrfCookie = `${COOKIE_NAMES.CSRF_TOKEN}=${csrfToken}`;

    const timestamp = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const passwordHash = await hashPassword('SecurePass123!');

    // 1. Create Customer 1
    const customer1 = await prisma.user.create({
      data: {
        email: `c1-${timestamp}@digitaldepot.local`,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
        profile: {
          create: {
            firstName: 'Customer',
            lastName: 'One',
          },
        },
      },
    });
    customerId = customer1.id;

    const s1 = await prisma.session.create({
      data: {
        userId: customer1.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    const token1 = await signAccessToken({ sub: customer1.id, sid: s1.id });
    customerCookie = `${COOKIE_NAMES.ACCESS_TOKEN}=${token1}; ${csrfCookie}`;

    // 2. Create Customer 2
    const customer2 = await prisma.user.create({
      data: {
        email: `c2-${timestamp}@digitaldepot.local`,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
        profile: {
          create: {
            firstName: 'Customer',
            lastName: 'Two',
          },
        },
      },
    });
    otherCustomerId = customer2.id;

    const s2 = await prisma.session.create({
      data: {
        userId: customer2.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    const token2 = await signAccessToken({ sub: customer2.id, sid: s2.id });
    otherCustomerCookie = `${COOKIE_NAMES.ACCESS_TOKEN}=${token2}; ${csrfCookie}`;

    // 3. Create Admin
    const admin = await prisma.user.create({
      data: {
        email: `admin-${timestamp}@digitaldepot.local`,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        profile: {
          create: {
            firstName: 'Admin',
            lastName: 'Supervisor',
          },
        },
      },
    });
    adminId = admin.id;

    const sAdmin = await prisma.session.create({
      data: {
        userId: admin.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    const tokenAdmin = await signAccessToken({ sub: admin.id, sid: sAdmin.id });
    adminCookie = `${COOKIE_NAMES.ACCESS_TOKEN}=${tokenAdmin}; ${csrfCookie}`;
  });

  describe('Customer Notifications API', () => {
    it('requires authentication for notification endpoints', async () => {
      const res = await request(app).get('/api/v1/notifications');
      expect(res.status).toBe(401);
    });

    it('returns empty notification list and unreadCount = 0 initially', async () => {
      const res = await request(app).get('/api/v1/notifications').set('Cookie', customerCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications).toEqual([]);
      expect(res.body.data.unreadCount).toBe(0);
      expect(res.body.data.pagination.total).toBe(0);
    });

    it('returns only notifications belonging to the authenticated user (strict isolation)', async () => {
      // Create 2 notifications for Customer 1
      await notificationService.createInAppNotification({
        userId: customerId,
        type: 'ORDER_CONFIRMED',
        title: 'Order Confirmed',
        message: 'Your order has been confirmed',
      });
      await notificationService.createInAppNotification({
        userId: customerId,
        type: 'ORDER_STATUS_UPDATED',
        title: 'Order Shipped',
        message: 'Your order is on the way',
      });

      // Create 1 notification for Customer 2
      await notificationService.createInAppNotification({
        userId: otherCustomerId,
        type: 'ORDER_CONFIRMED',
        title: 'Customer 2 Order',
        message: 'Order for user 2',
      });

      // Customer 1 inspects notifications
      const res1 = await request(app).get('/api/v1/notifications').set('Cookie', customerCookie);

      expect(res1.status).toBe(200);
      expect(res1.body.data.notifications).toHaveLength(2);
      expect(res1.body.data.unreadCount).toBe(2);
      expect(res1.body.data.notifications[0].title).toBe('Order Shipped');

      // Customer 2 inspects notifications
      const res2 = await request(app)
        .get('/api/v1/notifications')
        .set('Cookie', otherCustomerCookie);

      expect(res2.status).toBe(200);
      expect(res2.body.data.notifications).toHaveLength(1);
      expect(res2.body.data.unreadCount).toBe(1);
      expect(res2.body.data.notifications[0].title).toBe('Customer 2 Order');
    });

    it('returns unread count via /unread-count endpoint', async () => {
      await notificationService.createInAppNotification({
        userId: customerId,
        type: 'SYSTEM_ALERT',
        title: 'Welcome',
        message: 'Welcome to DigitalDepot!',
      });

      const res = await request(app)
        .get('/api/v1/notifications/unread-count')
        .set('Cookie', customerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.unreadCount).toBe(1);
    });

    it('marks a notification as read and prevents unauthorized user from marking it', async () => {
      const notif1 = await notificationService.createInAppNotification({
        userId: customerId,
        type: 'ORDER_CONFIRMED',
        title: 'Test Order',
        message: 'Placed',
      });

      // Customer 2 attempts to mark Customer 1's notification as read
      const failRes = await request(app)
        .patch(`/api/v1/notifications/${notif1.id}/read`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', otherCustomerCookie)
        .set('x-csrf-token', csrfToken);

      expect(failRes.status).toBe(403);

      // Customer 1 marks their own notification as read
      const successRes = await request(app)
        .patch(`/api/v1/notifications/${notif1.id}/read`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', customerCookie)
        .set('x-csrf-token', csrfToken);

      expect(successRes.status).toBe(200);
      expect(successRes.body.data.readAt).not.toBeNull();

      // Check unread count is now 0
      const countRes = await request(app)
        .get('/api/v1/notifications/unread-count')
        .set('Cookie', customerCookie);
      expect(countRes.body.data.unreadCount).toBe(0);
    });

    it('marks all notifications as read for current user', async () => {
      await notificationService.createInAppNotification({
        userId: customerId,
        type: 'ORDER_CONFIRMED',
        title: 'Order 1',
        message: 'Placed 1',
      });
      await notificationService.createInAppNotification({
        userId: customerId,
        type: 'ORDER_CONFIRMED',
        title: 'Order 2',
        message: 'Placed 2',
      });
      await notificationService.createInAppNotification({
        userId: otherCustomerId,
        type: 'ORDER_CONFIRMED',
        title: 'Other User Order',
        message: 'Placed other',
      });

      const res = await request(app)
        .post('/api/v1/notifications/read-all')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', customerCookie)
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(2);

      // Verify customer 1 has 0 unread
      const c1Count = await request(app)
        .get('/api/v1/notifications/unread-count')
        .set('Cookie', customerCookie);
      expect(c1Count.body.data.unreadCount).toBe(0);

      // Verify other user still has 1 unread
      const c2Count = await request(app)
        .get('/api/v1/notifications/unread-count')
        .set('Cookie', otherCustomerCookie);
      expect(c2Count.body.data.unreadCount).toBe(1);
    });

    it('deletes notification with ownership verification', async () => {
      const notif = await notificationService.createInAppNotification({
        userId: customerId,
        type: 'SYSTEM_ALERT',
        title: 'To Delete',
        message: 'Delete me',
      });

      // Other user tries to delete
      const failRes = await request(app)
        .delete(`/api/v1/notifications/${notif.id}`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', otherCustomerCookie)
        .set('x-csrf-token', csrfToken);
      expect(failRes.status).toBe(403);

      // Owner deletes
      const okRes = await request(app)
        .delete(`/api/v1/notifications/${notif.id}`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', customerCookie)
        .set('x-csrf-token', csrfToken);
      expect(okRes.status).toBe(200);

      // Verify it's gone
      const listRes = await request(app).get('/api/v1/notifications').set('Cookie', customerCookie);
      expect(listRes.body.data.notifications).toHaveLength(0);
    });
  });

  describe('Admin Delivery Logs & Controlled Retry API', () => {
    it('forbids customers from accessing admin delivery logs', async () => {
      const res = await request(app)
        .get('/api/v1/admin/notifications/delivery-logs')
        .set('Cookie', customerCookie);

      expect(res.status).toBe(403);
    });

    it('allows admin to list delivery logs with status and channel filters', async () => {
      await notificationService.queueEmailDelivery({
        recipient: 'customer@test.com',
        eventType: 'ORDER_CONFIRMED',
        subject: 'Order Confirmed',
        payload: {
          to: 'customer@test.com',
          subject: 'Order Confirmed',
          html: '<p>Order</p>',
          text: 'Order',
        },
      });

      const res = await request(app)
        .get('/api/v1/admin/notifications/delivery-logs')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.logs).toHaveLength(1);
      expect(res.body.data.logs[0].recipient).toBe('customer@test.com');
      expect(res.body.data.logs[0].channel).toBe('EMAIL');
      expect(res.body.data.logs[0].status).toBe('PENDING');
    });

    it('allows admin to manually retry a failed delivery while preserving audit history', async () => {
      const delivery = await notificationService.queueEmailDelivery({
        recipient: 'failed@test.com',
        eventType: 'ORDER_CONFIRMED',
        subject: 'Failed email',
        payload: {
          to: 'failed@test.com',
          subject: 'Failed',
          html: '<p>Failed</p>',
          text: 'Failed',
        },
      });

      // Mark as DEAD_LETTER with previous attempts
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'DEAD_LETTER',
          attempts: 3,
          lastError: 'SMTP timeout after 3 attempts',
        },
      });

      // Admin retries the delivery
      const retryRes = await request(app)
        .post(`/api/v1/admin/notifications/delivery-logs/${delivery.id}/retry`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', csrfToken);

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.success).toBe(true);
      expect(retryRes.body.data.status).toBe('PENDING');
      expect(retryRes.body.data.attempts).toBe(0);
      expect(retryRes.body.data.manualRetryCount).toBe(1);
      expect(retryRes.body.data.lastRetriedBy).toBe(adminId);
      expect(retryRes.body.data.lastRetriedAt).not.toBeNull();
      // Verifies original attempt failure reason is preserved
      expect(retryRes.body.data.lastError).toBe('SMTP timeout after 3 attempts');
    });

    it('rejects manual retry for deliveries not in FAILED or DEAD_LETTER status', async () => {
      const delivery = await notificationService.queueEmailDelivery({
        recipient: 'sent@test.com',
        eventType: 'ORDER_CONFIRMED',
        subject: 'Sent email',
        payload: {
          to: 'sent@test.com',
          subject: 'Sent',
          html: '<p>Sent</p>',
          text: 'Sent',
        },
      });

      // Mark as SENT
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      const res = await request(app)
        .post(`/api/v1/admin/notifications/delivery-logs/${delivery.id}/retry`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DELIVERY_NOT_RETRYABLE');
    });

    it('enforces maximum manual retry bounds (MAX_MANUAL_RETRIES = 3)', async () => {
      const delivery = await notificationService.queueEmailDelivery({
        recipient: 'exhausted@test.com',
        eventType: 'ORDER_CONFIRMED',
        subject: 'Exhausted retry email',
        payload: {
          to: 'exhausted@test.com',
          subject: 'Exhausted',
          html: '<p>Exhausted</p>',
          text: 'Exhausted',
        },
      });

      // Mark as DEAD_LETTER with 3 previous manual retries
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'DEAD_LETTER',
          attempts: 3,
          manualRetryCount: 3,
        },
      });

      const res = await request(app)
        .post(`/api/v1/admin/notifications/delivery-logs/${delivery.id}/retry`)
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', adminCookie)
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MAX_MANUAL_RETRIES_EXCEEDED');
    });
  });
});
