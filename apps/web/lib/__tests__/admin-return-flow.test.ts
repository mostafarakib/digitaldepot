import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAdminReturnsApi,
  getAdminReturnDetailApi,
  approveAdminReturnApi,
  rejectAdminReturnApi,
  inspectAdminReturnApi,
  setInMemoryCsrfToken,
} from '../api-client';

describe('Admin Returns API Client Flow (Phase 7C)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    setInMemoryCsrfToken('test-csrf-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  it('getAdminReturnsApi sends GET request with status, pagination, and sorting params', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              returns: [],
              pagination: { page: 1, limit: 15, total: 5, totalPages: 1 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await getAdminReturnsApi({
      page: 1,
      limit: 15,
      status: 'REQUESTED',
      returnNumber: 'RET-20261114',
      sortBy: 'createdAt:desc',
    });

    expect(capturedUrl).toContain('/api/admin/returns?');
    expect(capturedUrl).toContain('status=REQUESTED');
    expect(capturedUrl).toContain('returnNumber=RET-20261114');
    expect(capturedUrl).toContain('sortBy=createdAt%3Adesc');
    expect(result.pagination.total).toBe(5);
  });

  it('getAdminReturnDetailApi sends GET request for returnNumber', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              return: {
                id: 'ret-123',
                returnNumber: 'RET-20261114-12345678',
                status: 'REQUESTED',
                items: [],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await getAdminReturnDetailApi('RET-20261114-12345678');
    expect(capturedUrl).toBe('/api/admin/returns/RET-20261114-12345678');
    expect(result.return.id).toBe('ret-123');
    expect(result.return.status).toBe('REQUESTED');
  });

  it('approveAdminReturnApi sends POST request with notes', async () => {
    let capturedMethod = '';
    let capturedBody = '';
    let capturedUrl = '';

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method || '';
      capturedBody = typeof init?.body === 'string' ? init.body : '';
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              return: {
                id: 'ret-123',
                returnNumber: 'RET-20261114-12345678',
                status: 'APPROVED',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await approveAdminReturnApi('RET-20261114-12345678', {
      notes: 'Customer notified to drop off',
    });

    expect(capturedUrl).toBe('/api/admin/returns/RET-20261114-12345678/approve');
    expect(capturedMethod).toBe('POST');
    expect(JSON.parse(capturedBody)).toEqual({ notes: 'Customer notified to drop off' });
    expect(result.return.status).toBe('APPROVED');
  });

  it('rejectAdminReturnApi sends POST request with required reason', async () => {
    let capturedMethod = '';
    let capturedBody = '';
    let capturedUrl = '';

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method || '';
      capturedBody = typeof init?.body === 'string' ? init.body : '';
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              return: {
                id: 'ret-123',
                returnNumber: 'RET-20261114-12345678',
                status: 'REJECTED',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const result = await rejectAdminReturnApi('RET-20261114-12345678', {
      reason: 'Physical seal was broken',
    });

    expect(capturedUrl).toBe('/api/admin/returns/RET-20261114-12345678/reject');
    expect(capturedMethod).toBe('POST');
    expect(JSON.parse(capturedBody)).toEqual({ reason: 'Physical seal was broken' });
    expect(result.return.status).toBe('REJECTED');
  });

  it('inspectAdminReturnApi sends POST request with items condition and restocking instructions', async () => {
    let capturedMethod = '';
    let capturedBody = '';
    let capturedUrl = '';

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method || '';
      capturedBody = typeof init?.body === 'string' ? init.body : '';
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              return: {
                id: 'ret-123',
                returnNumber: 'RET-20261114-12345678',
                status: 'RECEIVED',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const inspectInput = {
      items: [
        { returnItemId: 'item-1', condition: 'GOOD' as const, inspectedQuantity: 2 },
        { returnItemId: 'item-2', condition: 'DAMAGED' as const, inspectedQuantity: 1 },
      ],
      notes: 'Item 1 pristine condition, item 2 water damage',
    };

    const result = await inspectAdminReturnApi('RET-20261114-12345678', inspectInput);

    expect(capturedUrl).toBe('/api/admin/returns/RET-20261114-12345678/inspect');
    expect(capturedMethod).toBe('POST');
    expect(JSON.parse(capturedBody)).toEqual(inspectInput);
    expect(result.return.status).toBe('RECEIVED');
  });
});
