import type { Request, Response } from 'express';
import { authService } from './auth.service.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  revokeSessionParamsSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} from './auth.schemas.js';
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

  /**
   * POST /api/v1/auth/forgot-password
   * Requests a password reset link. Always returns generic success response.
   */
  async forgotPassword(req: Request, res: Response): Promise<void> {
    const input = forgotPasswordSchema.parse(req.body);
    const result = await authService.forgotPassword(input);

    res.json({
      success: true,
      data: {
        message: result.message,
      },
    });
  }

  /**
   * POST /api/v1/auth/reset-password
   * Resets password using single-use token, revokes active sessions, and rotates CSRF.
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    const input = resetPasswordSchema.parse(req.body);
    const result = await authService.resetPassword(input);

    // Clear stale auth cookies
    clearAuthCookies(res);

    // Rotate CSRF token across boundary
    const csrfToken = rotateCsrfToken(res);

    res.json({
      success: true,
      data: {
        message: result.message,
        csrfToken,
      },
    });
  }

  /**
   * POST /api/v1/auth/change-password
   * Authenticated password change, revoking other sessions and rotating current refresh token.
   */
  async changePassword(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const input = changePasswordSchema.parse(req.body);
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'];
    const rawRefreshToken = req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN];

    const result = await authService.changePassword(
      req.user.id,
      req.user.sessionId,
      rawRefreshToken,
      input,
      clientIp,
      userAgent,
    );

    if (result.sessionPreserved && result.tokens) {
      setAuthCookies(res, result.tokens);
      rotateCsrfToken(res);
      res.json({
        success: true,
        data: {
          message: 'Password changed successfully. Other active sessions have been signed out.',
        },
      });
    } else {
      clearAuthCookies(res);
      rotateCsrfToken(res);
      res.json({
        success: true,
        data: {
          message: input.revokeAllSessions
            ? 'Password changed successfully. All sessions have been signed out.'
            : 'Password changed successfully. Your session could not be renewed and you must log in again.',
        },
      });
    }
  }

  /**
   * GET /api/v1/auth/sessions
   * Lists active sessions for the authenticated user.
   */
  async listSessions(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const sessions = await authService.listSessions(req.user.id, req.user.sessionId);

    res.json({
      success: true,
      data: {
        sessions,
      },
    });
  }

  /**
   * DELETE /api/v1/auth/sessions/:id
   * Revokes a specific session belonging to the authenticated user.
   */
  async revokeSession(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const { id } = revokeSessionParamsSchema.parse(req.params);
    const result = await authService.revokeSession(req.user.id, req.user.sessionId, id);

    if (result.isCurrentSession) {
      clearAuthCookies(res);
      rotateCsrfToken(res);
      res.json({
        success: true,
        data: {
          message: 'Current session revoked successfully',
          isCurrentSession: true,
        },
      });
    } else {
      res.json({
        success: true,
        data: {
          message: 'Session revoked successfully',
          isCurrentSession: false,
        },
      });
    }
  }

  /**
   * POST /api/v1/auth/sessions/revoke-others
   * Revokes all active sessions for the user except the calling session.
   */
  async revokeOtherSessions(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const result = await authService.revokeOtherSessions(req.user.id, req.user.sessionId);

    rotateCsrfToken(res);

    res.json({
      success: true,
      data: {
        message: 'All other sessions have been revoked',
        revokedCount: result.revokedCount,
      },
    });
  }

  /**
   * POST /api/v1/auth/verify-email
   * Verifies customer email address using single-use security token.
   */
  async verifyEmail(req: Request, res: Response): Promise<void> {
    const input = verifyEmailSchema.parse(req.body);
    const result = await authService.verifyEmail(input);

    rotateCsrfToken(res);

    res.status(200).json({
      success: true,
      data: {
        message: result.message,
        emailVerified: result.emailVerified,
      },
    });
  }

  /**
   * POST /api/v1/auth/resend-verification
   * Resends verification email for unverified accounts.
   */
  async resendVerification(req: Request, res: Response): Promise<void> {
    const input = resendVerificationSchema.parse(req.body);
    const authenticatedUserId = req.user?.id;
    const result = await authService.resendVerification(input, authenticatedUserId);

    rotateCsrfToken(res);

    res.status(200).json({
      success: true,
      data: {
        message: result.message,
      },
    });
  }
}

export const authController = new AuthController();
