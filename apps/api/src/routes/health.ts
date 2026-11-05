import { type NextFunction, type Request, type Response, Router } from 'express';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

/**
 * GET /api/v1/health
 * Returns API status and database connectivity.
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let databaseStatus: 'connected' | 'disconnected' = 'disconnected';

    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      databaseStatus = 'connected';
    } catch (dbErr) {
      logger.error({ err: dbErr }, 'Database health check failed');
    }

    const isHealthy = databaseStatus === 'connected';

    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      data: {
        status: isHealthy ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        database: databaseStatus,
        version: process.env['npm_package_version'] ?? '0.0.1',
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
