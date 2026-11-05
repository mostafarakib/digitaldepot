import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/client/client.js';

// When running tests, use TEST_DATABASE_URL
const connectionString = env.NODE_ENV === 'test' ? (env.TEST_DATABASE_URL ?? '') : env.DATABASE_URL;

// Safety check: When running in test environment, strictly verify database is digitaldepot_test
if (env.NODE_ENV === 'test') {
  if (!connectionString) {
    throw new Error('FATAL: TEST_DATABASE_URL is required when running in test mode');
  }
  try {
    const parsed = new URL(connectionString);
    const db = parsed.pathname.replace(/^\//, '');
    if (db !== 'digitaldepot_test') {
      throw new Error(
        `FATAL SAFETY CHECK: Integration tests may ONLY connect to database "digitaldepot_test". Attempted connection to: "${db}"`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('FATAL SAFETY CHECK')) {
      throw err;
    }
    throw new Error(`FATAL: Invalid database URL for test environment: ${connectionString}`);
  }
}

// Explicit connection pool configuration for PostgreSQL
export const pool = new pg.Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const adapter = new PrismaPg(pool);

// Global singleton pattern to avoid multiple clients during development hot-reloading
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
