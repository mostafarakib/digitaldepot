import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';

// In test environment, skip rate limiting unless specifically testing rate limiters
const shouldSkip = (req: Request): boolean =>
  process.env.NODE_ENV === 'test' && req.headers['x-test-rate-limit'] !== 'true';

export const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many login attempts from this network. Please try again after 15 minutes.',
    },
  },
});

export const loginTargetedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per IP + normalized email
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  keyGenerator: (req: Request): string => {
    const email =
      typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : 'unknown';
    const clientIp = ipKeyGenerator(req.ip || req.socket.remoteAddress || '127.0.0.1');
    return `${clientIp}_${email}`;
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message:
          'Too many failed login attempts for this account. Please wait 15 minutes or reset your password.',
      },
    });
  },
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many accounts registered from this network. Please try again later.',
    },
  },
});
