import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
  generateOpaqueToken,
  hashToken,
  signAccessToken,
  verifyAccessToken,
  encryptGcm,
  decryptGcm,
  generatePkce,
  generateOAuthState,
  verifyOAuthStateHmac,
  isValidPrefix,
} from '../../lib/crypto.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { parseUserAgent, maskIp, type ParsedUserAgent } from '../../lib/user-agent.js';
import { securityTokenService } from './security-token.service.js';
import { emailService } from '../email/email.service.js';
import { googleOAuthService } from './google-oauth.service.js';
import { env } from '../../config/env.js';
import {
  OAUTH_PROVIDER_GOOGLE,
  isAuthenticationFresh,
  DEFAULT_OAUTH_RETURN_URL,
} from './auth.constants.js';
import { validateSafeReturnUrl } from './auth.schemas.js';
import type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
  VerifyEmailInput,
  ResendVerificationInput,
} from './auth.schemas.js';
import {
  Prisma,
  type Session,
  type User,
  type CustomerProfile,
  type OAuthAction,
} from '../../generated/client/client.js';

function isPrismaP2002Error(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return true;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  ) {
    return true;
  }
  return false;
}

function isP2002Target(
  error: Prisma.PrismaClientKnownRequestError | { code: 'P2002'; meta?: Record<string, unknown> },
  fields: string[],
  constraints: string[],
): boolean {
  const meta = error.meta;
  if (!meta) return false;

  const target = meta['target'];
  if (Array.isArray(target)) {
    if (fields.length > 0 && fields.every((f) => target.includes(f))) {
      return true;
    }
  } else if (typeof target === 'string') {
    if (fields.some((f) => target.includes(f)) || constraints.some((c) => target.includes(c))) {
      return true;
    }
  }

  const constraint = meta['constraint'];
  if (typeof constraint === 'string') {
    if (
      constraints.some((c) => constraint.includes(c)) ||
      fields.some((f) => constraint.includes(f))
    ) {
      return true;
    }
  }

  return false;
}

export interface ExecuteRefreshTokenRotationParams {
  tokenHash: string;
  ip?: string;
  userAgent?: string;
  expectedSessionId?: string;
}

export interface SessionItem {
  id: string;
  isCurrent: boolean;
  device: ParsedUserAgent;
  ipAddress: string;
  lastActiveAt: string;
  createdAt: string;
}

export type RefreshOutcome =
  | { status: 'SUCCESS'; accessToken: string; refreshToken: string; session: Session }
  | { status: 'INVALID_TOKEN' }
  | { status: 'SESSION_REVOKED_OR_EXPIRED' }
  | { status: 'USER_SUSPENDED' }
  | { status: 'TOKEN_EXPIRED' }
  | { status: 'ALREADY_ROTATED_GRACE'; graceRemainingMs: number }
  | { status: 'REUSE_REVOKED'; familyId: string; userId: string };

export class AuthService {
  /**
   * Registers a new customer account. Does not issue a session (login is explicit).
   */
  async register(input: RegisterInput): Promise<{ message: string; userId: string }> {
    const normalizedEmail = input.email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictError(
        'EMAIL_ALREADY_EXISTS',
        'An account with this email address already exists',
      );
    }

    const passwordHash = await hashPassword(input.password);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: 'CUSTOMER',
          status: 'ACTIVE',
        },
      });

      await tx.customerProfile.create({
        data: {
          userId: user.id,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
        },
      });

      // Issue email verification token within the same transaction using caller-owned tx
      const tokenResult = await securityTokenService.createToken(
        user.id,
        'EMAIL_VERIFICATION',
        24 * 60 * 60 * 1000,
        tx,
      );

      return {
        user,
        rawToken: tokenResult.rawToken,
      };
    });

    // Dispatch email ONLY AFTER the transaction has committed.
    // Email delivery failure must NOT roll back account creation.
    try {
      await emailService.sendVerificationEmail({
        to: result.user.email,
        name: `${input.firstName} ${input.lastName}`.trim(),
        token: result.rawToken,
        locale: input.locale,
      });
    } catch (error) {
      logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
          userId: result.user.id,
        },
        'Failed to deliver verification email after registration',
      );
    }

    return {
      message: 'Registration successful. Please log in.',
      userId: result.user.id,
    };
  }

  /**
   * Authenticates email & password, verifying credentials with constant timing,
   * checking password before revealing suspended status, and creating a session.
   */
  async login(
    input: LoginInput,
    ip: string,
    userAgent?: string,
  ): Promise<{
    user: User & { profile: CustomerProfile | null };
    session: Session;
    accessToken: string;
    refreshToken: string;
  }> {
    const normalizedEmail = input.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: true },
    });

    // Safeguard 8: Constant-time dummy verification for unknown email or OAuth-only accounts
    if (!user || user.passwordHash === null) {
      await verifyDummyPassword(input.password);
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const isPasswordValid = await verifyPassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'Invalid email or password');
    }

    // Safeguard 9: Verify password before revealing suspended account status
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenError(
        'ACCOUNT_SUSPENDED',
        'Your account has been suspended. Please contact customer support.',
      );
    }

    const now = new Date();
    const sessionExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const refreshExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const rawRefreshToken = generateOpaqueToken();
    const tokenHash = hashToken(rawRefreshToken);
    const familyId = crypto.randomUUID();

    const { session } = await prisma.$transaction(async (tx) => {
      const newSession = await tx.session.create({
        data: {
          userId: user.id,
          userAgent: userAgent ?? null,
          ipAddress: ip,
          expiresAt: sessionExpiresAt,
          reauthenticatedAt: now,
          lastUsedAt: now,
        },
      });

      await tx.refreshToken.create({
        data: {
          sessionId: newSession.id,
          familyId,
          tokenHash,
          expiresAt: refreshExpiresAt,
        },
      });

      return { session: newSession };
    });

    const accessToken = await signAccessToken({
      sub: user.id,
      sid: session.id,
    });

    return {
      user,
      session,
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  /**
   * Rotates a refresh token within a caller-provided database transaction.
   * Shared helper used by both refresh and password change.
   * Preserves session locking, conditional consumption, replay detection, 10s grace window,
   * and absolute session-expiry bounding without nested transactions.
   */
  async executeRefreshTokenRotation(
    tx: Prisma.TransactionClient,
    params: ExecuteRefreshTokenRotationParams,
  ): Promise<RefreshOutcome> {
    // Step 1: Initial token lookup to identify the session
    const initialToken = await tx.refreshToken.findUnique({
      where: { tokenHash: params.tokenHash },
    });

    if (!initialToken) {
      return { status: 'INVALID_TOKEN' as const };
    }

    if (params.expectedSessionId && initialToken.sessionId !== params.expectedSessionId) {
      return { status: 'INVALID_TOKEN' as const };
    }

    // Step 2: Acquire session-level row lock in PostgreSQL
    await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${initialToken.sessionId} FOR UPDATE`;

    // Step 3: Re-read fresh Session and RefreshToken records under the row lock
    const session = await tx.session.findUnique({
      where: { id: initialToken.sessionId },
      include: { user: true },
    });
    const token = await tx.refreshToken.findUnique({
      where: { id: initialToken.id },
    });

    if (!session || !token) {
      return { status: 'INVALID_TOKEN' as const };
    }

    // Step 4: Validate session state and user status
    if (session.revokedAt !== null || session.expiresAt <= new Date()) {
      return { status: 'SESSION_REVOKED_OR_EXPIRED' as const };
    }

    if (session.user.status !== 'ACTIVE') {
      return { status: 'USER_SUSPENDED' as const };
    }

    if (token.revokedAt !== null) {
      return { status: 'SESSION_REVOKED_OR_EXPIRED' as const };
    }

    // Step 5: Check consumption status (Concurrency Grace Window vs Replay Attack)
    if (token.consumedAt !== null) {
      const elapsedMs = Date.now() - token.consumedAt.getTime();
      if (elapsedMs <= 10000) {
        // Concurrency Grace Window: Token was rotated within 10s by another request.
        // DO NOT issue a new token. DO NOT revoke the session.
        return { status: 'ALREADY_ROTATED_GRACE' as const, graceRemainingMs: 10000 - elapsedMs };
      }

      // Replay Attack (> 10s): Revoke entire session and token family.
      // COMMIT THIS UPDATE! Do NOT throw an exception inside the transaction.
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), revokedReason: 'TOKEN_REUSE_DETECTED' },
      });
      await tx.refreshToken.updateMany({
        where: {
          sessionId: session.id,
          familyId: token.familyId,
        },
        data: { revokedAt: new Date() },
      });

      return {
        status: 'REUSE_REVOKED' as const,
        familyId: token.familyId,
        userId: session.userId,
      };
    }

    // Step 6: Validate token instance expiration
    if (token.expiresAt <= new Date()) {
      return { status: 'TOKEN_EXPIRED' as const };
    }

    // Step 7: Conditional token consumption
    const now = new Date();
    const consumeResult = await tx.refreshToken.updateMany({
      where: {
        id: token.id,
        consumedAt: null,
        revokedAt: null,
      },
      data: {
        consumedAt: now,
      },
    });

    if (consumeResult.count === 0) {
      // Concurrency collision: another parallel transaction consumed it
      return { status: 'ALREADY_ROTATED_GRACE' as const, graceRemainingMs: 10000 };
    }

    const newRawToken = generateOpaqueToken();
    const newTokenHash = hashToken(newRawToken);
    const newExpiresAt = new Date(
      Math.min(now.getTime() + 7 * 24 * 60 * 60 * 1000, session.expiresAt.getTime()),
    );

    await tx.refreshToken.create({
      data: {
        sessionId: session.id,
        familyId: token.familyId,
        tokenHash: newTokenHash,
        expiresAt: newExpiresAt,
      },
    });

    const updatedSession = await tx.session.update({
      where: { id: session.id },
      data: {
        lastUsedAt: now,
        ...(params.ip ? { ipAddress: params.ip } : {}),
        ...(params.userAgent ? { userAgent: params.userAgent } : {}),
      },
    });

    const newAccessToken = await signAccessToken({ sub: session.userId, sid: session.id });

    return {
      status: 'SUCCESS' as const,
      accessToken: newAccessToken,
      refreshToken: newRawToken,
      session: updatedSession,
    };
  }

  /**
   * Rotates a refresh token using session-level row locking and conditional consumption.
   * Never throws inside transaction when revoking to ensure revocation commits.
   */
  async rotateRefreshToken(
    rawToken: string,
    ip: string,
    userAgent?: string,
  ): Promise<RefreshOutcome> {
    const tokenHash = hashToken(rawToken);

    return await prisma.$transaction(async (tx) => {
      return await this.executeRefreshTokenRotation(tx, {
        tokenHash,
        ip,
        userAgent,
      });
    });
  }

  /**
   * Revokes a session using PostgreSQL row locking to guarantee serial ordering against refresh.
   */
  async logout(sessionId?: string, rawRefreshToken?: string): Promise<void> {
    let targetSessionId = sessionId;

    if (!targetSessionId && rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      const token = await prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: { sessionId: true },
      });
      if (token) {
        targetSessionId = token.sessionId;
      }
    }

    if (!targetSessionId) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      // Session-level row lock
      await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${targetSessionId} FOR UPDATE`;

      const session = await tx.session.findUnique({
        where: { id: targetSessionId },
      });

      if (!session || session.revokedAt !== null) {
        return;
      }

      const now = new Date();
      await tx.session.update({
        where: { id: targetSessionId },
        data: {
          revokedAt: now,
          revokedReason: 'LOGOUT',
        },
      });

      await tx.refreshToken.updateMany({
        where: { sessionId: targetSessionId },
        data: {
          revokedAt: now,
        },
      });
    });
  }

  /**
   * Initiates a password reset request.
   * Anti-enumeration: Always returns a generic success message regardless of whether
   * the email exists, is unknown, or is suspended. No Argon2 dummy hash is run to avoid DoS.
   */
  async forgotPassword(input: ForgotPasswordInput): Promise<{ message: string }> {
    const genericMessage =
      'If an account with that email address exists, a password reset link has been sent.';
    const normalizedEmail = input.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      return { message: genericMessage };
    }

    // Under User row lock, issue token (invalidating prior unconsumed tokens for (userId, PASSWORD_RESET))
    const tokenResult = await prisma.$transaction(async (tx) => {
      // Step 1: User row lock
      const userRows = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status FROM "User" WHERE id = ${user.id} FOR UPDATE
      `;

      // Refinement 2: Recheck account status under lock
      if (userRows.length === 0 || userRows[0].status !== 'ACTIVE') {
        return null;
      }

      return await securityTokenService.createToken(
        user.id,
        'PASSWORD_RESET',
        60 * 60 * 1000, // 1 hour expiration
        tx,
      );
    });

    // Dispatch email ONLY AFTER the transaction has committed
    if (tokenResult) {
      try {
        const name = user.profile
          ? `${user.profile.firstName} ${user.profile.lastName}`.trim()
          : 'Customer';

        await emailService.sendPasswordResetEmail({
          to: user.email,
          name,
          token: tokenResult.rawToken,
          locale: input.locale,
        });
      } catch (error) {
        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            userId: user.id,
          },
          'Failed to deliver password reset email',
        );
      }
    }

    return { message: genericMessage };
  }

  /**
   * Resets password using a validated single-use security token.
   *
   * Refinement 1: Computes Argon2id password hash BEFORE opening the transaction.
   * Refinement 4: All active sessions and refresh tokens are revoked; subsequent authenticated
   * requests are rejected by authenticate middleware. (Already-authorized in-flight requests cannot be cancelled).
   * Lock hierarchy: User -> Session(s) (ordered by ID) -> Token mutations.
   */
  async resetPassword(input: ResetPasswordInput): Promise<{ message: string }> {
    const tokenHash = hashToken(input.token);
    const now = new Date();

    // Step 1: Pre-lookup token without locking
    const initialToken = await prisma.securityToken.findUnique({
      where: { tokenHash },
    });

    if (
      !initialToken ||
      initialToken.type !== 'PASSWORD_RESET' ||
      initialToken.consumedAt !== null ||
      initialToken.expiresAt <= now
    ) {
      throw new BadRequestError(
        'INVALID_OR_EXPIRED_TOKEN',
        'Password reset link is invalid or has expired',
      );
    }

    // Step 2: Compute Argon2id password hash BEFORE opening the database transaction
    // Avoids holding database row locks during CPU-heavy password hashing
    const newPasswordHash = await hashPassword(input.password);

    // Step 3: Atomic database transaction under strict lock hierarchy
    await prisma.$transaction(async (tx) => {
      const txNow = new Date();

      // Step 3A: Lock User row
      const userRows = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status FROM "User" WHERE id = ${initialToken.userId} FOR UPDATE
      `;
      if (userRows.length === 0 || userRows[0].status !== 'ACTIVE') {
        throw new BadRequestError(
          'INVALID_OR_EXPIRED_TOKEN',
          'Password reset link is invalid or has expired',
        );
      }

      // Step 3B: Lock all active Sessions deterministically (ORDER BY id ASC)
      const sessions = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Session"
        WHERE "userId" = ${initialToken.userId} AND "revokedAt" IS NULL
        ORDER BY id ASC FOR UPDATE
      `;

      // Step 3C: Conditionally consume reset token exactly once
      const tokenResult = await tx.securityToken.updateMany({
        where: {
          id: initialToken.id,
          userId: initialToken.userId,
          type: 'PASSWORD_RESET',
          consumedAt: null,
          expiresAt: { gt: txNow },
        },
        data: {
          consumedAt: txNow,
        },
      });

      if (tokenResult.count !== 1) {
        throw new BadRequestError(
          'INVALID_OR_EXPIRED_TOKEN',
          'Password reset link is invalid or has expired',
        );
      }

      // Step 3D: Update password hash
      await tx.user.update({
        where: { id: initialToken.userId },
        data: { passwordHash: newPasswordHash },
      });

      // Step 3E: Revoke all locked active sessions and refresh tokens
      const sessionIds = sessions.map((s) => s.id);
      if (sessionIds.length > 0) {
        await tx.session.updateMany({
          where: { id: { in: sessionIds } },
          data: {
            revokedAt: txNow,
            revokedReason: 'PASSWORD_RESET',
          },
        });

        await tx.refreshToken.updateMany({
          where: { sessionId: { in: sessionIds }, revokedAt: null },
          data: {
            revokedAt: txNow,
          },
        });
      }

      // Step 3F: Invalidate all remaining security tokens for this user
      await securityTokenService.invalidateAllUserTokens(initialToken.userId, tx);
    });

    return {
      message: 'Password reset successful. Please log in with your new password.',
    };
  }

  /**
   * Authenticated password change with concurrent hash re-verification,
   * deterministic session locking, and token rotation.
   */
  async changePassword(
    userId: string,
    currentSessionId: string,
    rawRefreshToken: string | undefined,
    input: ChangePasswordInput,
    ip: string,
    userAgent?: string,
  ): Promise<{
    sessionPreserved: boolean;
    tokens?: { accessToken: string; refreshToken: string };
  }> {
    // Step 1: Pre-transaction validation
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.passwordHash === null) {
      throw new ForbiddenError(
        'PASSWORD_NOT_SET',
        'Cannot change password for an account configured with social login.',
      );
    }

    const initialPasswordHash = user.passwordHash;

    const isCurrentValid = await verifyPassword(input.currentPassword, initialPasswordHash);
    if (!isCurrentValid) {
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'Incorrect current password');
    }

    // Identical password detection before opening transaction
    const isNewIdentical = await verifyPassword(input.newPassword, initialPasswordHash);
    if (isNewIdentical) {
      throw new BadRequestError(
        'IDENTICAL_PASSWORD',
        'New password must be different from current password',
      );
    }

    const newPasswordHash = await hashPassword(input.newPassword);

    // Step 2: Atomic database transaction under strict lock hierarchy
    const outcome = await prisma.$transaction(async (tx) => {
      const txNow = new Date();

      // Step 2A: Lock User row
      const userRows = await tx.$queryRaw<{ id: string; passwordHash: string; status: string }[]>`
        SELECT id, "passwordHash", status FROM "User" WHERE id = ${userId} FOR UPDATE
      `;

      if (userRows.length === 0 || userRows[0].status !== 'ACTIVE') {
        throw new ForbiddenError('ACCOUNT_SUSPENDED', 'Account has been suspended');
      }

      // Fresh hash comparison under lock
      if (userRows[0].passwordHash !== initialPasswordHash) {
        throw new ConflictError(
          'PASSWORD_ALREADY_CHANGED',
          'Password was modified by another operation. Please retry with your new password.',
        );
      }

      // Step 2B: Lock sessions in deterministic ID order
      let sessionsToRevoke: { id: string }[];
      if (input.revokeAllSessions) {
        sessionsToRevoke = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Session"
          WHERE "userId" = ${userId} AND "revokedAt" IS NULL
          ORDER BY id ASC FOR UPDATE
        `;
      } else {
        sessionsToRevoke = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Session"
          WHERE "userId" = ${userId} AND id != ${currentSessionId} AND "revokedAt" IS NULL
          ORDER BY id ASC FOR UPDATE
        `;
      }

      // Step 2C: Update password hash
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });

      // Step 2D: Revoke target sessions and refresh tokens
      const revokeIds = sessionsToRevoke.map((s) => s.id);
      if (revokeIds.length > 0) {
        await tx.session.updateMany({
          where: { id: { in: revokeIds } },
          data: { revokedAt: txNow, revokedReason: 'PASSWORD_CHANGE' },
        });

        await tx.refreshToken.updateMany({
          where: { sessionId: { in: revokeIds }, revokedAt: null },
          data: { revokedAt: txNow },
        });
      }

      // Step 2E: Current session handling
      let newTokens: { accessToken: string; refreshToken: string } | undefined;
      let sessionPreserved = false;

      if (!input.revokeAllSessions) {
        if (!rawRefreshToken) {
          // Current session has no refresh token available in cookies; revoke current session
          await tx.session.updateMany({
            where: { id: currentSessionId, revokedAt: null },
            data: { revokedAt: txNow, revokedReason: 'PASSWORD_CHANGE' },
          });
          await tx.refreshToken.updateMany({
            where: { sessionId: currentSessionId, revokedAt: null },
            data: { revokedAt: txNow },
          });
        } else {
          const rotation = await this.executeRefreshTokenRotation(tx, {
            tokenHash: hashToken(rawRefreshToken),
            ip,
            userAgent,
            expectedSessionId: currentSessionId,
          });

          if (rotation.status === 'SUCCESS') {
            await tx.session.update({
              where: { id: currentSessionId },
              data: { reauthenticatedAt: txNow },
            });
            sessionPreserved = true;
            newTokens = {
              accessToken: rotation.accessToken,
              refreshToken: rotation.refreshToken,
            };
          } else {
            // Cannot renew: missing, expired, invalid, or replayed outside grace
            await tx.session.updateMany({
              where: { id: currentSessionId, revokedAt: null },
              data: { revokedAt: txNow, revokedReason: 'PASSWORD_CHANGE' },
            });
            await tx.refreshToken.updateMany({
              where: { sessionId: currentSessionId, revokedAt: null },
              data: { revokedAt: txNow },
            });
          }
        }
      }

      // Step 2F: Invalidate outstanding PASSWORD_RESET tokens (preserve EMAIL_VERIFICATION)
      await securityTokenService.invalidateUserTokensByType(userId, 'PASSWORD_RESET', tx);

      return { sessionPreserved, tokens: newTokens };
    });

    return outcome;
  }

  /**
   * Returns active sessions for the user with parsed client metadata and current session flag.
   */
  async listSessions(userId: string, currentSessionId: string): Promise<SessionItem[]> {
    const now = new Date();
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    return sessions.map((s) => ({
      id: s.id,
      isCurrent: s.id === currentSessionId,
      device: parseUserAgent(s.userAgent),
      ipAddress: maskIp(s.ipAddress),
      lastActiveAt: s.lastUsedAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
    }));
  }

  /**
   * Revokes a specific session after checking ownership without locking foreign rows.
   */
  async revokeSession(
    userId: string,
    currentSessionId: string,
    targetSessionId: string,
  ): Promise<{ isCurrentSession: boolean }> {
    // Safe ownership pre-check: Never lock foreign sessions
    const target = await prisma.session.findFirst({
      where: { id: targetSessionId, userId },
    });

    if (!target) {
      throw new NotFoundError('SESSION_NOT_FOUND', 'Session not found');
    }

    await prisma.$transaction(async (tx) => {
      const txNow = new Date();

      // Step 1: Lock User
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      // Step 2: Lock Session
      const rows = await tx.$queryRaw<{ id: string; revokedAt: Date | null }[]>`
        SELECT id, "revokedAt" FROM "Session"
        WHERE id = ${targetSessionId} AND "userId" = ${userId}
        FOR UPDATE
      `;

      if (rows.length === 0) {
        throw new NotFoundError('SESSION_NOT_FOUND', 'Session not found');
      }

      if (rows[0].revokedAt === null) {
        await tx.session.update({
          where: { id: targetSessionId },
          data: { revokedAt: txNow, revokedReason: 'USER_REVOKED' },
        });

        await tx.refreshToken.updateMany({
          where: { sessionId: targetSessionId, revokedAt: null },
          data: { revokedAt: txNow },
        });
      }
    });

    return { isCurrentSession: targetSessionId === currentSessionId };
  }

  /**
   * Revokes all active sessions for the user except the calling session.
   */
  async revokeOtherSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<{ revokedCount: number }> {
    return await prisma.$transaction(async (tx) => {
      const txNow = new Date();

      // Step 1: Lock User
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      // Step 2: Lock other sessions in deterministic order
      const otherSessions = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Session"
        WHERE "userId" = ${userId} AND id != ${currentSessionId} AND "revokedAt" IS NULL
        ORDER BY id ASC FOR UPDATE
      `;

      const otherIds = otherSessions.map((s) => s.id);
      if (otherIds.length > 0) {
        await tx.session.updateMany({
          where: { id: { in: otherIds } },
          data: { revokedAt: txNow, revokedReason: 'USER_REVOKED_OTHERS' },
        });

        await tx.refreshToken.updateMany({
          where: { sessionId: { in: otherIds }, revokedAt: null },
          data: { revokedAt: txNow },
        });
      }

      return { revokedCount: otherIds.length };
    });
  }

  /**
   * POST /api/v1/auth/verify-email
   * Atomically consumes EMAIL_VERIFICATION token under User row lock and marks user as verified.
   * A valid, unconsumed token can be consumed even if the user is already verified.
   * An invalid, expired, or already-consumed token throws 400 INVALID_OR_EXPIRED_TOKEN.
   */
  async verifyEmail(input: VerifyEmailInput): Promise<{ message: string; emailVerified: boolean }> {
    const outcome = await prisma.$transaction(async (tx) => {
      const result = await securityTokenService.consumeToken(input.token, 'EMAIL_VERIFICATION', tx);

      if (result.status === 'INVALID_OR_EXPIRED') {
        throw new BadRequestError(
          'INVALID_OR_EXPIRED_TOKEN',
          'Verification token is invalid or has expired',
        );
      }

      // Read fresh user record under the transaction
      const user = await tx.user.findUniqueOrThrow({
        where: { id: result.userId },
      });

      if (user.status !== 'ACTIVE') {
        throw new ForbiddenError('ACCOUNT_SUSPENDED', 'Your account has been suspended');
      }

      const emailVerifiedAt = user.emailVerifiedAt ?? new Date();

      await tx.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          emailVerifiedAt,
        },
      });

      return {
        message: 'Email verified successfully',
        emailVerified: true,
      };
    });

    return outcome;
  }

  /**
   * POST /api/v1/auth/resend-verification
   * Resends verification email for unverified accounts.
   * If authenticated, uses the authenticated user's email strictly.
   * If unauthenticated, uses the normalized input email.
   * Always returns a generic response to prevent account enumeration.
   */
  async resendVerification(
    input: ResendVerificationInput,
    authenticatedUserId?: string,
  ): Promise<{ message: string }> {
    const genericMessage =
      'If your email is registered and unverified, a verification link has been sent.';

    // Case 1: Authenticated request
    if (authenticatedUserId) {
      const user = await prisma.user.findUnique({
        where: { id: authenticatedUserId },
        include: { profile: true },
      });

      if (!user) {
        throw new UnauthorizedError('USER_NOT_FOUND', 'User account not found');
      }

      if (user.status !== 'ACTIVE') {
        throw new ForbiddenError('ACCOUNT_SUSPENDED', 'Your account has been suspended');
      }

      if (user.emailVerified) {
        return { message: genericMessage };
      }

      const tokenResult = await prisma.$transaction(async (tx) => {
        return await securityTokenService.createToken(
          user.id,
          'EMAIL_VERIFICATION',
          24 * 60 * 60 * 1000,
          tx,
        );
      });

      const name = user.profile?.firstName
        ? `${user.profile.firstName} ${user.profile.lastName}`.trim()
        : user.email;

      try {
        await emailService.sendVerificationEmail({
          to: user.email,
          name,
          token: tokenResult.rawToken,
          locale: input.locale || 'en',
        });
      } catch (error) {
        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            userId: user.id,
          },
          'Failed to deliver verification email during authenticated resend',
        );
      }

      return { message: genericMessage };
    }

    // Case 2: Unauthenticated request
    if (!input.email) {
      throw new BadRequestError('EMAIL_REQUIRED', 'Email is required for unauthenticated requests');
    }

    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: true },
    });

    if (!user || user.status !== 'ACTIVE' || user.emailVerified) {
      return { message: genericMessage };
    }

    const tokenResult = await prisma.$transaction(async (tx) => {
      return await securityTokenService.createToken(
        user.id,
        'EMAIL_VERIFICATION',
        24 * 60 * 60 * 1000,
        tx,
      );
    });

    const name = user.profile?.firstName
      ? `${user.profile.firstName} ${user.profile.lastName}`.trim()
      : user.email;

    try {
      await emailService.sendVerificationEmail({
        to: user.email,
        name,
        token: tokenResult.rawToken,
        locale: input.locale || 'en',
      });
    } catch (error) {
      logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
          userId: user.id,
        },
        'Failed to deliver verification email during unauthenticated resend',
      );
    }

    return { message: genericMessage };
  }

  private async createSessionAndTokens(
    userId: string,
    ip: string,
    userAgent?: string,
  ): Promise<{
    session: Session;
    accessToken: string;
    refreshToken: string;
  }> {
    const now = new Date();
    const sessionExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const refreshExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const rawRefreshToken = generateOpaqueToken();
    const tokenHash = hashToken(rawRefreshToken);
    const familyId = crypto.randomUUID();

    const session = await prisma.$transaction(async (tx) => {
      const s = await tx.session.create({
        data: {
          userId,
          userAgent: userAgent ?? null,
          ipAddress: ip,
          expiresAt: sessionExpiresAt,
          reauthenticatedAt: now,
          lastUsedAt: now,
        },
      });

      await tx.refreshToken.create({
        data: {
          sessionId: s.id,
          familyId,
          tokenHash,
          expiresAt: refreshExpiresAt,
        },
      });

      return s;
    });

    const accessToken = await signAccessToken({
      sub: userId,
      sid: session.id,
    });

    return {
      session,
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  /**
   * Confirms password for recent-authentication step-up on an active session.
   * Performs Argon2id verification outside the transaction, then verifies hash consistency
   * and session validity under User -> Session locks.
   */
  async confirmPassword(
    userId: string,
    sessionId: string,
    password: string,
  ): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      await verifyDummyPassword(password);
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'Incorrect password');
    }

    if (user.passwordHash === null) {
      await verifyDummyPassword(password);
      throw new BadRequestError('NO_PASSWORD_SET', 'Account does not have a password configured');
    }

    const verifiedHash = user.passwordHash;
    const isValid = await verifyPassword(password, verifiedHash);
    if (!isValid) {
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'Incorrect password');
    }

    await prisma.$transaction(async (tx) => {
      const txNow = new Date();

      // Step 1: Lock User
      const users: Array<{ id: string; passwordHash: string | null; status: string }> =
        await tx.$queryRaw`
        SELECT id, "passwordHash", status FROM "User" WHERE id = ${userId} FOR UPDATE
      `;
      const lockedUser = users[0];
      if (!lockedUser || lockedUser.status !== 'ACTIVE') {
        throw new UnauthorizedError('INVALID_CREDENTIALS', 'Incorrect password');
      }

      if (lockedUser.passwordHash !== verifiedHash) {
        throw new UnauthorizedError(
          'INVALID_CREDENTIALS',
          'Password was changed concurrently. Please try again.',
        );
      }

      // Step 2: Lock Session
      const sessions: Array<{ id: string; revokedAt: Date | null; expiresAt: Date }> =
        await tx.$queryRaw`
        SELECT id, "revokedAt", "expiresAt" FROM "Session"
        WHERE id = ${sessionId} AND "userId" = ${userId}
        FOR UPDATE
      `;
      const session = sessions[0];
      if (!session || session.revokedAt !== null || session.expiresAt <= txNow) {
        throw new UnauthorizedError(
          'SESSION_REVOKED_OR_EXPIRED',
          'Session has been revoked or expired',
        );
      }

      // Step 3: Update reauthenticatedAt
      await tx.session.update({
        where: { id: session.id },
        data: { reauthenticatedAt: txNow },
      });
    });

    return { message: 'Password confirmed successfully' };
  }

  /**
   * Sets initial password for OAuth-only accounts.
   * Computes Argon2id hash outside the transaction, then locks User and Session to verify
   * that password is not already set and recent-authentication is still fresh.
   */
  async setPassword(
    userId: string,
    sessionId: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      const txNow = new Date();

      // Step 1: Lock User
      const users: Array<{ id: string; passwordHash: string | null; status: string }> =
        await tx.$queryRaw`
        SELECT id, "passwordHash", status FROM "User" WHERE id = ${userId} FOR UPDATE
      `;
      const user = users[0];
      if (!user || user.status !== 'ACTIVE') {
        throw new NotFoundError('USER_NOT_FOUND', 'User account not found');
      }

      if (user.passwordHash !== null) {
        throw new BadRequestError(
          'PASSWORD_ALREADY_SET',
          'Account already has a password set. Use change password instead.',
        );
      }

      // Step 2: Lock Session
      const sessions: Array<{
        id: string;
        revokedAt: Date | null;
        expiresAt: Date;
        reauthenticatedAt: Date | null;
      }> = await tx.$queryRaw`
        SELECT id, "revokedAt", "expiresAt", "reauthenticatedAt" FROM "Session"
        WHERE id = ${sessionId} AND "userId" = ${userId}
        FOR UPDATE
      `;
      const session = sessions[0];
      if (!session || session.revokedAt !== null || session.expiresAt <= txNow) {
        throw new UnauthorizedError(
          'SESSION_REVOKED_OR_EXPIRED',
          'Session has been revoked or expired',
        );
      }

      if (!isAuthenticationFresh(session.reauthenticatedAt, txNow.getTime())) {
        throw new ForbiddenError(
          'REAUTHENTICATION_REQUIRED',
          'Recent authentication is required to perform this action. Please re-authenticate.',
        );
      }

      // Step 3: Persist precomputed hash (reauthenticatedAt is NOT refreshed)
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
    });

    return { message: 'Password set successfully' };
  }

  /**
   * Initiates dedicated Google OAuth re-authentication for active sessions.
   * Does NOT require recent authentication.
   */
  async initiateGoogleOAuthReauth(
    userId: string,
    sessionId: string,
    returnUrl?: string,
  ): Promise<{
    authUrl: string;
    statePrefix: string;
    hmac: string;
  }> {
    const linked = await prisma.oAuthAccount.findFirst({
      where: { userId, provider: OAUTH_PROVIDER_GOOGLE },
    });
    if (!linked) {
      throw new BadRequestError(
        'OAUTH_NOT_LINKED',
        'No linked Google account found for reauthentication',
      );
    }

    const safeReturnUrl = validateSafeReturnUrl(returnUrl, DEFAULT_OAUTH_RETURN_URL);
    const { rawState, statePrefix, stateHash, hmac } = generateOAuthState();
    const nonce = generateOpaqueToken();
    const { codeVerifier, codeChallenge } = generatePkce();

    const encrypted = encryptGcm(codeVerifier, env.OAUTH_ENCRYPTION_SECRET);

    await prisma.oAuthTransaction.create({
      data: {
        stateHash,
        statePrefix,
        nonce,
        encryptedCodeVerifier: encrypted.ciphertext,
        codeVerifierIv: encrypted.iv,
        codeVerifierTag: encrypted.tag,
        action: 'REAUTH',
        userId,
        sessionId,
        returnUrl: safeReturnUrl,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });

    const authUrl = googleOAuthService.getAuthorizationUrl({
      state: rawState,
      nonce,
      codeChallenge,
      prompt: 'select_account',
    });

    return {
      authUrl,
      statePrefix,
      hmac,
    };
  }

  /**
   * Initiates Google OAuth 2.0 / OIDC flow.
   * Generates cryptographically secure state, nonce, PKCE pair, encrypts verifier with AES-256-GCM,
   * stores OAuthTransaction, and returns authorization URL and cookie parameters.
   */
  async initiateGoogleOAuth(returnUrl?: string): Promise<{
    authUrl: string;
    statePrefix: string;
    hmac: string;
  }> {
    const safeReturnUrl = validateSafeReturnUrl(returnUrl, '/');

    const { rawState, statePrefix, stateHash, hmac } = generateOAuthState();
    const nonce = generateOpaqueToken();
    const { codeVerifier, codeChallenge } = generatePkce();

    const encrypted = encryptGcm(codeVerifier, env.OAUTH_ENCRYPTION_SECRET);

    await prisma.oAuthTransaction.create({
      data: {
        stateHash,
        statePrefix,
        nonce,
        encryptedCodeVerifier: encrypted.ciphertext,
        codeVerifierIv: encrypted.iv,
        codeVerifierTag: encrypted.tag,
        action: 'SIGNIN',
        userId: null,
        returnUrl: safeReturnUrl,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });

    const authUrl = googleOAuthService.getAuthorizationUrl({
      state: rawState,
      nonce,
      codeChallenge,
    });

    return {
      authUrl,
      statePrefix,
      hmac,
    };
  }

  /**
   * Handles Google OAuth callback.
   * Validates state cookie HMAC, consumes OAuthTransaction atomically, exchanges code,
   * verifies ID token claims, and either completes direct sign-in, registers a new user,
   * or creates an OAuthLinkChallenge for conservative linking.
   */
  async handleGoogleCallback(params: {
    code: string;
    rawState: string;
    cookieHmac?: string;
    ip: string;
    userAgent?: string;
    callerToken?: string;
  }): Promise<
    | {
        status: 'AUTHENTICATED';
        user: User & { profile: CustomerProfile | null };
        session: Session;
        accessToken: string;
        refreshToken: string;
        returnUrl: string;
        statePrefix: string;
      }
    | {
        status: 'LINK_REQUIRED';
        challengePrefix: string;
        rawChallengeToken: string;
        returnUrl: string;
        statePrefix: string;
      }
    | {
        status: 'LINKED';
        returnUrl: string;
        statePrefix: string;
      }
    | {
        status: 'REAUTHENTICATED';
        returnUrl: string;
        statePrefix: string;
      }
  > {
    const statePrefix = params.rawState.slice(0, 16);
    if (!isValidPrefix(statePrefix)) {
      throw new BadRequestError('INVALID_OAUTH_STATE', 'Invalid OAuth state prefix');
    }

    if (!params.cookieHmac || !verifyOAuthStateHmac(params.rawState, params.cookieHmac)) {
      throw new UnauthorizedError('INVALID_OAUTH_STATE', 'OAuth state verification failed');
    }

    const stateHash = hashToken(params.rawState);
    const now = new Date();

    const updatedTxs: Array<{
      id: string;
      action: OAuthAction;
      userId: string | null;
      sessionId: string | null;
      returnUrl: string;
      nonce: string;
      encryptedCodeVerifier: string;
      codeVerifierIv: string;
      codeVerifierTag: string;
    }> = await prisma.$queryRaw`
      UPDATE "OAuthTransaction"
      SET "consumedAt" = ${now}
      WHERE "stateHash" = ${stateHash}
        AND "consumedAt" IS NULL
        AND "expiresAt" > ${now}
      RETURNING id, action, "userId", "sessionId", "returnUrl", nonce, "encryptedCodeVerifier", "codeVerifierIv", "codeVerifierTag"
    `;

    const oauthTx = updatedTxs[0];
    if (!oauthTx) {
      throw new BadRequestError(
        'OAUTH_TRANSACTION_EXPIRED',
        'OAuth transaction has already been used or expired',
      );
    }

    const codeVerifier = decryptGcm(
      {
        ciphertext: oauthTx.encryptedCodeVerifier,
        iv: oauthTx.codeVerifierIv,
        tag: oauthTx.codeVerifierTag,
      },
      env.OAUTH_ENCRYPTION_SECRET,
    );

    const { idToken } = await googleOAuthService.exchangeCode(params.code, codeVerifier);
    const googleUser = await googleOAuthService.verifyIdToken(idToken, oauthTx.nonce);
    const normalizedEmail = googleUser.email.trim().toLowerCase();

    // Dedicated REAUTH action branch
    if (oauthTx.action === 'REAUTH') {
      if (!oauthTx.userId || !oauthTx.sessionId) {
        throw new BadRequestError('INVALID_OAUTH_STATE', 'Corrupted transaction payload');
      }

      if (!params.callerToken) {
        throw new UnauthorizedError(
          'AUTHENTICATION_REQUIRED',
          'Authentication required for reauthentication',
        );
      }

      const payload = await verifyAccessToken(params.callerToken);
      if (payload.sub !== oauthTx.userId || payload.sid !== oauthTx.sessionId) {
        throw new ForbiddenError(
          'OAUTH_REAUTH_IDENTITY_MISMATCH',
          'Session or user identity does not match re-authentication transaction',
        );
      }

      await prisma.$transaction(async (tx) => {
        const txNow = new Date();

        // Level 1: Lock User
        const users: Array<{ id: string; status: string }> = await tx.$queryRaw`
          SELECT id, status FROM "User" WHERE id = ${oauthTx.userId} FOR UPDATE
        `;
        const user = users[0];
        if (!user || user.status !== 'ACTIVE') {
          throw new ForbiddenError('ACCOUNT_SUSPENDED', 'Account is suspended or missing');
        }

        // Level 2: Lock Session
        const sessions: Array<{ id: string; revokedAt: Date | null; expiresAt: Date }> =
          await tx.$queryRaw`
          SELECT id, "revokedAt", "expiresAt" FROM "Session"
          WHERE id = ${oauthTx.sessionId} AND "userId" = ${oauthTx.userId}
          FOR UPDATE
        `;
        const session = sessions[0];
        if (!session || session.revokedAt !== null || session.expiresAt <= txNow) {
          throw new UnauthorizedError(
            'SESSION_REVOKED_OR_EXPIRED',
            'Session has been revoked or expired',
          );
        }

        // Verify returned Google sub matches user's linked account
        const linked = await tx.oAuthAccount.findFirst({
          where: {
            userId: user.id,
            provider: OAUTH_PROVIDER_GOOGLE,
            providerAccountId: googleUser.sub,
          },
        });
        if (!linked) {
          throw new ForbiddenError(
            'OAUTH_REAUTH_IDENTITY_MISMATCH',
            'The authenticated Google account does not match the linked identity for this user',
          );
        }

        await tx.session.update({
          where: { id: session.id },
          data: { reauthenticatedAt: txNow },
        });
      });

      return {
        status: 'REAUTHENTICATED' as const,
        returnUrl: oauthTx.returnUrl,
        statePrefix,
      };
    }

    // Dedicated LINK action branch
    if (oauthTx.action === 'LINK') {
      if (!oauthTx.userId || !oauthTx.sessionId) {
        throw new BadRequestError('INVALID_OAUTH_STATE', 'Corrupted transaction payload');
      }

      if (!params.callerToken) {
        throw new UnauthorizedError(
          'AUTHENTICATION_REQUIRED',
          'Authentication required for linking',
        );
      }

      const payload = await verifyAccessToken(params.callerToken);
      if (payload.sub !== oauthTx.userId || payload.sid !== oauthTx.sessionId) {
        throw new ForbiddenError(
          'OAUTH_LINK_IDENTITY_MISMATCH',
          'Calling session does not match the initiating link transaction',
        );
      }

      await prisma.$transaction(async (tx) => {
        const txNow = new Date();

        // Level 1: Lock User
        const users: Array<{ id: string; email: string; status: string }> = await tx.$queryRaw`
          SELECT id, email, status FROM "User" WHERE id = ${oauthTx.userId} FOR UPDATE
        `;
        const lockedUser = users[0];
        if (!lockedUser || lockedUser.status !== 'ACTIVE') {
          throw new ForbiddenError('ACCOUNT_SUSPENDED', 'Account is suspended or missing');
        }

        // Email Equality Check (HTTP 400 EMAIL_MISMATCH)
        if (lockedUser.email.trim().toLowerCase() !== normalizedEmail) {
          throw new BadRequestError(
            'EMAIL_MISMATCH',
            'Google account email does not match your DigitalDepot email',
          );
        }

        // Level 2: Lock exact initiating Session
        const sessions: Array<{
          id: string;
          revokedAt: Date | null;
          expiresAt: Date;
          reauthenticatedAt: Date | null;
        }> = await tx.$queryRaw`
          SELECT id, "revokedAt", "expiresAt", "reauthenticatedAt" FROM "Session"
          WHERE id = ${oauthTx.sessionId} AND "userId" = ${lockedUser.id}
          FOR UPDATE
        `;
        const session = sessions[0];
        if (!session || session.revokedAt !== null || session.expiresAt <= txNow) {
          throw new UnauthorizedError(
            'SESSION_REVOKED_OR_EXPIRED',
            'Session has been revoked or expired',
          );
        }

        // Recheck recent auth freshness under lock:
        if (!isAuthenticationFresh(session.reauthenticatedAt, txNow.getTime())) {
          throw new ForbiddenError(
            'REAUTHENTICATION_REQUIRED',
            'Recent authentication expired during the linking process. Please re-authenticate.',
          );
        }

        // Duplicate checks
        const existingUserGoogle = await tx.oAuthAccount.findFirst({
          where: { userId: lockedUser.id, provider: OAUTH_PROVIDER_GOOGLE },
        });
        if (existingUserGoogle) {
          throw new ConflictError(
            'OAUTH_ALREADY_LINKED',
            'Your account is already linked to a Google identity',
          );
        }

        const existingGoogleSub = await tx.oAuthAccount.findUnique({
          where: {
            unique_provider_account: {
              provider: OAUTH_PROVIDER_GOOGLE,
              providerAccountId: googleUser.sub,
            },
          },
        });
        if (existingGoogleSub) {
          throw new ConflictError(
            'OAUTH_PROVIDER_IDENTITY_CONFLICT',
            'This Google account is already linked to another DigitalDepot account',
          );
        }

        // Safe insertion under lock
        try {
          await tx.oAuthAccount.create({
            data: {
              userId: lockedUser.id,
              provider: OAUTH_PROVIDER_GOOGLE,
              providerAccountId: googleUser.sub,
            },
          });
        } catch (error) {
          if (isPrismaP2002Error(error)) {
            throw new ConflictError(
              'OAUTH_PROVIDER_IDENTITY_CONFLICT',
              'This Google account is already linked to another account',
            );
          }
          throw error;
        }
      });

      return {
        status: 'LINKED' as const,
        returnUrl: oauthTx.returnUrl,
        statePrefix,
      };
    }

    if (oauthTx.action !== 'SIGNIN') {
      throw new BadRequestError('INVALID_OAUTH_STATE', 'Unsupported OAuth transaction action');
    }

    // Check if this provider account is already linked
    const existingOAuth = await prisma.oAuthAccount.findUnique({
      where: {
        unique_provider_account: {
          provider: 'GOOGLE',
          providerAccountId: googleUser.sub,
        },
      },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    if (existingOAuth) {
      if (existingOAuth.user.status === 'SUSPENDED') {
        throw new ForbiddenError(
          'ACCOUNT_SUSPENDED',
          'Your account has been suspended. Please contact customer support.',
        );
      }

      const sessionTokens = await this.createSessionAndTokens(
        existingOAuth.user.id,
        params.ip,
        params.userAgent,
      );

      return {
        status: 'AUTHENTICATED',
        user: existingOAuth.user,
        session: sessionTokens.session,
        accessToken: sessionTokens.accessToken,
        refreshToken: sessionTokens.refreshToken,
        returnUrl: oauthTx.returnUrl,
        statePrefix,
      };
    }

    // Provider account not yet linked. Check if an account exists with this email.
    let conflictOrRegisterOutcome:
      | {
          status: 'LINK_REQUIRED';
          challengePrefix: string;
          rawChallengeToken: string;
          returnUrl: string;
        }
      | {
          status: 'REGISTERED';
          user: User & { profile: CustomerProfile | null };
          returnUrl: string;
        };

    try {
      conflictOrRegisterOutcome = await prisma.$transaction(async (tx) => {
        const lockedUsers: Array<User & { profile: CustomerProfile | null }> = await tx.$queryRaw`
          SELECT * FROM "User" WHERE email = ${normalizedEmail} FOR UPDATE
        `;
        const existingUserWithEmail = lockedUsers[0];

        if (existingUserWithEmail) {
          // Existing user with same email
          const existingGoogleForUser = await tx.oAuthAccount.findFirst({
            where: { userId: existingUserWithEmail.id, provider: 'GOOGLE' },
          });

          if (existingGoogleForUser && existingGoogleForUser.providerAccountId !== googleUser.sub) {
            throw new ConflictError(
              'OAUTH_PROVIDER_IDENTITY_CONFLICT',
              'This account is already linked to a different Google account',
            );
          }

          if (existingUserWithEmail.status === 'SUSPENDED') {
            throw new ForbiddenError(
              'ACCOUNT_SUSPENDED',
              'Your account has been suspended. Please contact customer support.',
            );
          }

          // Conservative linking: require password confirmation via link challenge
          const rawChallengeToken = generateOpaqueToken();
          const challengePrefix = rawChallengeToken.slice(0, 16);
          const challengeHash = hashToken(rawChallengeToken);
          const challengeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

          // Invalidate any previous unconsumed link challenges for this user and provider
          await tx.oAuthLinkChallenge.updateMany({
            where: {
              userId: existingUserWithEmail.id,
              provider: 'GOOGLE',
              consumedAt: null,
            },
            data: {
              consumedAt: new Date(),
            },
          });

          await tx.oAuthLinkChallenge.create({
            data: {
              userId: existingUserWithEmail.id,
              provider: 'GOOGLE',
              providerAccountId: googleUser.sub,
              email: normalizedEmail,
              challengeHash,
              challengePrefix,
              expiresAt: challengeExpiresAt,
            },
          });

          return {
            status: 'LINK_REQUIRED' as const,
            challengePrefix,
            rawChallengeToken,
            returnUrl: oauthTx.returnUrl,
          };
        }

        // New user registration
        let firstName = 'Customer';
        let lastName = '';
        if (googleUser.name && googleUser.name.trim()) {
          const parts = googleUser.name.trim().split(/\s+/);
          firstName = parts[0]!;
          lastName = parts.slice(1).join(' ');
        }

        let avatarUrl: string | null = null;
        if (googleUser.picture) {
          try {
            const parsed = new URL(googleUser.picture);
            if (parsed.protocol === 'https:') {
              avatarUrl = googleUser.picture;
            }
          } catch {
            avatarUrl = null;
          }
        }

        const newUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            passwordHash: null,
            role: 'CUSTOMER',
            status: 'ACTIVE',
            emailVerified: true,
            emailVerifiedAt: new Date(),
            profile: {
              create: {
                firstName,
                lastName,
                avatarUrl,
              },
            },
          },
          include: {
            profile: true,
          },
        });

        await tx.oAuthAccount.create({
          data: {
            userId: newUser.id,
            provider: 'GOOGLE',
            providerAccountId: googleUser.sub,
          },
        });

        return {
          status: 'REGISTERED' as const,
          user: newUser,
          returnUrl: oauthTx.returnUrl,
        };
      });
    } catch (error) {
      if (isPrismaP2002Error(error)) {
        if (isP2002Target(error, ['email'], ['User_email_key', 'User_email_unique', 'email'])) {
          throw new ConflictError(
            'EMAIL_ALREADY_EXISTS',
            'An account with this email address already exists',
          );
        }
        if (
          isP2002Target(
            error,
            ['provider', 'providerAccountId'],
            ['unique_provider_account', 'OAuthAccount_provider_providerAccountId_key'],
          )
        ) {
          throw new ConflictError(
            'OAUTH_PROVIDER_IDENTITY_CONFLICT',
            'This Google account is already linked to another account',
          );
        }
      }
      throw error;
    }

    if (conflictOrRegisterOutcome.status === 'LINK_REQUIRED') {
      return {
        status: 'LINK_REQUIRED',
        challengePrefix: conflictOrRegisterOutcome.challengePrefix,
        rawChallengeToken: conflictOrRegisterOutcome.rawChallengeToken,
        returnUrl: conflictOrRegisterOutcome.returnUrl,
        statePrefix,
      };
    }

    const sessionTokens = await this.createSessionAndTokens(
      conflictOrRegisterOutcome.user.id,
      params.ip,
      params.userAgent,
    );

    return {
      status: 'AUTHENTICATED',
      user: conflictOrRegisterOutcome.user,
      session: sessionTokens.session,
      accessToken: sessionTokens.accessToken,
      refreshToken: sessionTokens.refreshToken,
      returnUrl: conflictOrRegisterOutcome.returnUrl,
      statePrefix,
    };
  }

  /**
   * Confirms account linking for existing password-enabled accounts.
   * Atomically verifies password under User-first lock and tracks failed attempts (up to 5).
   */
  async confirmGoogleLink(
    challengePrefix: string,
    rawToken: string,
    password: string,
    ip: string,
    userAgent?: string,
  ): Promise<
    | {
        status: 'SUCCESS';
        user: User & { profile: CustomerProfile | null };
        session: Session;
        accessToken: string;
        refreshToken: string;
      }
    | { status: 'INVALID_CREDENTIALS'; remainingAttempts: number }
    | { status: 'MAX_ATTEMPTS_EXCEEDED' }
    | { status: 'CHALLENGE_EXPIRED_OR_NOT_FOUND' }
    | { status: 'ACCOUNT_SUSPENDED' }
    | { status: 'IDENTITY_CONFLICT' }
    | { status: 'NO_PASSWORD' }
    | { status: 'USER_NOT_FOUND' }
  > {
    const challengeHash = hashToken(rawToken);

    let outcome;
    try {
      outcome = await prisma.$transaction(async (tx) => {
        const challenge = await tx.oAuthLinkChallenge.findUnique({
          where: { challengeHash },
        });

        if (!challenge || challenge.consumedAt !== null || challenge.expiresAt <= new Date()) {
          return { status: 'CHALLENGE_EXPIRED_OR_NOT_FOUND' as const };
        }

        if (challenge.challengePrefix !== challengePrefix) {
          return { status: 'CHALLENGE_EXPIRED_OR_NOT_FOUND' as const };
        }

        // Strict Lock Order: Lock User row FIRST
        const users: Array<User & { profile: CustomerProfile | null }> = await tx.$queryRaw`
          SELECT * FROM "User" WHERE id = ${challenge.userId} FOR UPDATE
        `;
        const user = users[0];

        if (!user) {
          return { status: 'USER_NOT_FOUND' as const };
        }

        if (user.status === 'SUSPENDED') {
          return { status: 'ACCOUNT_SUSPENDED' as const };
        }

        if (!user.passwordHash) {
          return { status: 'NO_PASSWORD' as const };
        }

        const isPasswordValid = await verifyPassword(password, user.passwordHash);

        if (!isPasswordValid) {
          const newFailed = challenge.failedAttempts + 1;
          if (newFailed >= 5) {
            await tx.oAuthLinkChallenge.update({
              where: { id: challenge.id },
              data: {
                failedAttempts: newFailed,
                consumedAt: new Date(),
              },
            });
            return { status: 'MAX_ATTEMPTS_EXCEEDED' as const };
          } else {
            await tx.oAuthLinkChallenge.update({
              where: { id: challenge.id },
              data: {
                failedAttempts: newFailed,
              },
            });
            return { status: 'INVALID_CREDENTIALS' as const, remainingAttempts: 5 - newFailed };
          }
        }

        // Password verified - atomically consume challenge
        await tx.oAuthLinkChallenge.update({
          where: { id: challenge.id },
          data: {
            consumedAt: new Date(),
          },
        });

        // Check if another account already has this Google identity
        const existingOAuth = await tx.oAuthAccount.findUnique({
          where: {
            unique_provider_account: {
              provider: challenge.provider,
              providerAccountId: challenge.providerAccountId,
            },
          },
        });

        if (existingOAuth && existingOAuth.userId !== user.id) {
          return { status: 'IDENTITY_CONFLICT' as const };
        }

        if (!existingOAuth) {
          await tx.oAuthAccount.create({
            data: {
              userId: user.id,
              provider: challenge.provider,
              providerAccountId: challenge.providerAccountId,
            },
          });
        }

        if (!user.emailVerified) {
          await tx.user.update({
            where: { id: user.id },
            data: {
              emailVerified: true,
              emailVerifiedAt: new Date(),
            },
          });
        }

        const now = new Date();
        const sessionExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const refreshExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const rawRefreshToken = generateOpaqueToken();
        const tokenHash = hashToken(rawRefreshToken);
        const familyId = crypto.randomUUID();

        const session = await tx.session.create({
          data: {
            userId: user.id,
            userAgent: userAgent ?? null,
            ipAddress: ip,
            expiresAt: sessionExpiresAt,
            reauthenticatedAt: now,
            lastUsedAt: now,
          },
        });

        await tx.refreshToken.create({
          data: {
            sessionId: session.id,
            familyId,
            tokenHash,
            expiresAt: refreshExpiresAt,
          },
        });

        const fullUser = await tx.user.findUnique({
          where: { id: user.id },
          include: { profile: true },
        });

        return {
          status: 'SUCCESS' as const,
          user: fullUser!,
          session,
          refreshToken: rawRefreshToken,
        };
      });
    } catch (error) {
      if (isPrismaP2002Error(error)) {
        if (
          isP2002Target(
            error,
            ['provider', 'providerAccountId'],
            ['unique_provider_account', 'OAuthAccount_provider_providerAccountId_key'],
          )
        ) {
          throw new ConflictError(
            'OAUTH_PROVIDER_IDENTITY_CONFLICT',
            'This Google account is already linked to another account',
          );
        }
      }
      throw error;
    }

    if (outcome.status !== 'SUCCESS') {
      return outcome;
    }

    const accessToken = await signAccessToken({
      sub: outcome.user.id,
      sid: outcome.session.id,
    });

    return {
      status: 'SUCCESS',
      user: outcome.user,
      session: outcome.session,
      accessToken,
      refreshToken: outcome.refreshToken,
    };
  }
}

export const authService = new AuthService();
