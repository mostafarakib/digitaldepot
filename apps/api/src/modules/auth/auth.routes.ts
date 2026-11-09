import { Router, type Request, type Response, type NextFunction } from 'express';
import { authController } from './auth.controller.js';
import {
  authenticate,
  optionalAuthenticate,
  requireRole,
  requireRecentAuth,
} from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';
import {
  loginIpLimiter,
  loginTargetedLimiter,
  registerLimiter,
  forgotPasswordIpLimiter,
  forgotPasswordTargetedLimiter,
  resetPasswordIpLimiter,
  changePasswordLimiter,
  verifyEmailIpLimiter,
  resendVerificationIpLimiter,
  resendVerificationTargetedLimiter,
  confirmPasswordLimiter,
  setPasswordLimiter,
  oauthReauthLimiter,
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
        emailVerified: false,
        hasPassword: true,
        reauthenticatedAt: null,
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

// POST /api/v1/auth/forgot-password
router.post(
  '/forgot-password',
  csrfProtection,
  forgotPasswordIpLimiter,
  forgotPasswordTargetedLimiter,
  (req, res, next) => {
    authController.forgotPassword(req, res).catch(next);
  },
);

// POST /api/v1/auth/reset-password
router.post('/reset-password', csrfProtection, resetPasswordIpLimiter, (req, res, next) => {
  authController.resetPassword(req, res).catch(next);
});

// POST /api/v1/auth/verify-email
router.post('/verify-email', csrfProtection, verifyEmailIpLimiter, (req, res, next) => {
  authController.verifyEmail(req, res).catch(next);
});

// POST /api/v1/auth/resend-verification
router.post(
  '/resend-verification',
  optionalAuthenticate,
  csrfProtection,
  resendVerificationIpLimiter,
  resendVerificationTargetedLimiter,
  (req, res, next) => {
    authController.resendVerification(req, res).catch(next);
  },
);

// POST /api/v1/auth/change-password
router.post(
  '/change-password',
  authenticate,
  csrfProtection,
  changePasswordLimiter,
  (req, res, next) => {
    authController.changePassword(req, res).catch(next);
  },
);

// POST /api/v1/auth/confirm-password
router.post(
  '/confirm-password',
  authenticate,
  requireRole('CUSTOMER'),
  csrfProtection,
  confirmPasswordLimiter,
  (req, res, next) => {
    authController.confirmPassword(req, res).catch(next);
  },
);

// POST /api/v1/auth/set-password
router.post(
  '/set-password',
  authenticate,
  requireRole('CUSTOMER'),
  csrfProtection,
  requireRecentAuth,
  setPasswordLimiter,
  (req, res, next) => {
    authController.setPassword(req, res).catch(next);
  },
);

// POST /api/v1/auth/oauth/google/reauth
router.post(
  '/oauth/google/reauth',
  authenticate,
  requireRole('CUSTOMER'),
  csrfProtection,
  oauthReauthLimiter,
  (req, res, next) => {
    authController.googleOAuthReauthInitiate(req, res).catch(next);
  },
);

// GET /api/v1/auth/sessions
router.get('/sessions', authenticate, (req, res, next) => {
  authController.listSessions(req, res).catch(next);
});

// DELETE /api/v1/auth/sessions/:id
router.delete('/sessions/:id', authenticate, csrfProtection, (req, res, next) => {
  authController.revokeSession(req, res).catch(next);
});

// POST /api/v1/auth/sessions/revoke-others
router.post('/sessions/revoke-others', authenticate, csrfProtection, (req, res, next) => {
  authController.revokeOtherSessions(req, res).catch(next);
});

// GET /api/v1/auth/oauth/google
router.get('/oauth/google', loginIpLimiter, (req, res, next) => {
  authController.googleOAuthInitiate(req, res).catch(next);
});

// POST /api/v1/auth/oauth/google/callback
router.post('/oauth/google/callback', loginIpLimiter, (req, res, next) => {
  authController.googleOAuthCallback(req, res).catch(next);
});

// POST /api/v1/auth/oauth/google/confirm-link
router.post(
  '/oauth/google/confirm-link',
  csrfProtection,
  loginTargetedLimiter,
  (req, res, next) => {
    authController.googleOAuthConfirmLink(req, res).catch(next);
  },
);

export default router;
