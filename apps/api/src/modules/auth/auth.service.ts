import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
  generateOpaqueToken,
  hashToken,
  signAccessToken,
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
import type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
  VerifyEmailInput,
  ResendVerificationInput,
} from './auth.schemas.js';
import type { Prisma, Session, User, CustomerProfile } from '../../generated/client/client.js';

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
}

export const authService = new AuthService();
