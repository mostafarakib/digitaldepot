import { describe, it, expect } from 'vitest';
import { envSchema, isValidSenderAddress } from '../env.js';

describe('Environment Configuration Validation (envSchema)', () => {
  const baseValidProdEnv = {
    NODE_ENV: 'production',
    PORT: '4000',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/digitaldepot',
    FRONTEND_URL: 'https://digitaldepot.com',
    JWT_ACCESS_SECRET: 'a-very-long-production-jwt-access-secret-at-least-32-chars',
    CSRF_SECRET: 'a-very-long-production-csrf-secret-at-least-32-chars-long',
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_production_key_12345',
    EMAIL_FROM: 'DigitalDepot <noreply@digitaldepot.com>',
    GOOGLE_CLIENT_ID: '1234567890-prod.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'prod-google-client-secret-secure',
    GOOGLE_CALLBACK_URL: 'https://digitaldepot.com/api/auth/oauth/google/callback',
    OAUTH_ENCRYPTION_SECRET: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    OAUTH_STATE_SECRET: 'a-very-long-production-oauth-state-secret-at-least-32-chars',
    SSLCOMMERZ_STORE_ID: 'real_production_store_id',
    SSLCOMMERZ_STORE_PASSWORD: 'real_production_store_password',
    SSLCOMMERZ_IS_SANDBOX: false,
  };

  describe('Sender Address Validator (isValidSenderAddress)', () => {
    it('accepts valid named email addresses', () => {
      expect(isValidSenderAddress('DigitalDepot <noreply@digitaldepot.com>')).toBe(true);
      expect(isValidSenderAddress('Support Team <support@digitaldepot.com>')).toBe(true);
    });

    it('accepts valid plain email addresses', () => {
      expect(isValidSenderAddress('noreply@digitaldepot.com')).toBe(true);
      expect(isValidSenderAddress('orders@sub.example.com')).toBe(true);
    });

    it('rejects invalid or empty addresses', () => {
      expect(isValidSenderAddress('')).toBe(false);
      expect(isValidSenderAddress('   ')).toBe(false);
      expect(isValidSenderAddress('invalid-email')).toBe(false);
      expect(isValidSenderAddress('DigitalDepot <invalid>')).toBe(false);
    });
  });

  describe('Production Email Configuration Rules', () => {
    it('a. Production + console → rejected', () => {
      const result = envSchema.safeParse({
        ...baseValidProdEnv,
        EMAIL_PROVIDER: 'console',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.EMAIL_PROVIDER).toBeDefined();
        expect(errors.EMAIL_PROVIDER?.[0]).toContain(
          'console transport is forbidden in production',
        );
      }
    });

    it('b. Production + missing Resend API key → rejected', () => {
      const result = envSchema.safeParse({
        ...baseValidProdEnv,
        RESEND_API_KEY: undefined,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.RESEND_API_KEY).toBeDefined();
        expect(errors.RESEND_API_KEY?.[0]).toContain('RESEND_API_KEY is required');
      }
    });

    it('b2. Production + empty Resend API key → rejected', () => {
      const result = envSchema.safeParse({
        ...baseValidProdEnv,
        RESEND_API_KEY: '   ',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.RESEND_API_KEY).toBeDefined();
        expect(errors.RESEND_API_KEY?.[0]).toContain(
          'RESEND_API_KEY is required and cannot be empty',
        );
      }
    });

    it('c. Production + missing/invalid sender address → rejected', () => {
      const resultMissing = envSchema.safeParse({
        ...baseValidProdEnv,
        EMAIL_FROM: '',
      });

      expect(resultMissing.success).toBe(false);
      if (!resultMissing.success) {
        const errors = resultMissing.error.flatten().fieldErrors;
        expect(errors.EMAIL_FROM).toBeDefined();
        expect(errors.EMAIL_FROM?.[0]).toContain('EMAIL_FROM must be a valid sender address');
      }

      const resultInvalid = envSchema.safeParse({
        ...baseValidProdEnv,
        EMAIL_FROM: 'not-an-email',
      });

      expect(resultInvalid.success).toBe(false);
      if (!resultInvalid.success) {
        const errors = resultInvalid.error.flatten().fieldErrors;
        expect(errors.EMAIL_FROM).toBeDefined();
        expect(errors.EMAIL_FROM?.[0]).toContain('EMAIL_FROM must be a valid sender address');
      }
    });

    it('d. Production + valid Resend configuration → accepted', () => {
      const result = envSchema.safeParse(baseValidProdEnv);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('production');
        expect(result.data.EMAIL_PROVIDER).toBe('resend');
        expect(result.data.RESEND_API_KEY).toBe('re_production_key_12345');
        expect(result.data.EMAIL_FROM).toBe('DigitalDepot <noreply@digitaldepot.com>');
      }
    });

    it('e. Development/test + console → accepted', () => {
      const devEnv = {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/digitaldepot',
        EMAIL_PROVIDER: 'console',
      };

      const devResult = envSchema.safeParse(devEnv);
      expect(devResult.success).toBe(true);
      if (devResult.success) {
        expect(devResult.data.EMAIL_PROVIDER).toBe('console');
        expect(devResult.data.RESEND_API_KEY).toBeUndefined();
      }

      const testEnv = {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/digitaldepot',
        TEST_DATABASE_URL: 'postgresql://user:pass@localhost:5432/digitaldepot_test',
        EMAIL_PROVIDER: 'console',
      };

      const testResult = envSchema.safeParse(testEnv);
      expect(testResult.success).toBe(true);
      if (testResult.success) {
        expect(testResult.data.EMAIL_PROVIDER).toBe('console');
      }
    });
  });

  describe('OAuth Configuration Rules', () => {
    it('rejects OAUTH_ENCRYPTION_SECRET that is not exactly 64 hex characters (32 decoded bytes)', () => {
      const tooLong = envSchema.safeParse({
        ...baseValidProdEnv,
        OAUTH_ENCRYPTION_SECRET:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef00',
      });
      expect(tooLong.success).toBe(false);

      const invalidChars = envSchema.safeParse({
        ...baseValidProdEnv,
        OAUTH_ENCRYPTION_SECRET: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
      });
      expect(invalidChars.success).toBe(false);

      const invalidLength = envSchema.safeParse({
        ...baseValidProdEnv,
        OAUTH_ENCRYPTION_SECRET: '0123456789abcdef',
      });
      expect(invalidLength.success).toBe(false);
    });

    it('rejects default or invalid OAuth configuration in production', () => {
      // Default google client id
      const res1 = envSchema.safeParse({
        ...baseValidProdEnv,
        GOOGLE_CLIENT_ID: 'dev-google-client-id',
      });
      expect(res1.success).toBe(false);

      // Google client id without apps.googleusercontent.com suffix
      const res2 = envSchema.safeParse({
        ...baseValidProdEnv,
        GOOGLE_CLIENT_ID: 'invalid-client-id.example.com',
      });
      expect(res2.success).toBe(false);

      // Default google client secret
      const res3 = envSchema.safeParse({
        ...baseValidProdEnv,
        GOOGLE_CLIENT_SECRET: 'dev-google-client-secret',
      });
      expect(res3.success).toBe(false);

      // Non-https callback url
      const res4 = envSchema.safeParse({
        ...baseValidProdEnv,
        GOOGLE_CALLBACK_URL: 'http://digitaldepot.com/api/auth/oauth/google/callback',
      });
      expect(res4.success).toBe(false);

      // Default oauth encryption secret in prod
      const res5 = envSchema.safeParse({
        ...baseValidProdEnv,
        OAUTH_ENCRYPTION_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      });
      expect(res5.success).toBe(false);

      // Default oauth state secret in prod
      const res6 = envSchema.safeParse({
        ...baseValidProdEnv,
        OAUTH_STATE_SECRET: 'dev-oauth-state-secret-minimum-32-characters-long!',
      });
      expect(res6.success).toBe(false);
    });

    it('rejects sandbox mode and default credentials in production', () => {
      // Sandbox mode true in prod
      const resSandbox = envSchema.safeParse({
        ...baseValidProdEnv,
        SSLCOMMERZ_IS_SANDBOX: true,
      });
      expect(resSandbox.success).toBe(false);
      if (!resSandbox.success) {
        expect(resSandbox.error.flatten().fieldErrors.SSLCOMMERZ_IS_SANDBOX?.[0]).toContain(
          'SSLCOMMERZ_IS_SANDBOX must be false',
        );
      }

      // Default store id in prod
      const resStoreId = envSchema.safeParse({
        ...baseValidProdEnv,
        SSLCOMMERZ_STORE_ID: 'digitaldepot_sandbox_store',
      });
      expect(resStoreId.success).toBe(false);
      if (!resStoreId.success) {
        expect(resStoreId.error.flatten().fieldErrors.SSLCOMMERZ_STORE_ID?.[0]).toContain(
          'SSLCOMMERZ_STORE_ID must be configured',
        );
      }

      // Default store password in prod
      const resPassword = envSchema.safeParse({
        ...baseValidProdEnv,
        SSLCOMMERZ_STORE_PASSWORD: 'digitaldepot_sandbox_password',
      });
      expect(resPassword.success).toBe(false);
      if (!resPassword.success) {
        expect(resPassword.error.flatten().fieldErrors.SSLCOMMERZ_STORE_PASSWORD?.[0]).toContain(
          'SSLCOMMERZ_STORE_PASSWORD must be configured',
        );
      }
    });
  });
});
