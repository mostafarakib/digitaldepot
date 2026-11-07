import { prisma } from '../../lib/prisma.js';
import { generateOpaqueToken, hashToken } from '../../lib/crypto.js';
import type { SecurityTokenType, SecurityToken, Prisma } from '../../generated/client/client.js';

export type ConsumeOutcome =
  { status: 'SUCCESS'; userId: string; token: SecurityToken } | { status: 'INVALID_OR_EXPIRED' };

export class SecurityTokenService {
  /**
   * Issues a new security token adhering to strict lock hierarchy:
   * Acquires User row lock -> consumes prior unconsumed tokens for (userId, type) -> inserts replacement token.
   * Supports caller-owned Prisma transaction to participate in parent transactions without nesting.
   */
  async createToken(
    userId: string,
    type: SecurityTokenType,
    expiresInMs: number,
    tx?: Prisma.TransactionClient,
  ): Promise<{ rawToken: string; tokenHash: string; expiresAt: Date; tokenId: string }> {
    const rawToken = generateOpaqueToken();
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInMs);

    const execute = async (client: Prisma.TransactionClient) => {
      // Step 1: Acquire row-level lock on User to serialize token issuance
      await client.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      // Step 2: Invalidate all previous unconsumed tokens for this user & type
      // Freeing the partial unique index slot atomically
      await client.securityToken.updateMany({
        where: {
          userId,
          type,
          consumedAt: null,
        },
        data: {
          consumedAt: now,
        },
      });

      // Step 3: Insert new active SecurityToken
      return await client.securityToken.create({
        data: {
          userId,
          type,
          tokenHash,
          expiresAt,
        },
      });
    };

    const created = tx ? await execute(tx) : await prisma.$transaction(execute);

    return {
      rawToken,
      tokenHash,
      expiresAt,
      tokenId: created.id,
    };
  }

  /**
   * Conditionally and atomically consumes a security token adhering to strict lock hierarchy:
   * 1. Reads token row to identify userId.
   * 2. Acquires User row lock.
   * 3. Conditionally consumes token (WHERE id = id AND consumedAt IS NULL AND expiresAt > now).
   * Guarantees that only exactly 1 concurrent transaction can consume the token.
   * Supports caller-owned Prisma transaction.
   */
  async consumeToken(
    rawToken: string,
    expectedType: SecurityTokenType,
    tx?: Prisma.TransactionClient,
  ): Promise<ConsumeOutcome> {
    const tokenHash = hashToken(rawToken);
    const now = new Date();

    // Step 1: Pre-lookup token to identify userId without locking
    const initialToken = await (tx ?? prisma).securityToken.findUnique({
      where: { tokenHash },
    });

    if (
      !initialToken ||
      initialToken.type !== expectedType ||
      initialToken.consumedAt !== null ||
      initialToken.expiresAt <= now
    ) {
      return { status: 'INVALID_OR_EXPIRED' };
    }

    // Step 2: Execute consumption within a transaction
    const execute = async (client: Prisma.TransactionClient): Promise<ConsumeOutcome> => {
      // Enforce lock hierarchy: User row lock first
      await client.$queryRaw`SELECT id FROM "User" WHERE id = ${initialToken.userId} FOR UPDATE`;

      // Conditional atomic consumption
      const result = await client.securityToken.updateMany({
        where: {
          id: initialToken.id,
          type: expectedType,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          consumedAt: now,
        },
      });

      if (result.count !== 1) {
        // Concurrency collision: parallel transaction already consumed or token expired
        return { status: 'INVALID_OR_EXPIRED' as const };
      }

      const freshToken = await client.securityToken.findUniqueOrThrow({
        where: { id: initialToken.id },
      });

      return {
        status: 'SUCCESS' as const,
        userId: freshToken.userId,
        token: freshToken,
      };
    };

    return tx ? await execute(tx) : await prisma.$transaction(execute);
  }

  /**
   * Invalidates all unconsumed security tokens of a specific type for a user (e.g. PASSWORD_RESET).
   * Supports caller-owned Prisma transaction.
   */
  async invalidateUserTokensByType(
    userId: string,
    type: SecurityTokenType,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const now = new Date();

    const execute = async (client: Prisma.TransactionClient) => {
      await client.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const result = await client.securityToken.updateMany({
        where: {
          userId,
          type,
          consumedAt: null,
        },
        data: {
          consumedAt: now,
        },
      });
      return result.count;
    };

    return tx ? await execute(tx) : await prisma.$transaction(execute);
  }

  /**
   * Invalidates all unconsumed security tokens for a user (used after password reset or user suspension).
   * Supports caller-owned Prisma transaction.
   */
  async invalidateAllUserTokens(userId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const now = new Date();

    const execute = async (client: Prisma.TransactionClient) => {
      await client.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const result = await client.securityToken.updateMany({
        where: {
          userId,
          consumedAt: null,
        },
        data: {
          consumedAt: now,
        },
      });
      return result.count;
    };

    return tx ? await execute(tx) : await prisma.$transaction(execute);
  }
}

export const securityTokenService = new SecurityTokenService();
