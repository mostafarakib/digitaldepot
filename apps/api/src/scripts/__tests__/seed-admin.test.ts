import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { cleanDatabase, testPool } from '../../test/setup.js';
import { seedAdmin } from '../seed-admin.js';
import { env } from '../../config/env.js';
import { verifyPassword } from '../../lib/crypto.js';

describe('Admin Provisioning CLI Script', () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('generates a 43-character password when omitted and creates an ADMIN user and profile', async () => {
    const adminEmail = 'admin.test@digitaldepot.local';
    env.ADMIN_INITIAL_EMAIL = adminEmail;
    delete env.ADMIN_INITIAL_PASSWORD;

    // Capture console output to verify credentials format without logging sensitive data in prod
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await seedAdmin();

    const dbAdmin = await prisma.user.findUnique({
      where: { email: adminEmail },
      include: { profile: true },
    });

    expect(dbAdmin).not.toBeNull();
    expect(dbAdmin?.role).toBe('ADMIN');
    expect(dbAdmin?.emailVerified).toBe(true);
    expect(dbAdmin?.profile?.firstName).toBe('Admin');
    expect(dbAdmin?.profile?.lastName).toBe('System');

    // Verify printed password length was 43 characters
    const loggedOutput = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    const passwordMatch = loggedOutput.match(/Password:\s+([A-Za-z0-9_-]{43})/);
    expect(passwordMatch).not.toBeNull();
    const generatedPassword = passwordMatch![1];
    expect(generatedPassword).toHaveLength(43);

    // Verify generated password matches the Argon2id hash in PostgreSQL
    const isValid = await verifyPassword(generatedPassword, dbAdmin!.passwordHash!);
    expect(isValid).toBe(true);
  });

  it('is idempotent when admin account already exists', async () => {
    const adminEmail = 'admin.idempotent@digitaldepot.local';
    env.ADMIN_INITIAL_EMAIL = adminEmail;
    delete env.ADMIN_INITIAL_PASSWORD;

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Seed first time
    await seedAdmin();
    // Seed second time
    await seedAdmin();

    expect(exitSpy).toHaveBeenCalledWith(0);
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('already exists. No changes made.');
  });

  it('refuses to escalate existing customer account to admin and aborts with exit code 1', async () => {
    const customerEmail = 'customer.attempt@example.com';

    // Create customer account
    await prisma.user.create({
      data: {
        email: customerEmail,
        role: 'CUSTOMER',
        status: 'ACTIVE',
      },
    });

    env.ADMIN_INITIAL_EMAIL = customerEmail;
    delete env.ADMIN_INITIAL_PASSWORD;

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await seedAdmin();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(errorOutput).toContain('Silent customer promotion is prohibited');
  });
});
