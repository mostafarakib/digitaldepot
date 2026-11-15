import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getUserNotificationsApi,
  getUnreadNotificationCountApi,
  markNotificationReadApi,
  markAllNotificationsReadApi,
  deleteNotificationApi,
  getAdminDeliveryLogsApi,
  retryAdminDeliveryApi,
  setInMemoryCsrfToken,
} from '../api-client';

describe('Notifications API Client Flow (Phase 9A)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    setInMemoryCsrfToken('test-csrf-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  it('getUserNotificationsApi sends query parameters and returns notifications with unread count', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              notifications: [
                {
                  id: 'notif_1',
                  type: 'ORDER_CONFIRMED',
                  title: 'Order Confirmed',
                  message: 'Your order #DD-123 has been confirmed.',
                  link: '/account/orders/ord_1',
                  metadata: { orderId: 'ord_1' },
                  readAt: null,
                  createdAt: '2026-11-15T02:00:00.000Z',
                },
              ],
              unreadCount: 1,
              pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await getUserNotificationsApi({ page: 1, limit: 10, unreadOnly: true });

    expect(capturedUrl).toContain('/api/notifications?');
    expect(capturedUrl).toContain('page=1');
    expect(capturedUrl).toContain('limit=10');
    expect(capturedUrl).toContain('unreadOnly=true');
    expect(result.notifications).toHaveLength(1);
    expect(result.unreadCount).toBe(1);
    expect(result.notifications[0].type).toBe('ORDER_CONFIRMED');
  });

  it('getUnreadNotificationCountApi fetches the unread badge count', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { unreadCount: 7 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await getUnreadNotificationCountApi();
    expect(result.unreadCount).toBe(7);
  });

  it('markNotificationReadApi sends PATCH request to mark single item as read', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      capturedUrl = url;
      capturedMethod = opts?.method;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: 'notif_456',
              type: 'ORDER_STATUS_UPDATED',
              title: 'Order Shipped',
              message: 'On the way',
              link: '/account/orders/ord_2',
              metadata: null,
              readAt: '2026-11-15T02:10:00.000Z',
              createdAt: '2026-11-15T02:00:00.000Z',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await markNotificationReadApi('notif_456');
    expect(capturedUrl).toBe('/api/notifications/notif_456/read');
    expect(capturedMethod).toBe('PATCH');
    expect(result.readAt).not.toBeNull();
  });

  it('markAllNotificationsReadApi sends POST request', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      capturedUrl = url;
      capturedMethod = opts?.method;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: { count: 4 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await markAllNotificationsReadApi();
    expect(capturedUrl).toBe('/api/notifications/read-all');
    expect(capturedMethod).toBe('POST');
    expect(result.count).toBe(4);
  });

  it('deleteNotificationApi sends DELETE request', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      capturedUrl = url;
      capturedMethod = opts?.method;
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, message: 'Deleted' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const result = await deleteNotificationApi('notif_999');
    expect(capturedUrl).toBe('/api/notifications/notif_999');
    expect(capturedMethod).toBe('DELETE');
    expect(result.success).toBe(true);
  });

  it('getAdminDeliveryLogsApi forwards search and status filters for outbox monitoring', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              logs: [],
              pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    await getAdminDeliveryLogsApi({ status: 'FAILED', channel: 'EMAIL', search: 'gmail.com' });
    expect(capturedUrl).toContain('/api/admin/notifications/delivery-logs?');
    expect(capturedUrl).toContain('status=FAILED');
    expect(capturedUrl).toContain('channel=EMAIL');
    expect(capturedUrl).toContain('search=gmail.com');
  });

  it('retryAdminDeliveryApi sends POST request to trigger controlled retry', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      capturedUrl = url;
      capturedMethod = opts?.method;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              message: 'Delivery re-queued successfully',
              delivery: {
                id: 'del_123',
                status: 'PENDING',
                attempts: 0,
                manualRetryCount: 1,
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await retryAdminDeliveryApi('del_123');
    expect(capturedUrl).toBe('/api/admin/notifications/delivery-logs/del_123/retry');
    expect(capturedMethod).toBe('POST');
    expect(result.message).toBe('Delivery re-queued successfully');
  });
});
