import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/crypto.js';
import { env } from '../config/env.js';

export async function seedAdmin(): Promise<void> {
  const email = env.ADMIN_INITIAL_EMAIL?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(
      '❌ Error: ADMIN_INITIAL_EMAIL must be set to a valid email address in your environment.',
    );
    process.exit(1);
    return;
  }

  let password = env.ADMIN_INITIAL_PASSWORD;
  let isGenerated = false;

  if (password) {
    if (password.length < 16) {
      console.error(
        '❌ Error: If ADMIN_INITIAL_PASSWORD is provided, it must be at least 16 characters long.',
      );
      process.exit(1);
      return;
    }
  } else {
    // Generate at least 32 cryptographically random bytes (43 base64url characters)
    password = crypto.randomBytes(32).toString('base64url');
    isGenerated = true;
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    if (existingUser.role === 'ADMIN') {
      console.log(`ℹ️ Admin account for ${email} already exists. No changes made.`);
      process.exit(0);
      return;
    } else {
      console.error(
        `❌ Security error: An account with email "${email}" exists with role CUSTOMER. Silent customer promotion is prohibited. Admin email must be dedicated and distinct.`,
      );
      process.exit(1);
      return;
    }
  }

  const passwordHash = await hashPassword(password);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    await tx.customerProfile.create({
      data: {
        userId: user.id,
        firstName: 'Admin',
        lastName: 'System',
      },
    });
  });

  console.log('\n========================================');
  console.log('✅ Admin Account Initialized Successfully');
  console.log('========================================');
  console.log(`  Email:    ${email}`);
  if (isGenerated) {
    console.log(`  Password: ${password}`);
    console.log(
      '\n⚠️ IMPORTANT: Store this generated password securely. It will not be displayed again.',
    );
  } else {
    console.log('  Password: [Supplied from environment]');
  }
  console.log('========================================\n');
}

// Execute when invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Admin seed failed:', err.message);
      process.exit(1);
    });
}
