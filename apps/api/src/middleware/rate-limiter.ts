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

export const forgotPasswordIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message:
        'Too many password reset requests from this network. Please try again after 15 minutes.',
    },
  },
});

export const forgotPasswordTargetedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 attempts per IP + normalized email
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
          'Too many password reset requests for this email. Please wait 15 minutes before trying again.',
      },
    });
  },
});

export const resetPasswordIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message:
        'Too many password reset attempts from this network. Please try again after 15 minutes.',
    },
  },
});

export const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per user ID + IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  keyGenerator: (req: Request): string => {
    const userId = req.user?.id || 'anonymous';
    const clientIp = ipKeyGenerator(req.ip || req.socket.remoteAddress || '127.0.0.1');
    return `${clientIp}_${userId}`;
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many password change attempts. Please wait 15 minutes before trying again.',
      },
    });
  },
});

export const verifyEmailIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 verification attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message:
        'Too many email verification attempts from this network. Please try again after 15 minutes.',
    },
  },
});

export const resendVerificationIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message:
        'Too many verification email requests from this network. Please try again after 15 minutes.',
    },
  },
});

export const resendVerificationTargetedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 requests per IP + recipient email
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  keyGenerator: (req: Request): string => {
    // Authenticated request: strictly req.user.email, completely ignoring body email
    const email = req.user?.email
      ? req.user.email.toLowerCase()
      : typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : 'unknown';
    const clientIp = ipKeyGenerator(req.ip || req.socket.remoteAddress || '127.0.0.1');
    return `${clientIp}_${email}`;
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message:
          'Too many verification email requests for this account. Please wait 15 minutes before trying again.',
      },
    });
  },
});
