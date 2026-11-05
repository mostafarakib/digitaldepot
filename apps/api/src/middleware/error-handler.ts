import { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

// Express 5 error handlers still use the 4-argument signature for identification.
// The _next parameter is intentionally unused.
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  logger.error(
    {
      err: { message: err.message, name: err.name, stack: err.stack },
      path: req.path,
      method: req.method,
    },
    'Unhandled error',
  );

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
