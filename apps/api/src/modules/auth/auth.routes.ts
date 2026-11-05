import { Router, type Request, type Response, type NextFunction } from 'express';
import { authController } from './auth.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';
import {
  loginIpLimiter,
  loginTargetedLimiter,
  registerLimiter,
} from '../../middleware/rate-limiter.js';
import { verifyAccessToken } from '../../lib/crypto.js';
import { COOKIE_NAMES } from '../../lib/cookies.js';
import type { AuthenticatedUser } from '../../types/express.js';

const router = Router();

/**
 * Optional authentication middleware for logout: extracts sessionId if access token is valid,
 * but allows execution to continue to logout handler even if access token has expired.
 */
async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    let token = req.cookies?.[COOKIE_NAMES.ACCESS_TOKEN];
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.substring(7);
    }
    if (token) {
      const payload = await verifyAccessToken(token);
      req.user = {
        id: payload.sub,
        sessionId: payload.sid,
        email: '',
        role: 'CUSTOMER',
        profile: null,
      } satisfies AuthenticatedUser;
    }
  } catch {
    // Access token expired or invalid; authController.logout will fall back to refresh cookie
  }
  next();
}

// GET /api/v1/auth/csrf
router.get('/csrf', (req, res, next) => {
  authController.getCsrf(req, res).catch(next);
});

// POST /api/v1/auth/register
router.post('/register', csrfProtection, registerLimiter, (req, res, next) => {
  authController.register(req, res).catch(next);
});

// POST /api/v1/auth/login
router.post('/login', csrfProtection, loginIpLimiter, loginTargetedLimiter, (req, res, next) => {
  authController.login(req, res).catch(next);
});

// POST /api/v1/auth/logout
router.post('/logout', csrfProtection, optionalAuth, (req, res, next) => {
  authController.logout(req, res).catch(next);
});

// POST /api/v1/auth/refresh
router.post('/refresh', csrfProtection, (req, res, next) => {
  authController.refresh(req, res).catch(next);
});

// GET /api/v1/auth/me
router.get('/me', authenticate, (req, res, next) => {
  authController.me(req, res).catch(next);
});

export default router;
