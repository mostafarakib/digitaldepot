import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { NotificationWorker } from '../notification.worker.js';
import { notificationService } from '../notification.service.js';
import { emailService } from '../../email/email.service.js';

describe('Phase 9A: Notification Worker & Bounded Retries', () => {
  let worker: NotificationWorker;

  beforeEach(async () => {
    await prisma.notificationDelivery.deleteMany();
    await prisma.notification.deleteMany();

    worker = new NotificationWorker({ pollIntervalMs: 1000, workerId: 'test-worker-1' });
  });

  it('claims due EMAIL deliveries and successfully delivers them', async () => {
    const sendSpy = vi.fn().mockResolvedValue(undefined);
    emailService.setTransport({ send: sendSpy });

    const delivery = await notificationService.queueEmailDelivery({
      recipient: 'user@example.com',
      eventType: 'ORDER_CONFIRMED',
      subject: 'Order Confirmation',
      payload: {
        to: 'user@example.com',
        subject: 'Order Confirmation',
        html: '<p>Thank you for your order</p>',
        text: 'Thank you for your order',
      },
    });

    const processed = await worker.processNextBatch();
    expect(processed).toBe(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Order Confirmation',
      }),
    );

    const updated = await prisma.notificationDelivery.findUnique({
      where: { id: delivery.id },
    });
    expect(updated?.status).toBe('SENT');
    expect(updated?.sentAt).not.toBeNull();
    expect(updated?.attempts).toBe(1);
  });

  it('schedules retry with exponential backoff on delivery failure', async () => {
    const sendSpy = vi
      .fn()
      .mockRejectedValue(new Error('SMTP connection refused: Bearer secret-token-12345'));
    emailService.setTransport({ send: sendSpy });

    const delivery = await notificationService.queueEmailDelivery({
      recipient: 'fail@example.com',
      eventType: 'ORDER_CONFIRMED',
      subject: 'Retry Test',
      payload: {
        to: 'fail@example.com',
        subject: 'Retry Test',
        html: '<p>Retry</p>',
        text: 'Retry',
      },
    });

    // 1st Attempt
    await worker.processNextBatch();
    let job = await prisma.notificationDelivery.findUnique({ where: { id: delivery.id } });
    expect(job?.status).toBe('FAILED');
    expect(job?.attempts).toBe(1);
    expect(job?.lastError).toContain('Bearer [REDACTED]');
    // Backoff for attempt 1 is 30s
    const diff1 = (job!.nextAttemptAt.getTime() - Date.now()) / 1000;
    expect(diff1).toBeGreaterThan(20);
    expect(diff1).toBeLessThanOrEqual(35);

    // Fast-forward nextAttemptAt to make it due for 2nd attempt
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });

    // 2nd Attempt
    await worker.processNextBatch();
    job = await prisma.notificationDelivery.findUnique({ where: { id: delivery.id } });
    expect(job?.status).toBe('FAILED');
    expect(job?.attempts).toBe(2);
    // Backoff for attempt 2 is 120s
    const diff2 = (job!.nextAttemptAt.getTime() - Date.now()) / 1000;
    expect(diff2).toBeGreaterThan(110);
    expect(diff2).toBeLessThanOrEqual(125);

    // Fast-forward nextAttemptAt to make it due for 3rd attempt
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });

    // 3rd Attempt (maxAttempts = 3) -> DEAD_LETTER
    await worker.processNextBatch();
    job = await prisma.notificationDelivery.findUnique({ where: { id: delivery.id } });
    expect(job?.status).toBe('DEAD_LETTER');
    expect(job?.attempts).toBe(3);
  });

  it('recovers abandoned stale-lease jobs in PROCESSING for over 5 minutes', async () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);

    // Job 1: Abandoned with attempts < maxAttempts (attempts = 1)
    const staleJob1 = await prisma.notificationDelivery.create({
      data: {
        channel: 'EMAIL',
        recipient: 'stale1@example.com',
        eventType: 'ORDER_CONFIRMED',
        payload: { to: 'stale1@example.com' },
        status: 'PROCESSING',
        attempts: 1,
        maxAttempts: 3,
        claimedAt: sixMinutesAgo,
        claimedBy: 'dead-worker-pid-999',
      },
    });

    // Job 2: Abandoned with attempts >= maxAttempts (attempts = 3) -> must reach DEAD_LETTER directly (Requirement 5)
    const staleJob2 = await prisma.notificationDelivery.create({
      data: {
        channel: 'EMAIL',
        recipient: 'stale2@example.com',
        eventType: 'ORDER_CONFIRMED',
        payload: { to: 'stale2@example.com' },
        status: 'PROCESSING',
        attempts: 3,
        maxAttempts: 3,
        claimedAt: sixMinutesAgo,
        claimedBy: 'dead-worker-pid-888',
      },
    });

    await worker.recoverStaleLeases();

    const recovered1 = await prisma.notificationDelivery.findUnique({
      where: { id: staleJob1.id },
    });
    expect(recovered1?.status).toBe('FAILED');
    expect(recovered1?.claimedAt).toBeNull();
    expect(recovered1?.lastError).toContain('stale lease');

    const recovered2 = await prisma.notificationDelivery.findUnique({
      where: { id: staleJob2.id },
    });
    expect(recovered2?.status).toBe('DEAD_LETTER');
    expect(recovered2?.claimedAt).toBeNull();
    expect(recovered2?.lastError).toContain('maximum attempts');
  });

  it('ensures two concurrent workers claim disjoint sets of jobs using SKIP LOCKED', async () => {
    const sendSpy = vi.fn().mockImplementation(async () => {
      // Small artificial delay to simulate network call
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    emailService.setTransport({ send: sendSpy });

    // Create 4 pending deliveries
    for (let i = 1; i <= 4; i++) {
      await notificationService.queueEmailDelivery({
        recipient: `batch-${i}@example.com`,
        eventType: 'ORDER_CONFIRMED',
        subject: `Batch ${i}`,
        payload: {
          to: `batch-${i}@example.com`,
          subject: `Batch ${i}`,
          html: `<p>Batch ${i}</p>`,
          text: `Batch ${i}`,
        },
      });
    }

    const workerA = new NotificationWorker({ workerId: 'worker-A' });
    const workerB = new NotificationWorker({ workerId: 'worker-B' });

    // Run both workers concurrently
    const [countA, countB] = await Promise.all([
      workerA.processNextBatch(2),
      workerB.processNextBatch(2),
    ]);

    expect(countA + countB).toBe(4);
    expect(sendSpy).toHaveBeenCalledTimes(4);

    const sentCount = await prisma.notificationDelivery.count({ where: { status: 'SENT' } });
    expect(sentCount).toBe(4);
  });
});
