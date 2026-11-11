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
  oauthInitiateQuerySchema,
  oauthCallbackSchema,
  confirmLinkSchema,
  confirmPasswordSchema,
  setPasswordSchema,
  oauthReauthSchema,
} from './auth.schemas.js';
import {
  setAuthCookies,
  clearAuthCookies,
  setOAuthStateCookie,
  clearOAuthStateCookie,
  setOAuthLinkCookie,
  clearOAuthLinkCookie,
  clearGuestCartCookie,
  COOKIE_NAMES,
} from '../../lib/cookies.js';
import { cartService } from '../cart/cart.service.js';
import { rotateCsrfToken } from '../../middleware/csrf.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../lib/errors.js';
import { isValidPrefix } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';

export class AuthController {
  /**
   * GET /api/v1/auth/csrf
   * Issues/rotates the signed double-submit CSRF token.
   */
  async getCsrf(_req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
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

    // Safely attempt guest cart merging if a guest cart cookie is present
    const rawGuestCartToken = req.cookies?.[COOKIE_NAMES.GUEST_CART];
    if (rawGuestCartToken && typeof rawGuestCartToken === 'string') {
      try {
        await cartService.mergeGuestCart(result.user.id, rawGuestCartToken);
        clearGuestCartCookie(res);
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : err, userId: result.user.id },
          'Guest cart merging failed during login; preserving guest cookie for retry',
        );
      }
    }

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

  /**
   * GET /api/v1/auth/oauth/google
   * Initiates Google OAuth flow, issuing unique per-transaction state cookie.
   */
  async googleOAuthInitiate(req: Request, res: Response): Promise<void> {
    const query = oauthInitiateQuerySchema.parse(req.query);
    const { authUrl, statePrefix, hmac } = await authService.initiateGoogleOAuth(query.returnUrl);

    setOAuthStateCookie(res, statePrefix, hmac);

    if (req.headers.accept?.includes('application/json') || req.query['format'] === 'json') {
      res.json({
        success: true,
        data: {
          authUrl,
          statePrefix,
        },
      });
      return;
    }

    res.redirect(authUrl);
  }

  /**
   * POST /api/v1/auth/oauth/google/callback
   * Handles Google OAuth callback, verifying state cookie and claims.
   */
  async googleOAuthCallback(req: Request, res: Response): Promise<void> {
    const body = oauthCallbackSchema.parse(req.body);
    const statePrefix = body.state.slice(0, 16);

    if (!isValidPrefix(statePrefix)) {
      throw new BadRequestError('INVALID_OAUTH_STATE', 'Invalid OAuth state prefix');
    }

    const cookieHmac = req.cookies?.[`dd_oauth_${statePrefix}`];

    let callerToken = req.cookies?.[COOKIE_NAMES.ACCESS_TOKEN];
    if (!callerToken) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        callerToken = authHeader.substring(7);
      }
    }

    try {
      const outcome = await authService.handleGoogleCallback({
        code: body.code,
        rawState: body.state,
        cookieHmac,
        ip: req.ip ?? '127.0.0.1',
        userAgent: req.headers['user-agent'],
        callerToken,
      });

      clearOAuthStateCookie(res, outcome.statePrefix);

      if (outcome.status === 'REAUTHENTICATED') {
        res.json({
          success: true,
          data: {
            status: 'REAUTHENTICATED',
            returnUrl: outcome.returnUrl,
          },
        });
        return;
      }

      if (outcome.status === 'LINKED') {
        res.json({
          success: true,
          data: {
            status: 'LINKED',
            returnUrl: outcome.returnUrl,
          },
        });
        return;
      }

      if (outcome.status === 'LINK_REQUIRED') {
        setOAuthLinkCookie(res, outcome.challengePrefix, outcome.rawChallengeToken);
        rotateCsrfToken(res);

        res.json({
          success: true,
          data: {
            status: 'LINK_REQUIRED',
            challengePrefix: outcome.challengePrefix,
            returnUrl: outcome.returnUrl,
          },
        });
        return;
      }

      setAuthCookies(res, {
        accessToken: outcome.accessToken,
        refreshToken: outcome.refreshToken,
      });

      // Safely attempt guest cart merging if a guest cart cookie is present
      const rawGuestCartToken = req.cookies?.[COOKIE_NAMES.GUEST_CART];
      if (rawGuestCartToken && typeof rawGuestCartToken === 'string') {
        try {
          await cartService.mergeGuestCart(outcome.user.id, rawGuestCartToken);
          clearGuestCartCookie(res);
        } catch (err) {
          logger.error(
            { err: err instanceof Error ? err.message : err, userId: outcome.user.id },
            'Guest cart merging failed during Google OAuth authentication; preserving guest cookie for retry',
          );
        }
      }

      rotateCsrfToken(res);

      res.json({
        success: true,
        data: {
          status: 'AUTHENTICATED',
          user: {
            id: outcome.user.id,
            email: outcome.user.email,
            role: outcome.user.role,
            emailVerified: outcome.user.emailVerified,
            profile: outcome.user.profile,
          },
          returnUrl: outcome.returnUrl,
        },
      });
    } catch (error) {
      clearOAuthStateCookie(res, statePrefix);
      throw error;
    }
  }

  /**
   * POST /api/v1/auth/oauth/google/confirm-link
   * Verifies password for existing account and links Google identity.
   */
  async googleOAuthConfirmLink(req: Request, res: Response): Promise<void> {
    const body = confirmLinkSchema.parse(req.body);
    const challengePrefix = body.challengePrefix;

    const rawToken = req.cookies?.[`dd_link_${challengePrefix}`];
    if (!rawToken || typeof rawToken !== 'string') {
      throw new UnauthorizedError(
        'INVALID_LINK_CHALLENGE',
        'Link challenge cookie missing or invalid',
      );
    }

    const outcome = await authService.confirmGoogleLink(
      challengePrefix,
      rawToken,
      body.password,
      req.ip ?? '127.0.0.1',
      req.headers['user-agent'],
    );

    if (outcome.status === 'CHALLENGE_EXPIRED_OR_NOT_FOUND') {
      clearOAuthLinkCookie(res, challengePrefix);
      throw new BadRequestError(
        'LINK_CHALLENGE_EXPIRED',
        'Link challenge has expired or is invalid',
      );
    }

    if (outcome.status === 'USER_NOT_FOUND') {
      clearOAuthLinkCookie(res, challengePrefix);
      throw new NotFoundError('USER_NOT_FOUND', 'User account not found');
    }

    if (outcome.status === 'ACCOUNT_SUSPENDED') {
      clearOAuthLinkCookie(res, challengePrefix);
      throw new ForbiddenError(
        'ACCOUNT_SUSPENDED',
        'Your account has been suspended. Please contact customer support.',
      );
    }

    if (outcome.status === 'IDENTITY_CONFLICT') {
      clearOAuthLinkCookie(res, challengePrefix);
      throw new ConflictError(
        'OAUTH_PROVIDER_IDENTITY_CONFLICT',
        'This Google account is already linked to another user',
      );
    }

    if (outcome.status === 'NO_PASSWORD') {
      clearOAuthLinkCookie(res, challengePrefix);
      throw new BadRequestError('NO_PASSWORD_SET', 'Account does not have a password configured');
    }

    if (outcome.status === 'MAX_ATTEMPTS_EXCEEDED') {
      clearOAuthLinkCookie(res, challengePrefix);
      throw new BadRequestError(
        'MAX_ATTEMPTS_EXCEEDED',
        'Too many failed password attempts. Link challenge has been invalidated. Please sign in again.',
      );
    }

    if (outcome.status === 'INVALID_CREDENTIALS') {
      // Retain cookie for attempts 1-4
      throw new UnauthorizedError(
        'INVALID_CREDENTIALS',
        `Invalid password. ${outcome.remainingAttempts} attempts remaining.`,
      );
    }

    clearOAuthLinkCookie(res, challengePrefix);
    setAuthCookies(res, {
      accessToken: outcome.accessToken,
      refreshToken: outcome.refreshToken,
    });
    rotateCsrfToken(res);

    res.json({
      success: true,
      data: {
        status: 'AUTHENTICATED',
        user: {
          id: outcome.user.id,
          email: outcome.user.email,
          role: outcome.user.role,
          emailVerified: outcome.user.emailVerified,
          profile: outcome.user.profile,
        },
      },
    });
  }

  /**
   * POST /api/v1/auth/confirm-password
   * Confirms current password to establish recent-authentication freshness.
   */
  async confirmPassword(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const body = confirmPasswordSchema.parse(req.body);
    const outcome = await authService.confirmPassword(
      req.user.id,
      req.user.sessionId,
      body.password,
    );

    res.json({
      success: true,
      data: outcome,
    });
  }

  /**
   * POST /api/v1/auth/set-password
   * Sets initial password for OAuth-only accounts.
   */
  async setPassword(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const body = setPasswordSchema.parse(req.body);
    const outcome = await authService.setPassword(req.user.id, req.user.sessionId, body.password);

    res.json({
      success: true,
      data: outcome,
    });
  }

  /**
   * POST /api/v1/auth/oauth/google/reauth
   * Initiates dedicated Google OAuth re-authentication for active sessions.
   */
  async googleOAuthReauthInitiate(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const body = oauthReauthSchema.parse(req.body || {});
    const outcome = await authService.initiateGoogleOAuthReauth(
      req.user.id,
      req.user.sessionId,
      body.returnUrl,
    );

    setOAuthStateCookie(res, outcome.statePrefix, outcome.hmac);

    if (req.headers.accept?.includes('application/json') || req.query['format'] === 'json') {
      res.json({
        success: true,
        data: {
          authUrl: outcome.authUrl,
        },
      });
      return;
    }

    res.redirect(outcome.authUrl);
  }
}

export const authController = new AuthController();
