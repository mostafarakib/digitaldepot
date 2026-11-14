import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { settingsService } from '../settings.service.js';

describe('Public Store Settings API (Phase 8A)', () => {
  beforeEach(() => {
    settingsService.invalidateCache();
  });

  it('serves public store settings at GET /api/v1/store/settings without authentication', async () => {
    const res = await request(app).get('/api/v1/store/settings');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data.storeName).toBeDefined();
    expect(data.supportEmail).toBeDefined();
    expect(data.insideDhakaShippingFee).toBeDefined();
    expect(data.outsideDhakaShippingFee).toBeDefined();
    expect(data.freeShippingThreshold).toBeDefined();

    // Clarification 6: Never expose internal audit metadata through the public settings endpoint
    expect(data.id).toBeUndefined();
    expect(data.updatedByUserId).toBeUndefined();
    expect(data.updatedByUser).toBeUndefined();
    expect(data.createdAt).toBeUndefined();
    expect(data.updatedAt).toBeUndefined();
  });

  it('serves public store settings at GET /api/v1/settings/public alias as well', async () => {
    const res = await request(app).get('/api/v1/settings/public');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data.storeName).toBeDefined();
    expect(data.supportEmail).toBeDefined();
    expect(data.id).toBeUndefined();
    expect(data.updatedByUserId).toBeUndefined();
  });
});
