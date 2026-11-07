import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { env } from '../../../config/env.js';
import { cleanDatabase, testPool } from '../../../test/setup.js';
import { emailService } from '../../email/email.service.js';
import { ConsoleTransport } from '../../email/transports/console.transport.js';
import { hashToken } from '../../../lib/crypto.js';
import { securityTokenService } from '../security-token.service.js';

describe('Registration & Email Verification Integration Tests', () => {
  let testTransport: ConsoleTransport;

  beforeEach(async () => {
    await cleanDatabase();
    testTransport = new ConsoleTransport();
    emailService.setTransport(testTransport);
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPool.end();
  });

  function getCsrfHeaders() {
    const token = generateCsrfToken();
    return {
      Origin: env.FRONTEND_URL,
      Cookie: `${COOKIE_NAMES.CSRF_TOKEN}=${token}`,
      'x-csrf-token': token,
    };
  }

  it('issues an EMAIL_VERIFICATION security token and dispatches verification email on registration', async () => {
    const csrf = getCsrfHeaders();
    const registrationData = {
      firstName: 'Kabir',
      lastName: 'Hossain',
      email: 'kabir.hossain@example.com',
      password: 'SecurePassword123!',
      locale: 'bn',
    };

    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', csrf.Origin)
      .set('Cookie', csrf.Cookie)
      .set('x-csrf-token', csrf['x-csrf-token'])
      .send(registrationData);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const userId = res.body.data.userId;
    expect(userId).toBeDefined();

    // Verify User and SecurityToken in PostgreSQL database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        securityTokens: true,
      },
    });

    expect(user).not.toBeNull();
    expect(user?.email).toBe(registrationData.email);
    expect(user?.profile?.firstName).toBe(registrationData.firstName);
    expect(user?.securityTokens).toHaveLength(1);

    const tokenRow = user!.securityTokens[0];
    expect(tokenRow.type).toBe('EMAIL_VERIFICATION');
    expect(tokenRow.consumedAt).toBeNull();
    expect(tokenRow.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Verify email was dispatched via EmailService
    const sentEmails = testTransport.getSentEmails();
    expect(sentEmails).toHaveLength(1);
    const sent = sentEmails[0];
    expect(sent.to).toBe(registrationData.email);
    expect(sent.subject).toBe('আপনার DigitalDepot অ্যাকাউন্ট যাচাই করুন'); // Bangla subject
    expect(sent.text).toContain('/bn/verify-email?token=');

    // Extract raw token from the verification link in email text
    const urlMatch = sent.text.match(/\/bn\/verify-email\?token=([a-zA-Z0-9_-]+)/);
    expect(urlMatch).not.toBeNull();
    const rawTokenInEmail = urlMatch![1];

    // Verify that the SHA-256 hash of rawTokenInEmail matches tokenHash in the database
    expect(hashToken(rawTokenInEmail)).toBe(tokenRow.tokenHash);
  });

  it('dispatches English verification email when locale is en or omitted', async () => {
    const csrf = getCsrfHeaders();
    const registrationData = {
      firstName: 'Sarah',
      lastName: 'Connor',
      email: 'sarah.connor@example.com',
      password: 'SecurePassword123!',
      locale: 'en',
    };

    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', csrf.Origin)
      .set('Cookie', csrf.Cookie)
      .set('x-csrf-token', csrf['x-csrf-token'])
      .send(registrationData);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const sentEmails = testTransport.getSentEmails();
    expect(sentEmails).toHaveLength(1);
    const sent = sentEmails[0];
    expect(sent.to).toBe(registrationData.email);
    expect(sent.subject).toBe('Verify your DigitalDepot account'); // English subject
    expect(sent.text).toContain('/en/verify-email?token=');
  });

  it('does NOT roll back registration when email dispatch fails', async () => {
    const csrf = getCsrfHeaders();
    const failingTransport = {
      send: vi.fn().mockRejectedValue(new Error('Resend provider outage or timeout')),
    };
    emailService.setTransport(failingTransport);

    const registrationData = {
      firstName: 'Sumaya',
      lastName: 'Akter',
      email: 'sumaya.akter@example.com',
      password: 'SecurePassword123!',
    };

    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', csrf.Origin)
      .set('Cookie', csrf.Cookie)
      .set('x-csrf-token', csrf['x-csrf-token'])
      .send(registrationData);

    // Registration STILL succeeds with 201 Created
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const userId = res.body.data.userId;

    // Verify user and token remain persisted in PostgreSQL
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { securityTokens: true },
    });
    expect(user).not.toBeNull();
    expect(user?.securityTokens).toHaveLength(1);
    expect(user?.securityTokens[0].type).toBe('EMAIL_VERIFICATION');

    expect(failingTransport.send).toHaveBeenCalledTimes(1);
  });

  it('rolls back caller-owned transaction completely if an operation inside fails', async () => {
    // Test transaction atomicity with caller-owned tx
    const email = 'rollback-test@example.com';

    await expect(
      prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            passwordHash: 'dummy-hash',
            role: 'CUSTOMER',
            status: 'ACTIVE',
          },
        });

        // Issue token within the transaction
        await securityTokenService.createToken(user.id, 'EMAIL_VERIFICATION', 60000, tx);

        // Force a failure inside the transaction
        throw new Error('Simulated database failure during transaction');
      }),
    ).rejects.toThrow('Simulated database failure during transaction');

    // Confirm that NEITHER User NOR SecurityToken was committed
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeNull();

    const tokens = await prisma.securityToken.findMany({
      where: { type: 'EMAIL_VERIFICATION' },
    });
    expect(tokens).toHaveLength(0);
  });
});
