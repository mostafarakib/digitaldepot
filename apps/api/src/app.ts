import cors from 'cors';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import v1Router from './routes/index.js';

const app = express();

// Safeguard 10: Configure trust proxy safely and precisely
// In dev: 'loopback'. In production behind 1 reverse proxy: 1.
app.set('trust proxy', env.TRUST_PROXY === 'loopback' ? 'loopback' : Number(env.TRUST_PROXY) || 1);

// CORS — restrict to the trusted frontend origin with credentials
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
    exposedHeaders: ['x-csrf-token'],
  }),
);

// Cookie parsing
app.use(cookieParser());

// Parse JSON request bodies
app.use(express.json());

// Parse URL-encoded request bodies (for payment gateway callbacks)
app.use(express.urlencoded({ extended: true }));

// Request logging (sanitized by Pino redaction)
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
