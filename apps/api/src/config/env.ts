import path from 'path';
import { config } from 'dotenv';
import { z } from 'zod';

// Load .env from current working directory, then ensure apps/api/.env is loaded if invoked from root
config();
config({ path: path.resolve(import.meta.dirname, '../../.env') });

export function isValidSenderAddress(from: string): boolean {
  const trimmed = from.trim();
  if (!trimmed) return false;
  // Matches "email@domain.tld" or "Display Name <email@domain.tld>"
  const namedEmailRegex = /^[^<>]+<\s*[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}\s*>$/;
  const simpleEmailRegex = /^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/;
  return namedEmailRegex.test(trimmed) || simpleEmailRegex.test(trimmed);
}

export const envSchema = z
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
    EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
    EMAIL_FROM: z.string().default('DigitalDepot <noreply@digitaldepot.com>'),
    RESEND_API_KEY: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (data.JWT_ACCESS_SECRET === 'dev-jwt-access-secret-minimum-32-characters-long') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'JWT_ACCESS_SECRET must be set to a secure secret in production',
          path: ['JWT_ACCESS_SECRET'],
        });
      }

      if (data.CSRF_SECRET === 'dev-csrf-secret-minimum-32-characters-long-key') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'CSRF_SECRET must be set to a secure secret in production',
          path: ['CSRF_SECRET'],
        });
      }

      // In production, EMAIL_PROVIDER must be 'resend'
      if (data.EMAIL_PROVIDER !== 'resend') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'In production, EMAIL_PROVIDER must be "resend" (console transport is forbidden in production)',
          path: ['EMAIL_PROVIDER'],
        });
      }

      // In production, RESEND_API_KEY is required and cannot be empty
      if (!data.RESEND_API_KEY || data.RESEND_API_KEY.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'In production, RESEND_API_KEY is required and cannot be empty',
          path: ['RESEND_API_KEY'],
        });
      }

      // In production, EMAIL_FROM must be a valid sender address
      if (!data.EMAIL_FROM || !isValidSenderAddress(data.EMAIL_FROM)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'In production, EMAIL_FROM must be a valid sender address (e.g. "Name <email@domain.com>" or "email@domain.com")',
          path: ['EMAIL_FROM'],
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;
