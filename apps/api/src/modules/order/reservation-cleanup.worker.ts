import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { inventoryReservationService } from './inventory-reservation.service.js';

const DEFAULT_POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

export class ReservationCleanupWorker {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isRunning = false;
  private activeCleanupPromise: Promise<number> | null = null;
  private readonly workerId: string;
  private readonly pollIntervalMs: number;

  constructor(options?: { pollIntervalMs?: number; workerId?: string }) {
    this.pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.workerId =
      options?.workerId ??
      `reservation-cleanup-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Starts the periodic reservation cleanup timer, guarding against duplicate starts.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info(
      { workerId: this.workerId, pollIntervalMs: this.pollIntervalMs },
      'Inventory reservation cleanup worker started',
    );

    this.timer = setInterval(() => {
      void this.runCleanup();
    }, this.pollIntervalMs);

    void this.runCleanup();
  }

  /**
   * Gracefully stops the periodic cleanup timer and waits for any active
   * cleanup transaction to finish before returning.
   */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const wasRunning = this.isRunning;
    this.isRunning = false;

    if (this.activeCleanupPromise) {
      await this.activeCleanupPromise;
    }

    if (wasRunning) {
      logger.info({ workerId: this.workerId }, 'Inventory reservation cleanup worker stopped');
    }
  }

  /**
   * Runs one transactional sweep of expired SSLCommerz stock reservations.
   * Uses FOR UPDATE SKIP LOCKED inside cleanupExpiredReservations for concurrency safety.
   */
  async runCleanup(now = new Date()): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }

    this.isProcessing = true;
    const promise = (async () => {
      try {
        const cleanedCount = await prisma.$transaction(async (tx) => {
          return inventoryReservationService.cleanupExpiredReservations(tx, now);
        });

        if (cleanedCount > 0) {
          logger.info(
            { workerId: this.workerId, cleanedCount },
            'Cleaned up expired inventory reservations',
          );
        }

        return cleanedCount;
      } catch (error) {
        logger.error(
          { error, workerId: this.workerId },
          'Failed to clean up expired inventory reservations',
        );
        return 0;
      } finally {
        this.isProcessing = false;
        this.activeCleanupPromise = null;
      }
    })();

    this.activeCleanupPromise = promise;
    return promise;
  }
}

export const reservationCleanupWorker = new ReservationCleanupWorker();
