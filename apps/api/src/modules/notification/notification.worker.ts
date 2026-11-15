import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { emailService } from '../email/email.service.js';

interface ClaimedJob {
  id: string;
  payload: {
    to?: string;
    subject?: string;
    html?: string;
    text?: string;
    [key: string]: unknown;
  };
  recipient: string;
  subject: string | null;
  attempts: number;
  maxAttempts: number;
  idempotencyKey?: string | null;
}

export class NotificationWorker {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isRunning = false;
  private readonly workerId: string;
  private readonly pollIntervalMs: number;

  constructor(options?: { pollIntervalMs?: number; workerId?: string }) {
    this.pollIntervalMs = options?.pollIntervalMs ?? 5000;
    this.workerId =
      options?.workerId ?? `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Starts the polling timer.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info(
      { workerId: this.workerId, pollIntervalMs: this.pollIntervalMs },
      'Notification background worker started',
    );

    this.timer = setInterval(() => {
      void this.processNextBatch();
    }, this.pollIntervalMs);

    // Trigger an immediate initial tick
    void this.processNextBatch();
  }

  /**
   * Gracefully stops the worker timer.
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    logger.info({ workerId: this.workerId }, 'Notification background worker stopped');
  }

  /**
   * Recovers stale leases (jobs in PROCESSING for more than 5 minutes).
   * Requirement 5: Jobs abandoned at maximum attempts transition directly to DEAD_LETTER.
   */
  async recoverStaleLeases(): Promise<number> {
    try {
      const recoveredCount = await prisma.$executeRaw`
        UPDATE "NotificationDelivery"
        SET "status" = CASE
              WHEN "attempts" >= "maxAttempts" THEN 'DEAD_LETTER'::"DeliveryStatus"
              ELSE 'FAILED'::"DeliveryStatus"
            END,
            "lastError" = CASE
              WHEN "attempts" >= "maxAttempts" THEN 'Abandoned job reached maximum attempts during stale lease'
              ELSE 'Worker crash or stale lease recovered'
            END,
            "nextAttemptAt" = CASE
              WHEN "attempts" >= "maxAttempts" THEN "nextAttemptAt"
              ELSE NOW() + INTERVAL '30 seconds'
            END,
            "claimedAt" = NULL,
            "claimedBy" = NULL,
            "updatedAt" = NOW()
        WHERE "status" = 'PROCESSING'
          AND "claimedAt" < NOW() - INTERVAL '5 minutes'
      `;

      if (recoveredCount > 0) {
        logger.warn(
          { recoveredCount },
          'Recovered abandoned notification delivery jobs from stale lease',
        );
      }

      return recoveredCount;
    } catch (error) {
      logger.error({ error }, 'Failed to recover stale notification delivery leases');
      return 0;
    }
  }

  /**
   * Claims and processes a batch of due email deliveries.
   * Requirement 4: Uses PostgreSQL FOR UPDATE SKIP LOCKED.
   * Requirement 3: Processes EMAIL channel only (IN_APP are directly persisted).
   */
  async processNextBatch(batchSize = 10): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }

    this.isProcessing = true;

    try {
      // 1. Recover any stale leases first
      await this.recoverStaleLeases();

      // 2. Concurrency-safe job claim
      const claimedJobs = await prisma.$queryRaw<ClaimedJob[]>`
        WITH to_claim AS (
          SELECT "id"
          FROM "NotificationDelivery"
          WHERE "channel" = 'EMAIL'
            AND "status" IN ('PENDING', 'FAILED')
            AND "attempts" < "maxAttempts"
            AND "nextAttemptAt" <= NOW()
            AND ("claimedAt" IS NULL OR "claimedAt" < NOW() - INTERVAL '5 minutes')
          ORDER BY "nextAttemptAt" ASC
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "NotificationDelivery" d
        SET "status" = 'PROCESSING',
            "claimedAt" = NOW(),
            "claimedBy" = ${this.workerId},
            "attempts" = d."attempts" + 1,
            "lastAttemptAt" = NOW(),
            "updatedAt" = NOW()
        FROM to_claim
        WHERE d."id" = to_claim."id"
        RETURNING d."id", d."payload", d."recipient", d."subject", d."attempts", d."maxAttempts", d."idempotencyKey"
      `;

      if (claimedJobs.length === 0) {
        return 0;
      }

      logger.debug(
        { count: claimedJobs.length, workerId: this.workerId },
        'Claimed notification deliveries for processing',
      );

      // 3. Process each claimed job
      for (const job of claimedJobs) {
        await this.deliverJob(job);
      }

      return claimedJobs.length;
    } catch (error) {
      logger.error({ error }, 'Error in notification worker batch execution');
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Delivers a single claimed job with exponential backoff and error sanitization.
   */
  private async deliverJob(job: ClaimedJob): Promise<void> {
    try {
      const payload = (job.payload || {}) as {
        to?: string;
        subject?: string;
        html?: string;
        text?: string;
      };

      const recipient = payload.to || job.recipient;
      const subject = payload.subject || job.subject || 'Notification from DigitalDepot';
      const html = payload.html || '<p>Notification</p>';
      const text = payload.text || 'Notification';

      // Call external email transport with provider-side idempotency if supported (Resend Idempotency-Key limit: 256 chars)
      const idempotencyKey = job.idempotencyKey ? job.idempotencyKey.slice(0, 256) : undefined;

      await emailService.getTransport().send({
        to: recipient,
        subject,
        html,
        text,
        idempotencyKey,
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      });

      // Mark as successfully sent
      await prisma.notificationDelivery.update({
        where: { id: job.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          claimedAt: null,
          claimedBy: null,
          lastError: null,
        },
      });

      logger.info(
        { deliveryId: job.id, recipient, attempts: job.attempts },
        'Email delivery successfully sent',
      );
    } catch (error) {
      const sanitizedError = this.sanitizeErrorMessage(error);
      const isDeadLetter = job.attempts >= job.maxAttempts;

      // Exponential backoff:
      // Attempt 1 -> 30 seconds
      // Attempt 2 -> 120 seconds
      // Attempt 3 -> DEAD_LETTER
      const backoffSeconds = job.attempts === 1 ? 30 : 120;
      const nextAttemptAt = new Date(Date.now() + backoffSeconds * 1000);

      await prisma.notificationDelivery.update({
        where: { id: job.id },
        data: {
          status: isDeadLetter ? 'DEAD_LETTER' : 'FAILED',
          nextAttemptAt: isDeadLetter ? new Date() : nextAttemptAt,
          lastError: sanitizedError,
          claimedAt: null,
          claimedBy: null,
        },
      });

      logger.warn(
        {
          deliveryId: job.id,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          isDeadLetter,
          error: sanitizedError,
        },
        isDeadLetter
          ? 'Email delivery reached maximum attempts and transitioned to DEAD_LETTER'
          : `Email delivery failed, scheduled retry in ${backoffSeconds}s`,
      );
    }
  }

  /**
   * Requirement 8: Sanitize failure details to avoid leaking tokens, secrets, or passwords.
   */
  private sanitizeErrorMessage(err: unknown): string {
    let message = 'Unknown delivery error';
    if (err instanceof Error) {
      message = err.message;
    } else if (typeof err === 'string') {
      message = err;
    }

    const sanitized = message
      .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [REDACTED]')
      .replace(/(api[_-]?key|secret|password|token)[:=]\s*[^\s,]+/gi, '$1=[REDACTED]');

    return sanitized.slice(0, 500);
  }
}

export const notificationWorker = new NotificationWorker();
