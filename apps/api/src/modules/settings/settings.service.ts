import { prisma } from '../../lib/prisma.js';
import type { StoreSetting, Prisma } from '../../generated/client/client.js';
import type {
  UpdateStoreSettingsInput,
  PublicStoreSettings,
  AdminStoreSettings,
} from './settings.schemas.js';

export interface ShippingConfig {
  insideDhakaShippingFee: number;
  outsideDhakaShippingFee: number;
  freeShippingThreshold: number;
  estimatedDaysInsideDhakaMin: number;
  estimatedDaysInsideDhakaMax: number;
  estimatedDaysOutsideDhakaMin: number;
  estimatedDaysOutsideDhakaMax: number;
}

const DEFAULT_SETTINGS_ID = 'default';
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export class SettingsService {
  /**
   * Process-local in-memory cache for store settings.
   * In a single-instance Node.js architecture (or independent modular monolith),
   * this provides sub-millisecond access for high-frequency operations without introducing Redis.
   */
  private cachedSettings: StoreSetting | null = null;
  private cacheExpiresAt: number = 0;

  /**
   * Explicitly invalidates the process-local in-memory cache.
   * Note: Invalidation is process-local in accordance with project constraints (no Redis/brokers).
   */
  invalidateCache(): void {
    this.cachedSettings = null;
    this.cacheExpiresAt = 0;
  }

  /**
   * Retrieves the raw singleton StoreSetting record, utilizing in-memory cache when fresh.
   * Automatically seeds/upserts the singleton 'default' row if missing.
   */
  async getRawSettings(
    tx: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<StoreSetting> {
    const now = Date.now();
    if (this.cachedSettings && now < this.cacheExpiresAt && tx === prisma) {
      return this.cachedSettings;
    }

    let record = await tx.storeSetting.findUnique({
      where: { id: DEFAULT_SETTINGS_ID },
    });

    if (!record) {
      record = await tx.storeSetting.upsert({
        where: { id: DEFAULT_SETTINGS_ID },
        update: {},
        create: {
          id: DEFAULT_SETTINGS_ID,
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
    }

    if (tx === prisma) {
      this.cachedSettings = record;
      this.cacheExpiresAt = now + CACHE_TTL_MS;
    }

    return record;
  }

  /**
   * Returns customer-facing public settings.
   * Clarification 6: Never exposes internal audit metadata (IDs, user references, timestamps).
   */
  async getPublicStoreSettings(): Promise<PublicStoreSettings> {
    const raw = await this.getRawSettings();
    return {
      storeName: raw.storeName,
      supportEmail: raw.supportEmail,
      supportPhone: raw.supportPhone,
      supportHours: raw.supportHours,
      storeAddress: raw.storeAddress,
      insideDhakaShippingFee: raw.insideDhakaShippingFee,
      outsideDhakaShippingFee: raw.outsideDhakaShippingFee,
      freeShippingThreshold: raw.freeShippingThreshold,
      estimatedDaysInsideDhakaMin: raw.estimatedDaysInsideDhakaMin,
      estimatedDaysInsideDhakaMax: raw.estimatedDaysInsideDhakaMax,
      estimatedDaysOutsideDhakaMin: raw.estimatedDaysOutsideDhakaMin,
      estimatedDaysOutsideDhakaMax: raw.estimatedDaysOutsideDhakaMax,
    };
  }

  /**
   * Returns complete operational store settings for admin dashboard with audit data.
   */
  async getAdminStoreSettings(): Promise<AdminStoreSettings> {
    const raw = await prisma.storeSetting.findUnique({
      where: { id: DEFAULT_SETTINGS_ID },
      include: {
        updatedByUser: {
          select: {
            id: true,
            email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    const record = raw ?? (await this.getRawSettings());
    const updater = (
      record as unknown as {
        updatedByUser?: {
          id: string;
          email: string;
          profile: { firstName: string; lastName: string } | null;
        } | null;
      }
    ).updatedByUser;

    const updaterName = updater?.profile
      ? `${updater.profile.firstName} ${updater.profile.lastName}`.trim()
      : updater?.email || null;

    return {
      id: record.id,
      storeName: record.storeName,
      supportEmail: record.supportEmail,
      supportPhone: record.supportPhone,
      supportHours: record.supportHours,
      storeAddress: record.storeAddress,
      insideDhakaShippingFee: record.insideDhakaShippingFee,
      outsideDhakaShippingFee: record.outsideDhakaShippingFee,
      freeShippingThreshold: record.freeShippingThreshold,
      estimatedDaysInsideDhakaMin: record.estimatedDaysInsideDhakaMin,
      estimatedDaysInsideDhakaMax: record.estimatedDaysInsideDhakaMax,
      estimatedDaysOutsideDhakaMin: record.estimatedDaysOutsideDhakaMin,
      estimatedDaysOutsideDhakaMax: record.estimatedDaysOutsideDhakaMax,
      updatedByUserId: record.updatedByUserId,
      updatedByUser: updater
        ? {
            id: updater.id,
            email: updater.email,
            name: updaterName || updater.email,
          }
        : null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * Updates store settings under transaction, records admin audit identity, and invalidates process-local cache.
   */
  async updateStoreSettings(
    input: UpdateStoreSettingsInput,
    adminUserId: string,
  ): Promise<AdminStoreSettings> {
    await prisma.$transaction(async (tx) => {
      await tx.storeSetting.upsert({
        where: { id: DEFAULT_SETTINGS_ID },
        create: {
          id: DEFAULT_SETTINGS_ID,
          insideDhakaShippingFee: input.insideDhakaShippingFee,
          outsideDhakaShippingFee: input.outsideDhakaShippingFee,
          freeShippingThreshold: input.freeShippingThreshold,
          estimatedDaysInsideDhakaMin: input.estimatedDaysInsideDhakaMin,
          estimatedDaysInsideDhakaMax: input.estimatedDaysInsideDhakaMax,
          estimatedDaysOutsideDhakaMin: input.estimatedDaysOutsideDhakaMin,
          estimatedDaysOutsideDhakaMax: input.estimatedDaysOutsideDhakaMax,
          storeName: input.storeName,
          supportEmail: input.supportEmail,
          supportPhone: input.supportPhone ?? null,
          supportHours: input.supportHours ?? null,
          storeAddress: input.storeAddress ?? null,
          updatedByUserId: adminUserId,
        },
        update: {
          insideDhakaShippingFee: input.insideDhakaShippingFee,
          outsideDhakaShippingFee: input.outsideDhakaShippingFee,
          freeShippingThreshold: input.freeShippingThreshold,
          estimatedDaysInsideDhakaMin: input.estimatedDaysInsideDhakaMin,
          estimatedDaysInsideDhakaMax: input.estimatedDaysInsideDhakaMax,
          estimatedDaysOutsideDhakaMin: input.estimatedDaysOutsideDhakaMin,
          estimatedDaysOutsideDhakaMax: input.estimatedDaysOutsideDhakaMax,
          storeName: input.storeName,
          supportEmail: input.supportEmail,
          supportPhone: input.supportPhone ?? null,
          supportHours: input.supportHours ?? null,
          storeAddress: input.storeAddress ?? null,
          updatedByUserId: adminUserId,
        },
      });
    });

    // Invalidate local in-memory cache
    this.invalidateCache();

    return this.getAdminStoreSettings();
  }

  /**
   * Fast accessor for dynamic shipping configuration.
   */
  async getShippingConfig(
    tx: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<ShippingConfig> {
    const raw = await this.getRawSettings(tx);
    return {
      insideDhakaShippingFee: raw.insideDhakaShippingFee,
      outsideDhakaShippingFee: raw.outsideDhakaShippingFee,
      freeShippingThreshold: raw.freeShippingThreshold,
      estimatedDaysInsideDhakaMin: raw.estimatedDaysInsideDhakaMin,
      estimatedDaysInsideDhakaMax: raw.estimatedDaysInsideDhakaMax,
      estimatedDaysOutsideDhakaMin: raw.estimatedDaysOutsideDhakaMin,
      estimatedDaysOutsideDhakaMax: raw.estimatedDaysOutsideDhakaMax,
    };
  }
}

export const settingsService = new SettingsService();
