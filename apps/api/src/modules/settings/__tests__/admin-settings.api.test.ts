import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { hashPassword, signAccessToken } from '../../../lib/crypto.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { env } from '../../../config/env.js';
import { settingsService } from '../settings.service.js';

describe('Admin Settings API (Phase 8A)', () => {
  let csrfToken: string;
  let csrfCookie: string;
  let adminCookie: string;
  let customerCookie: string;
  let adminId: string;

  beforeEach(async () => {
    csrfToken = generateCsrfToken();
    csrfCookie = `${COOKIE_NAMES.CSRF_TOKEN}=${csrfToken}`;
    settingsService.invalidateCache();

    // Create admin user
    const adminSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const adminPasswordHash = await hashPassword('AdminPass123!');
    const admin = await prisma.user.create({
      data: {
        email: `admin-${adminSuffix}@digitaldepot.local`,
        passwordHash: adminPasswordHash,
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

    const adminSession = await prisma.session.create({
      data: {
        userId: admin.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const adminToken = await signAccessToken({
      sub: admin.id,
      sid: adminSession.id,
    });
    adminCookie = `${COOKIE_NAMES.ACCESS_TOKEN}=${adminToken}`;

    // Create standard customer user
    const customerSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const custPasswordHash = await hashPassword('CustomerPass123!');
    const customer = await prisma.user.create({
      data: {
        email: `customer-${customerSuffix}@example.com`,
        passwordHash: custPasswordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
        profile: {
          create: {
            firstName: 'Regular',
            lastName: 'Customer',
          },
        },
      },
    });

    const custSession = await prisma.session.create({
      data: {
        userId: customer.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const customerToken = await signAccessToken({
      sub: customer.id,
      sid: custSession.id,
    });
    customerCookie = `${COOKIE_NAMES.ACCESS_TOKEN}=${customerToken}`;
  });

  afterAll(async () => {
    // Reset store settings to defaults
    await prisma.storeSetting.upsert({
      where: { id: 'default' },
      update: {
        insideDhakaShippingFee: 6000,
        outsideDhakaShippingFee: 12000,
        freeShippingThreshold: 500000,
        estimatedDaysInsideDhakaMin: 2,
        estimatedDaysInsideDhakaMax: 3,
        estimatedDaysOutsideDhakaMin: 3,
        estimatedDaysOutsideDhakaMax: 5,
        storeName: 'DigitalDepot',
        supportEmail: 'support@digitaldepot.local',
        supportPhone: '+880 1700-000000',
        supportHours: 'Sat – Thu: 10:00 AM – 8:00 PM',
        storeAddress: 'Dhaka, Bangladesh',
        updatedByUserId: null,
      },
      create: {
        id: 'default',
        insideDhakaShippingFee: 6000,
        outsideDhakaShippingFee: 12000,
        freeShippingThreshold: 500000,
        estimatedDaysInsideDhakaMin: 2,
        estimatedDaysInsideDhakaMax: 3,
        estimatedDaysOutsideDhakaMin: 3,
        estimatedDaysOutsideDhakaMax: 5,
        storeName: 'DigitalDepot',
        supportEmail: 'support@digitaldepot.local',
        supportPhone: '+880 1700-000000',
        supportHours: 'Sat – Thu: 10:00 AM – 8:00 PM',
        storeAddress: 'Dhaka, Bangladesh',
      },
    });
    settingsService.invalidateCache();
  });

  describe('Authorization Gates', () => {
    it('rejects unauthenticated requests to GET /api/v1/admin/settings with 401', async () => {
      const res = await request(app).get('/api/v1/admin/settings');
      expect(res.status).toBe(401);
    });

    it('rejects customer requests to GET /api/v1/admin/settings with 403', async () => {
      const res = await request(app).get('/api/v1/admin/settings').set('Cookie', [customerCookie]);
      expect(res.status).toBe(403);
    });

    it('rejects customer requests to PUT /api/v1/admin/settings with 403', async () => {
      const res = await request(app)
        .put('/api/v1/admin/settings')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', `${customerCookie}; ${csrfCookie}`)
        .set('x-csrf-token', csrfToken)
        .send({
          insideDhakaShippingFee: 5000,
          outsideDhakaShippingFee: 10000,
          freeShippingThreshold: 400000,
          estimatedDaysInsideDhakaMin: 1,
          estimatedDaysInsideDhakaMax: 2,
          estimatedDaysOutsideDhakaMin: 2,
          estimatedDaysOutsideDhakaMax: 4,
          storeName: 'Test',
          supportEmail: 'test@example.com',
        });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/admin/settings', () => {
    it('returns full store settings including audit metadata for admin', async () => {
      const res = await request(app).get('/api/v1/admin/settings').set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data.id).toBe('default');
      expect(data.insideDhakaShippingFee).toBe(6000);
      expect(data.outsideDhakaShippingFee).toBe(12000);
      expect(data.freeShippingThreshold).toBe(500000);
      expect(data.storeName).toBe('DigitalDepot');
      expect(data.supportEmail).toBe('support@digitaldepot.local');
      expect(data).toHaveProperty('createdAt');
      expect(data).toHaveProperty('updatedAt');
    });
  });

  describe('PUT /api/v1/admin/settings validation & mutation', () => {
    it('rejects negative shipping fees with 400', async () => {
      const res = await request(app)
        .put('/api/v1/admin/settings')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('x-csrf-token', csrfToken)
        .send({
          insideDhakaShippingFee: -100,
          outsideDhakaShippingFee: 12000,
          freeShippingThreshold: 500000,
          estimatedDaysInsideDhakaMin: 2,
          estimatedDaysInsideDhakaMax: 3,
          estimatedDaysOutsideDhakaMin: 3,
          estimatedDaysOutsideDhakaMax: 5,
          storeName: 'DigitalDepot',
          supportEmail: 'support@digitaldepot.local',
        });

      expect(res.status).toBe(400);
    });

    it('rejects inverted delivery days (max < min) with 400', async () => {
      const res = await request(app)
        .put('/api/v1/admin/settings')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('x-csrf-token', csrfToken)
        .send({
          insideDhakaShippingFee: 6000,
          outsideDhakaShippingFee: 12000,
          freeShippingThreshold: 500000,
          estimatedDaysInsideDhakaMin: 5,
          estimatedDaysInsideDhakaMax: 2, // Invalid: max < min
          estimatedDaysOutsideDhakaMin: 3,
          estimatedDaysOutsideDhakaMax: 5,
          storeName: 'DigitalDepot',
          supportEmail: 'support@digitaldepot.local',
        });

      expect(res.status).toBe(400);
    });

    it('rejects invalid support email format with 400', async () => {
      const res = await request(app)
        .put('/api/v1/admin/settings')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('x-csrf-token', csrfToken)
        .send({
          insideDhakaShippingFee: 6000,
          outsideDhakaShippingFee: 12000,
          freeShippingThreshold: 500000,
          estimatedDaysInsideDhakaMin: 2,
          estimatedDaysInsideDhakaMax: 3,
          estimatedDaysOutsideDhakaMin: 3,
          estimatedDaysOutsideDhakaMax: 5,
          storeName: 'DigitalDepot',
          supportEmail: 'invalid-email-string',
        });

      expect(res.status).toBe(400);
    });

    it('successfully updates store settings, persists admin audit identity, and invalidates cache', async () => {
      const res = await request(app)
        .put('/api/v1/admin/settings')
        .set('Origin', env.FRONTEND_URL)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('x-csrf-token', csrfToken)
        .send({
          insideDhakaShippingFee: 8000, // ৳80
          outsideDhakaShippingFee: 15000, // ৳150
          freeShippingThreshold: 750000, // ৳7,500
          estimatedDaysInsideDhakaMin: 1,
          estimatedDaysInsideDhakaMax: 2,
          estimatedDaysOutsideDhakaMin: 2,
          estimatedDaysOutsideDhakaMax: 4,
          storeName: 'DigitalDepot Flagship',
          supportEmail: 'care@digitaldepot.local',
          supportPhone: '+880 1711-223344',
          supportHours: 'Sat – Thu: 8:00 AM – 10:00 PM',
          storeAddress: 'Banani, Dhaka, Bangladesh',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data.insideDhakaShippingFee).toBe(8000);
      expect(data.outsideDhakaShippingFee).toBe(15000);
      expect(data.freeShippingThreshold).toBe(750000);
      expect(data.storeName).toBe('DigitalDepot Flagship');
      expect(data.supportEmail).toBe('care@digitaldepot.local');
      expect(data.updatedByUserId).toBe(adminId);

      // Verify fast accessor returns updated configuration immediately
      const config = await settingsService.getShippingConfig();
      expect(config.insideDhakaShippingFee).toBe(8000);
      expect(config.outsideDhakaShippingFee).toBe(15000);
      expect(config.freeShippingThreshold).toBe(750000);
    });
  });
});
