import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { settingsService } from '../settings.service.js';

describe('SettingsService (Phase 8A)', () => {
  beforeEach(async () => {
    // Invalidate cache before each test
    settingsService.invalidateCache();
  });

  it('retrieves default store settings singleton with expected values', async () => {
    const settings = await settingsService.getRawSettings();
    expect(settings.id).toBe('default');
    expect(settings.insideDhakaShippingFee).toBe(6000);
    expect(settings.outsideDhakaShippingFee).toBe(12000);
    expect(settings.freeShippingThreshold).toBe(500000);
    expect(settings.estimatedDaysInsideDhakaMin).toBe(2);
    expect(settings.estimatedDaysInsideDhakaMax).toBe(3);
    expect(settings.estimatedDaysOutsideDhakaMin).toBe(3);
    expect(settings.estimatedDaysOutsideDhakaMax).toBe(5);
    expect(settings.storeName).toBe('DigitalDepot');
    expect(settings.supportEmail).toBe('support@digitaldepot.local');
  });

  it('returns public store settings without sensitive audit metadata', async () => {
    const publicSettings = await settingsService.getPublicStoreSettings();
    expect(publicSettings).toHaveProperty('storeName');
    expect(publicSettings).toHaveProperty('supportEmail');
    expect(publicSettings).toHaveProperty('insideDhakaShippingFee');
    expect(publicSettings).toHaveProperty('outsideDhakaShippingFee');
    expect(publicSettings).toHaveProperty('freeShippingThreshold');
    expect(publicSettings).toHaveProperty('estimatedDaysInsideDhakaMin');
    expect(publicSettings).toHaveProperty('estimatedDaysInsideDhakaMax');

    // Internal audit fields must NOT be present
    const auditObj = publicSettings as unknown as Record<string, unknown>;
    expect(auditObj.id).toBeUndefined();
    expect(auditObj.updatedByUserId).toBeUndefined();
    expect(auditObj.createdAt).toBeUndefined();
    expect(auditObj.updatedAt).toBeUndefined();
  });

  it('caches settings in-memory and invalidates cache upon update', async () => {
    const firstCall = await settingsService.getRawSettings();

    // Directly mutate DB behind the service's back to test in-memory cache
    await prisma.storeSetting.update({
      where: { id: 'default' },
      data: { storeName: 'Direct DB Update' },
    });

    // Should return cached value because TTL has not elapsed
    const cached = await settingsService.getRawSettings();
    expect(cached.storeName).toBe(firstCall.storeName);

    // Explicitly invalidate cache
    settingsService.invalidateCache();

    // Now should fetch fresh DB record
    const fresh = await settingsService.getRawSettings();
    expect(fresh.storeName).toBe('Direct DB Update');

    // Restore original storeName
    await prisma.storeSetting.update({
      where: { id: 'default' },
      data: { storeName: 'DigitalDepot' },
    });
    settingsService.invalidateCache();
  });

  it('updates store settings and persists updatedByUserId', async () => {
    // Find or create admin user for test
    let admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });
    if (!admin) {
      admin = await prisma.user.create({
        data: {
          email: `admin-service-${Date.now()}@digitaldepot.local`,
          passwordHash: 'dummyhash',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });
    }

    const updatePayload = {
      insideDhakaShippingFee: 7000, // ৳70
      outsideDhakaShippingFee: 13000, // ৳130
      freeShippingThreshold: 600000, // ৳6,000
      estimatedDaysInsideDhakaMin: 1,
      estimatedDaysInsideDhakaMax: 2,
      estimatedDaysOutsideDhakaMin: 2,
      estimatedDaysOutsideDhakaMax: 4,
      storeName: 'DigitalDepot Updated',
      supportEmail: 'customercare@digitaldepot.local',
      supportPhone: '+880 1800-111222',
      supportHours: 'Sat – Thu: 9:00 AM – 9:00 PM',
      storeAddress: 'Gulshan-2, Dhaka, Bangladesh',
    };

    const updated = await settingsService.updateStoreSettings(updatePayload, admin.id);

    expect(updated.insideDhakaShippingFee).toBe(7000);
    expect(updated.outsideDhakaShippingFee).toBe(13000);
    expect(updated.freeShippingThreshold).toBe(600000);
    expect(updated.estimatedDaysInsideDhakaMin).toBe(1);
    expect(updated.estimatedDaysInsideDhakaMax).toBe(2);
    expect(updated.storeName).toBe('DigitalDepot Updated');
    expect(updated.supportEmail).toBe('customercare@digitaldepot.local');

    // Fast accessor reflects updated values immediately
    const shippingConfig = await settingsService.getShippingConfig();
    expect(shippingConfig.insideDhakaShippingFee).toBe(7000);
    expect(shippingConfig.freeShippingThreshold).toBe(600000);

    // Reset back to defaults
    await settingsService.updateStoreSettings(
      {
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
      admin.id,
    );
  });
});
