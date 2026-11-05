import type { Request, Response } from 'express';
import { authService } from './auth.service.js';
import { registerSchema, loginSchema } from './auth.schemas.js';
import { setAuthCookies, clearAuthCookies, COOKIE_NAMES } from '../../lib/cookies.js';
import { rotateCsrfToken } from '../../middleware/csrf.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export class AuthController {
  /**
   * GET /api/v1/auth/csrf
   * Issues/rotates the signed double-submit CSRF token.
   */
  async getCsrf(_req: Request, res: Response): Promise<void> {
    const csrfToken = rotateCsrfToken(res);
    res.json({
      success: true,
      data: {
        csrfToken,
      },
    });
  }

  /**
   * POST /api/v1/auth/register
   * Registers customer with email, password, and names without auto-logging in.
   */
  async register(req: Request, res: Response): Promise<void> {
    const input = registerSchema.parse(req.body);
    const result = await authService.register(input);

    // Rotate CSRF token across boundary
    const csrfToken = rotateCsrfToken(res);

    res.status(201).json({
      success: true,
      data: {
        message: result.message,
        userId: result.userId,
        csrfToken,
      },
    });
  }

  /**
   * POST /api/v1/auth/login
   * Authenticates user, creates session, sets HttpOnly cookies, and rotates CSRF.
   */
  async login(req: Request, res: Response): Promise<void> {
    const input = loginSchema.parse(req.body);
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'];

    const result = await authService.login(input, clientIp, userAgent);

    setAuthCookies(res, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });

    const csrfToken = rotateCsrfToken(res);

    res.json({
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          emailVerified: result.user.emailVerified,
          profile: result.user.profile
            ? {
                firstName: result.user.profile.firstName,
                lastName: result.user.profile.lastName,
                phone: result.user.profile.phone,
                avatarUrl: result.user.profile.avatarUrl,
              }
            : null,
        },
        csrfToken,
      },
    });
  }

  /**
   * POST /api/v1/auth/logout
   * Revokes session via PostgreSQL row locking, clears all auth cookies, and rotates CSRF.
   */
  async logout(req: Request, res: Response): Promise<void> {
    const sessionId = req.user?.sessionId;
    const refreshToken = req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN];

    await authService.logout(sessionId, refreshToken);

    clearAuthCookies(res);
    const csrfToken = rotateCsrfToken(res);

    res.json({
      success: true,
      data: {
        message: 'Logged out successfully',
        csrfToken,
      },
    });
  }

  /**
   * POST /api/v1/auth/refresh
   * Executes atomic refresh-token rotation, handles concurrency grace window, and enforces replay revocation.
   */
  async refresh(req: Request, res: Response): Promise<void> {
    const rawToken = req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN];

    if (!rawToken || typeof rawToken !== 'string') {
      clearAuthCookies(res);
      throw new UnauthorizedError('REFRESH_TOKEN_REQUIRED', 'Refresh token is required');
    }

    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'];

    const outcome = await authService.rotateRefreshToken(rawToken, clientIp, userAgent);

    switch (outcome.status) {
      case 'SUCCESS': {
        setAuthCookies(res, {
          accessToken: outcome.accessToken,
          refreshToken: outcome.refreshToken,
        });
        res.json({
          success: true,
          data: {
            message: 'Session refreshed successfully',
          },
        });
        return;
      }

      case 'ALREADY_ROTATED_GRACE': {
        // Concurrency Grace Window: DO NOT clear cookies; client will retry with the updated cookie
        res.status(401).json({
          success: false,
          error: {
            code: 'REFRESH_ALREADY_ROTATED',
            message: 'Token was recently rotated; retry with updated cookie',
          },
        });
        return;
      }

      case 'REUSE_REVOKED': {
        clearAuthCookies(res);
        logger.warn(
          {
            userId: outcome.userId,
            familyId: outcome.familyId,
            ip: clientIp,
          },
          'Security alert: refresh token reuse detected. Session and token family revoked.',
        );
        res.status(401).json({
          success: false,
          error: {
            code: 'TOKEN_REUSE_DETECTED',
            message:
              'Security violation: token reuse detected. All active sessions have been terminated.',
          },
        });
        return;
      }

      case 'USER_SUSPENDED': {
        clearAuthCookies(res);
        res.status(403).json({
          success: false,
          error: {
            code: 'ACCOUNT_SUSPENDED',
            message: 'Your account has been suspended',
          },
        });
        return;
      }

      case 'INVALID_TOKEN':
      case 'SESSION_REVOKED_OR_EXPIRED':
      case 'TOKEN_EXPIRED':
      default: {
        clearAuthCookies(res);
        res.status(401).json({
          success: false,
          error: {
            code: outcome.status,
            message: 'Session is invalid or has expired',
          },
        });
        return;
      }
    }
  }

  /**
   * GET /api/v1/auth/me
   * Returns current authenticated user identity and database role.
   */
  async me(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    res.json({
      success: true,
      data: {
        user: req.user,
      },
    });
  }
}

export const authController = new AuthController();
