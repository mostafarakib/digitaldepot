import path from 'path';
import { config } from 'dotenv';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/client.js';

// Load test environment variables
config();
config({ path: path.resolve(import.meta.dirname, '../../.env') });

const testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl) {
  throw new Error('FATAL: TEST_DATABASE_URL environment variable is required for tests');
}

let parsedUrl: URL;
try {
  parsedUrl = new URL(testDbUrl);
} catch {
  throw new Error(`FATAL: TEST_DATABASE_URL "${testDbUrl}" is not a valid URL`);
}

// Strict safety check: Must be exactly 'digitaldepot_test'
const dbName = parsedUrl.pathname.replace(/^\//, '');
if (dbName !== 'digitaldepot_test') {
  throw new Error(
    `FATAL SAFETY CHECK: Integration tests may ONLY run against database "digitaldepot_test". Provided database name: "${dbName}"`,
  );
}

export const testPool = new pg.Pool({
  connectionString: testDbUrl,
  max: 10,
});

export const testPrisma = new PrismaClient({
  adapter: new PrismaPg(testPool),
});

/**
 * Truncates all application tables between integration test runs.
 * Safety check is verified prior to truncation.
 */
export async function cleanDatabase(): Promise<void> {
  if (dbName !== 'digitaldepot_test') {
    throw new Error('Refusing to truncate non-test database!');
  }
  await testPrisma.$executeRawUnsafe(`
    TRUNCATE TABLE "Address", "SecurityToken", "RefreshToken", "Session", "CustomerProfile", "User" CASCADE;
  `);
}

/**
 * Helper to safely extract string[] cookies from Supertest response headers
 */
export function extractCookies(res: { headers: Record<string, unknown> }): string[] {
  const c = res.headers['set-cookie'];
  if (Array.isArray(c)) return c;
  if (typeof c === 'string') return [c];
  return [];
}
