import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import v1Router from './routes/index.js';

const app = express();

// CORS — restrict to the trusted frontend origin
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);

// Parse JSON request bodies
app.use(express.json());

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info({ method: req.method, path: req.path }, 'Incoming request');
  next();
});

// API routes
app.use('/api/v1', v1Router);

// 404 — no route matched
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found',
    },
  });
});

// Centralised error handler (must be last)
app.use(errorHandler);

export default app;
