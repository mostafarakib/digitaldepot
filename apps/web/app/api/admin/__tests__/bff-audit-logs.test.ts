import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getAuditLogs } from '../audit-logs/route';
import { GET as getAuditActors } from '../audit-logs/actors/route';

describe('BFF Admin Audit Logs Route Handlers (Phase 8C)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /api/admin/audit-logs', () => {
    it('forwards GET request with query params to Express backend', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: { logs: [], stats: {}, pagination: { total: 0 } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/audit-logs?page=1&limit=25&category=ORDERS&search=DD-123',
      );
      const res = await getAuditLogs(req);

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/audit-logs');
      expect(forwardedUrl).toContain('category=ORDERS');
      expect(forwardedUrl).toContain('search=DD-123');
    });

    it('returns error response when Express backend fails', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Admin access required' },
          }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        ),
      );

      const req = new NextRequest('http://localhost:3000/api/admin/audit-logs');
      const res = await getAuditLogs(req);
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/admin/audit-logs/actors', () => {
    it('forwards GET request for audit actors', async () => {
      let forwardedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        forwardedUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              actors: [{ id: 'admin-1', email: 'admin@digitaldepot.local', name: 'Admin User' }],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const req = new NextRequest('http://localhost:3000/api/admin/audit-logs/actors');
      const res = await getAuditActors(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain('/api/v1/admin/audit-logs/actors');
      expect(body.data.actors.length).toBe(1);
    });
  });
});
