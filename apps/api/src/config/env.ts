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
    GOOGLE_CLIENT_ID: z.string().default('dev-google-client-id'),
    GOOGLE_CLIENT_SECRET: z.string().default('dev-google-client-secret'),
    GOOGLE_CALLBACK_URL: z
      .string()
      .url()
      .default('http://localhost:3000/api/auth/oauth/google/callback'),
    OAUTH_ENCRYPTION_SECRET: z
      .string()
      .regex(
        /^[0-9a-fA-F]{64}$/,
        'OAUTH_ENCRYPTION_SECRET must be exactly 64 hexadecimal characters (32 decoded bytes)',
      )
      .default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
    OAUTH_STATE_SECRET: z
      .string()
      .min(32, 'OAUTH_STATE_SECRET must be at least 32 characters')
      .default('dev-oauth-state-secret-minimum-32-characters-long!'),
  })
  .superRefine((data, ctx) => {
    // Exact 32 decoded bytes validation for AES-256-GCM
    const decodedKey = Buffer.from(data.OAUTH_ENCRYPTION_SECRET, 'hex');
    if (decodedKey.length !== 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'OAUTH_ENCRYPTION_SECRET must decode to exactly 32 bytes',
        path: ['OAUTH_ENCRYPTION_SECRET'],
      });
    }

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

      // In production, Google OAuth configuration must be valid
      if (
        data.GOOGLE_CLIENT_ID === 'dev-google-client-id' ||
        !data.GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'In production, GOOGLE_CLIENT_ID must be a valid Google OAuth Client ID ending with .apps.googleusercontent.com',
          path: ['GOOGLE_CLIENT_ID'],
        });
      }

      if (
        data.GOOGLE_CLIENT_SECRET === 'dev-google-client-secret' ||
        data.GOOGLE_CLIENT_SECRET.trim().length === 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'In production, GOOGLE_CLIENT_SECRET must be configured with a production secret',
          path: ['GOOGLE_CLIENT_SECRET'],
        });
      }

      if (!data.GOOGLE_CALLBACK_URL.startsWith('https://')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'In production, GOOGLE_CALLBACK_URL must use https://',
          path: ['GOOGLE_CALLBACK_URL'],
        });
      }

      if (
        data.OAUTH_ENCRYPTION_SECRET ===
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'In production, OAUTH_ENCRYPTION_SECRET must be set to a secure unique 64-hex key',
          path: ['OAUTH_ENCRYPTION_SECRET'],
        });
      }

      if (data.OAUTH_STATE_SECRET === 'dev-oauth-state-secret-minimum-32-characters-long!') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'In production, OAUTH_STATE_SECRET must be set to a secure unique 32-character key',
          path: ['OAUTH_STATE_SECRET'],
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
