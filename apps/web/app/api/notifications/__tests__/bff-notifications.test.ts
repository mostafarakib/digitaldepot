import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getNotifications } from '../route';
import { GET as getUnreadCount } from '../unread-count/route';
import { PATCH as markRead } from '../[id]/read/route';
import { POST as markAllRead } from '../read-all/route';
import { DELETE as deleteNotification } from '../[id]/route';
import { GET as getDeliveryLogs } from '../../admin/notifications/delivery-logs/route';
import { POST as retryDelivery } from '../../admin/notifications/delivery-logs/[id]/retry/route';

describe('BFF Notifications Route Handlers (Phase 9A)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /api/notifications', () => {
    it('forwards request with query params to Express API', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: { notifications: [], unreadCount: 0, pagination: { total: 0 } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/notifications?page=2&unreadOnly=true');
      const res = await getNotifications(req);

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/notifications');
      expect(forwardedUrl).toContain('page=2');
      expect(forwardedUrl).toContain('unreadOnly=true');
    });
  });

  describe('GET /api/notifications/unread-count', () => {
    it('forwards request to Express unread-count endpoint', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: { unreadCount: 5 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/notifications/unread-count');
      const res = await getUnreadCount(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/notifications/unread-count');
      expect(data.data.unreadCount).toBe(5);
    });
  });

  describe('PATCH /api/notifications/[id]/read', () => {
    it('forwards mark-as-read request to Express endpoint with origin verification', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';
      global.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
        forwardedUrl = url;
        forwardedMethod = opts?.method;
        return new Response(
          JSON.stringify({
            success: true,
            data: { id: 'notif_1', readAt: new Date().toISOString() },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/notifications/notif_1/read', {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      const res = await markRead(req, { params: Promise.resolve({ id: 'notif_1' }) });
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/notifications/notif_1/read');
      expect(forwardedMethod).toBe('PATCH');
    });

    it('rejects state-changing requests with invalid origin (CSRF protection)', async () => {
      const req = new NextRequest('http://localhost:3000/api/notifications/notif_1/read', {
        method: 'PATCH',
        headers: {
          origin: 'http://malicious-site.com',
        },
      });

      const res = await markRead(req, { params: Promise.resolve({ id: 'notif_1' }) });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/notifications/read-all', () => {
    it('forwards mark-all-as-read request', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: { count: 3 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/notifications/read-all', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      const res = await markAllRead(req);
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/notifications/read-all');
    });
  });

  describe('DELETE /api/notifications/[id]', () => {
    it('forwards delete request with encoded id', async () => {
      let forwardedUrl = '';
      let forwardedMethod = '';
      global.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
        forwardedUrl = url;
        forwardedMethod = opts?.method;
        return new Response(
          JSON.stringify({ success: true, message: 'Notification deleted successfully' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/notifications/notif_abc/123', {
        method: 'DELETE',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      const res = await deleteNotification(req, {
        params: Promise.resolve({ id: 'notif_abc/123' }),
      });
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/notifications/notif_abc%2F123');
      expect(forwardedMethod).toBe('DELETE');
    });
  });

  describe('Admin Delivery Outbox Routes', () => {
    it('GET /api/admin/notifications/delivery-logs forwards query', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({ success: true, data: { logs: [], pagination: { total: 0 } } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/notifications/delivery-logs?status=FAILED&channel=EMAIL',
      );
      const res = await getDeliveryLogs(req);

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/notifications/delivery-logs');
      expect(forwardedUrl).toContain('status=FAILED');
      expect(forwardedUrl).toContain('channel=EMAIL');
    });

    it('POST /api/admin/notifications/delivery-logs/[id]/retry forwards retry request', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: { id: 'del_1', status: 'PENDING', attempts: 0 },
            message: 'Delivery re-queued',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/notifications/delivery-logs/del_1/retry',
        {
          method: 'POST',
          headers: { origin: 'http://localhost:3000' },
        },
      );

      const res = await retryDelivery(req, { params: Promise.resolve({ id: 'del_1' }) });
      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/notifications/delivery-logs/del_1/retry');
    });
  });
});
