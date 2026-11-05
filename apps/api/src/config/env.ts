import path from 'path';
import { config } from 'dotenv';
import { z } from 'zod';

// Load .env from current working directory, then ensure apps/api/.env is loaded if invoked from root
config();
config({ path: path.resolve(import.meta.dirname, '../../.env') });

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    TEST_DATABASE_URL: z.string().optional(),
    FRONTEND_URL: z.string().url().default('http://localhost:3000'),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters')
      .default('dev-jwt-access-secret-minimum-32-characters-long'),
    JWT_ISSUER: z.string().default('https://api.digitaldepot.com'),
    JWT_AUDIENCE: z.string().default('https://digitaldepot.com'),
    CSRF_SECRET: z
      .string()
      .min(32, 'CSRF_SECRET must be at least 32 characters')
      .default('dev-csrf-secret-minimum-32-characters-long-key'),
    COOKIE_DOMAIN: z.string().optional(),
    ADMIN_INITIAL_EMAIL: z.string().email().optional(),
    ADMIN_INITIAL_PASSWORD: z.string().min(16).optional(),
    TRUST_PROXY: z.string().default('loopback'),
  })
  .refine(
    (data) => {
      if (data.NODE_ENV === 'production') {
        return (
          data.JWT_ACCESS_SECRET !== 'dev-jwt-access-secret-minimum-32-characters-long' &&
          data.CSRF_SECRET !== 'dev-csrf-secret-minimum-32-characters-long-key'
        );
      }
      return true;
    },
    {
      message:
        'JWT_ACCESS_SECRET and CSRF_SECRET must be set to unique, secure secrets in production',
    },
  );

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;
