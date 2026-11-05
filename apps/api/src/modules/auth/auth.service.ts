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
import { ConflictError, ForbiddenError, UnauthorizedError } from '../../lib/errors.js';
import type { RegisterInput, LoginInput } from './auth.schemas.js';
import type { Session, User, CustomerProfile } from '../../generated/client/client.js';

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

      return user;
    });

    return {
      message: 'Registration successful. Please log in.',
      userId: result.id,
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
   * Rotates a refresh token using session-level row locking and conditional consumption.
   * Never throws inside transaction when revoking to ensure revocation commits.
   */
  async rotateRefreshToken(
    rawToken: string,
    ip: string,
    userAgent?: string,
  ): Promise<RefreshOutcome> {
    const tokenHash = hashToken(rawToken);

    const outcome = await prisma.$transaction(async (tx) => {
      // Step 1: Initial token lookup to identify the session
      const initialToken = await tx.refreshToken.findUnique({
        where: { tokenHash },
      });

      if (!initialToken) {
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
        data: { lastUsedAt: now, ipAddress: ip, userAgent: userAgent ?? null },
      });

      const newAccessToken = await signAccessToken({ sub: session.userId, sid: session.id });

      return {
        status: 'SUCCESS' as const,
        accessToken: newAccessToken,
        refreshToken: newRawToken,
        session: updatedSession,
      };
    });

    return outcome;
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
}

export const authService = new AuthService();
