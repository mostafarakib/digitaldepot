import app from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { pool, prisma } from './lib/prisma.js';
import { notificationWorker } from './modules/notification/notification.worker.js';
import { reservationCleanupWorker } from './modules/order/reservation-cleanup.worker.js';

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, '🚀 API server started');
  // Start background workers
  notificationWorker.start();
  reservationCleanupWorker.start();
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received, closing server gracefully');
  notificationWorker.stop();
  const stopCleanupPromise = reservationCleanupWorker.stop();
  server.close(async () => {
    await stopCleanupPromise;
    await prisma.$disconnect();
    await pool.end();
    logger.info('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
