import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { testPrisma, cleanDatabase, testPool } from '../../../test/setup.js';
import { securityTokenService } from '../security-token.service.js';

describe('SecurityToken Lifecycle & Concurrency Tests', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPrisma.$disconnect();
    await testPool.end();
  });

  async function createTestUser(email = 'token-test@example.com') {
    return await testPrisma.user.create({
      data: {
        email,
        passwordHash: 'dummy-hash',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        profile: {
          create: {
            firstName: 'Token',
            lastName: 'Tester',
          },
        },
      },
    });
  }

  it('creates an active token and conditionally consumes it once', async () => {
    const user = await createTestUser();

    const { rawToken, tokenHash, expiresAt } = await securityTokenService.createToken(
      user.id,
      'EMAIL_VERIFICATION',
      24 * 60 * 60 * 1000,
    );

    expect(rawToken).toBeDefined();
    expect(tokenHash).toHaveLength(64); // SHA-256 hex
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    // First consumption succeeds
    const outcome1 = await securityTokenService.consumeToken(rawToken, 'EMAIL_VERIFICATION');
    expect(outcome1.status).toBe('SUCCESS');
    if (outcome1.status === 'SUCCESS') {
      expect(outcome1.userId).toBe(user.id);
      expect(outcome1.token.consumedAt).not.toBeNull();
    }

    // Second consumption attempt fails (single-use enforcement)
    const outcome2 = await securityTokenService.consumeToken(rawToken, 'EMAIL_VERIFICATION');
    expect(outcome2.status).toBe('INVALID_OR_EXPIRED');
  });

  it('enforces partial unique index: consumes prior unconsumed token before issuing replacement', async () => {
    const user = await createTestUser();

    // Issue Token 1
    const token1 = await securityTokenService.createToken(
      user.id,
      'PASSWORD_RESET',
      60 * 60 * 1000,
    );

    // Verify Token 1 is active
    const dbToken1 = await testPrisma.securityToken.findUnique({
      where: { tokenHash: token1.tokenHash },
    });
    expect(dbToken1?.consumedAt).toBeNull();

    // Issue Token 2 for the same user and type (e.g. resend)
    const token2 = await securityTokenService.createToken(
      user.id,
      'PASSWORD_RESET',
      60 * 60 * 1000,
    );

    // Verify Token 1 was automatically marked consumed
    const updatedDbToken1 = await testPrisma.securityToken.findUnique({
      where: { tokenHash: token1.tokenHash },
    });
    expect(updatedDbToken1?.consumedAt).not.toBeNull();

    // Verify Token 2 is the single active token
    const dbToken2 = await testPrisma.securityToken.findUnique({
      where: { tokenHash: token2.tokenHash },
    });
    expect(dbToken2?.consumedAt).toBeNull();

    // Verify Token 1 cannot be consumed anymore
    const consumeOld = await securityTokenService.consumeToken(token1.rawToken, 'PASSWORD_RESET');
    expect(consumeOld.status).toBe('INVALID_OR_EXPIRED');

    // Verify Token 2 can be consumed
    const consumeNew = await securityTokenService.consumeToken(token2.rawToken, 'PASSWORD_RESET');
    expect(consumeNew.status).toBe('SUCCESS');
  });

  it('verifies that PostgreSQL partial unique index prevents duplicate unconsumed tokens', async () => {
    const user = await createTestUser();

    // Manually create an unconsumed token
    await testPrisma.securityToken.create({
      data: {
        userId: user.id,
        type: 'EMAIL_VERIFICATION',
        tokenHash: 'hash-111',
        expiresAt: new Date(Date.now() + 60000),
        consumedAt: null,
      },
    });

    // Attempting to manually insert a second unconsumed token for the same user & type violates unique index
    await expect(
      testPrisma.securityToken.create({
        data: {
          userId: user.id,
          type: 'EMAIL_VERIFICATION',
          tokenHash: 'hash-222',
          expiresAt: new Date(Date.now() + 60000),
          consumedAt: null,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects expired tokens', async () => {
    const user = await createTestUser();

    // Create a token that expired 5 seconds ago
    const { rawToken } = await securityTokenService.createToken(
      user.id,
      'EMAIL_VERIFICATION',
      -5000,
    );

    const outcome = await securityTokenService.consumeToken(rawToken, 'EMAIL_VERIFICATION');
    expect(outcome.status).toBe('INVALID_OR_EXPIRED');
  });

  it('rejects token consumption with mismatched type', async () => {
    const user = await createTestUser();

    const { rawToken } = await securityTokenService.createToken(
      user.id,
      'EMAIL_VERIFICATION',
      60 * 60 * 1000,
    );

    // Attempt to consume as PASSWORD_RESET
    const outcome = await securityTokenService.consumeToken(rawToken, 'PASSWORD_RESET');
    expect(outcome.status).toBe('INVALID_OR_EXPIRED');

    // Token remains unconsumed and can still be consumed as EMAIL_VERIFICATION
    const validOutcome = await securityTokenService.consumeToken(rawToken, 'EMAIL_VERIFICATION');
    expect(validOutcome.status).toBe('SUCCESS');
  });

  it('handles concurrent token consumption: exactly one succeeds and parallel requests fail', async () => {
    const user = await createTestUser();

    const { rawToken } = await securityTokenService.createToken(
      user.id,
      'PASSWORD_RESET',
      60 * 60 * 1000,
    );

    // Fire 10 simultaneous consumption requests
    const results = await Promise.all(
      Array.from({ length: 10 }).map(() =>
        securityTokenService.consumeToken(rawToken, 'PASSWORD_RESET'),
      ),
    );

    const successful = results.filter((r) => r.status === 'SUCCESS');
    const failed = results.filter((r) => r.status === 'INVALID_OR_EXPIRED');

    expect(successful).toHaveLength(1);
    expect(failed).toHaveLength(9);
  });

  it('handles concurrent token creation: serializes safely via User lock without deadlock', async () => {
    const user = await createTestUser();

    // Fire 6 simultaneous token creation requests for the same user and type
    const tokens = await Promise.all(
      Array.from({ length: 6 }).map(() =>
        securityTokenService.createToken(user.id, 'EMAIL_VERIFICATION', 60 * 60 * 1000),
      ),
    );

    expect(tokens).toHaveLength(6);

    // Check database: exactly 1 unconsumed token exists for this user and type
    const activeTokens = await testPrisma.securityToken.findMany({
      where: {
        userId: user.id,
        type: 'EMAIL_VERIFICATION',
        consumedAt: null,
      },
    });

    expect(activeTokens).toHaveLength(1);

    // All other 5 tokens have consumedAt != null
    const consumedTokens = await testPrisma.securityToken.findMany({
      where: {
        userId: user.id,
        type: 'EMAIL_VERIFICATION',
        consumedAt: { not: null },
      },
    });

    expect(consumedTokens).toHaveLength(5);
  });

  it('invalidates all unconsumed security tokens for a user', async () => {
    const user = await createTestUser();

    await securityTokenService.createToken(user.id, 'EMAIL_VERIFICATION', 60000);
    await securityTokenService.createToken(user.id, 'PASSWORD_RESET', 60000);

    const activeBefore = await testPrisma.securityToken.count({
      where: { userId: user.id, consumedAt: null },
    });
    expect(activeBefore).toBe(2);

    const invalidatedCount = await securityTokenService.invalidateAllUserTokens(user.id);
    expect(invalidatedCount).toBe(2);

    const activeAfter = await testPrisma.securityToken.count({
      where: { userId: user.id, consumedAt: null },
    });
    expect(activeAfter).toBe(0);
  });
});
