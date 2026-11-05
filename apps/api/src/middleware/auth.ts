import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/crypto.js';
import { COOKIE_NAMES } from '../lib/cookies.js';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import type { Role } from '../generated/client/client.js';

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  let token: string | undefined = req.cookies?.[COOKIE_NAMES.ACCESS_TOKEN];

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    throw new UnauthorizedError(
      'AUTHENTICATION_REQUIRED',
      'Authentication is required to access this resource',
    );
  }

  let payload;
  try {
    payload = await verifyAccessToken(token);
  } catch {
    throw new UnauthorizedError('INVALID_TOKEN', 'Access token is invalid or has expired');
  }

  // Database session verification to enforce server-side revocation and freshness
  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    include: {
      user: {
        include: { profile: true },
      },
    },
  });

  if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) {
    throw new UnauthorizedError(
      'SESSION_REVOKED_OR_EXPIRED',
      'Session has been revoked or expired',
    );
  }

  if (session.userId !== payload.sub) {
    throw new UnauthorizedError('INVALID_SESSION', 'Session identity mismatch');
  }

  if (session.user.status !== 'ACTIVE') {
    throw new ForbiddenError('ACCOUNT_SUSPENDED', 'Your account has been suspended');
  }

  // Authorize using the fresh database role rather than stale JWT claims
  req.user = {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
    profile: session.user.profile,
    sessionId: session.id,
  };

  next();
}

export function requireRole(allowedRole: Role) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    if (req.user.role !== allowedRole) {
      throw new ForbiddenError(
        'INSUFFICIENT_PERMISSIONS',
        `Access restricted to ${allowedRole.toLowerCase()} role`,
      );
    }

    next();
  };
}
