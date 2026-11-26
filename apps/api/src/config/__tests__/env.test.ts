import { describe, it, expect } from 'vitest';
import {
  envSchema,
  isValidSenderAddress,
  isGoogleOAuthConfigured,
  isSslcommerzConfigured,
  isCloudinaryConfigured,
} from '../env.js';

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

    it('d2. Production + valid Brevo configuration → accepted (without requiring RESEND_API_KEY)', () => {
      const result = envSchema.safeParse({
        ...baseValidProdEnv,
        EMAIL_PROVIDER: 'brevo',
        BREVO_API_KEY: 'xkeysib-production-key-12345',
        RESEND_API_KEY: undefined,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('production');
        expect(result.data.EMAIL_PROVIDER).toBe('brevo');
        expect(result.data.BREVO_API_KEY).toBe('xkeysib-production-key-12345');
        expect(result.data.RESEND_API_KEY).toBeUndefined();
      }
    });

    it('d3. Production + Brevo + missing or empty BREVO_API_KEY → rejected', () => {
      const missingKey = envSchema.safeParse({
        ...baseValidProdEnv,
        EMAIL_PROVIDER: 'brevo',
        BREVO_API_KEY: undefined,
        RESEND_API_KEY: undefined,
      });

      expect(missingKey.success).toBe(false);
      if (!missingKey.success) {
        const errors = missingKey.error.flatten().fieldErrors;
        expect(errors.BREVO_API_KEY?.[0]).toContain('BREVO_API_KEY is required');
      }

      const emptyKey = envSchema.safeParse({
        ...baseValidProdEnv,
        EMAIL_PROVIDER: 'brevo',
        BREVO_API_KEY: '   ',
        RESEND_API_KEY: undefined,
      });

      expect(emptyKey.success).toBe(false);
      if (!emptyKey.success) {
        const errors = emptyKey.error.flatten().fieldErrors;
        expect(errors.BREVO_API_KEY?.[0]).toContain(
          'BREVO_API_KEY is required and cannot be empty',
        );
      }
    });

    it('d4. Development + Brevo + missing BREVO_API_KEY → rejected (no silent fallback)', () => {
      const devBrevoNoKey = envSchema.safeParse({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/digitaldepot',
        EMAIL_PROVIDER: 'brevo',
        BREVO_API_KEY: undefined,
      });

      expect(devBrevoNoKey.success).toBe(false);
      if (!devBrevoNoKey.success) {
        const errors = devBrevoNoKey.error.flatten().fieldErrors;
        expect(errors.BREVO_API_KEY?.[0]).toContain('BREVO_API_KEY is required');
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

  describe('Google OAuth Configuration Rules', () => {
    it('allows production startup with Google OAuth completely unconfigured/disabled', () => {
      const noOAuthEnv = {
        ...baseValidProdEnv,
        GOOGLE_CLIENT_ID: undefined,
        GOOGLE_CLIENT_SECRET: undefined,
        GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/oauth/google/callback',
      };

      const res = envSchema.safeParse(noOAuthEnv);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.GOOGLE_CLIENT_ID).toBeUndefined();
        expect(res.data.GOOGLE_CLIENT_SECRET).toBeUndefined();
        expect(isGoogleOAuthConfigured(res.data)).toBe(false);
      }
    });

    it('fails production startup with partially configured Google OAuth', () => {
      // Only client ID
      const onlyClientId = envSchema.safeParse({
        ...baseValidProdEnv,
        GOOGLE_CLIENT_ID: '1234567890-prod.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: undefined,
      });
      expect(onlyClientId.success).toBe(false);
      if (!onlyClientId.success) {
        expect(onlyClientId.error.flatten().fieldErrors.GOOGLE_CLIENT_SECRET?.[0]).toContain(
          'GOOGLE_CLIENT_SECRET is required when GOOGLE_CLIENT_ID is configured',
        );
      }

      // Only client secret
      const onlyClientSecret = envSchema.safeParse({
        ...baseValidProdEnv,
        GOOGLE_CLIENT_ID: undefined,
        GOOGLE_CLIENT_SECRET: 'prod-secret-12345',
      });
      expect(onlyClientSecret.success).toBe(false);
      if (!onlyClientSecret.success) {
        expect(onlyClientSecret.error.flatten().fieldErrors.GOOGLE_CLIENT_ID?.[0]).toContain(
          'GOOGLE_CLIENT_ID is required when GOOGLE_CLIENT_SECRET is configured',
        );
      }
    });

    it('rejects placeholder Google OAuth credentials in any environment', () => {
      const resPlaceholderId = envSchema.safeParse({
        ...baseValidProdEnv,
        GOOGLE_CLIENT_ID: 'dev-google-client-id',
        GOOGLE_CLIENT_SECRET: 'real-secret-12345',
      });
      expect(resPlaceholderId.success).toBe(false);
      if (!resPlaceholderId.success) {
        expect(resPlaceholderId.error.flatten().fieldErrors.GOOGLE_CLIENT_ID?.[0]).toContain(
          'must not use placeholder credentials',
        );
      }

      const resPlaceholderSecret = envSchema.safeParse({
        ...baseValidProdEnv,
        GOOGLE_CLIENT_ID: '1234567890-prod.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'dev-google-client-secret',
      });
      expect(resPlaceholderSecret.success).toBe(false);
      if (!resPlaceholderSecret.success) {
        expect(
          resPlaceholderSecret.error.flatten().fieldErrors.GOOGLE_CLIENT_SECRET?.[0],
        ).toContain('must not use placeholder credentials');
      }
    });

    it('requires valid Google client ID domain and HTTPS callback in production when configured', () => {
      const invalidDomain = envSchema.safeParse({
        ...baseValidProdEnv,
        GOOGLE_CLIENT_ID: 'my-app.example.com',
      });
      expect(invalidDomain.success).toBe(false);
      if (!invalidDomain.success) {
        expect(invalidDomain.error.flatten().fieldErrors.GOOGLE_CLIENT_ID?.[0]).toContain(
          'must be a valid Google OAuth Client ID ending with .apps.googleusercontent.com',
        );
      }

      const insecureCallback = envSchema.safeParse({
        ...baseValidProdEnv,
        GOOGLE_CALLBACK_URL: 'http://digitaldepot.com/api/auth/oauth/google/callback',
      });
      expect(insecureCallback.success).toBe(false);
      if (!insecureCallback.success) {
        expect(insecureCallback.error.flatten().fieldErrors.GOOGLE_CALLBACK_URL?.[0]).toContain(
          'must use https://',
        );
      }
    });
  });

  describe('SSLCommerz Payment Gateway Configuration Rules', () => {
    it('allows production startup with SSLCommerz completely unconfigured', () => {
      const noPaymentEnv = {
        ...baseValidProdEnv,
        SSLCOMMERZ_STORE_ID: undefined,
        SSLCOMMERZ_STORE_PASSWORD: undefined,
      };

      const res = envSchema.safeParse(noPaymentEnv);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.SSLCOMMERZ_STORE_ID).toBeUndefined();
        expect(res.data.SSLCOMMERZ_STORE_PASSWORD).toBeUndefined();
        expect(isSslcommerzConfigured(res.data)).toBe(false);
      }
    });

    it('allows production startup with explicitly configured sandbox mode for portfolio demo', () => {
      const sandboxProdEnv = {
        ...baseValidProdEnv,
        SSLCOMMERZ_STORE_ID: 'valid_demo_store_id_123',
        SSLCOMMERZ_STORE_PASSWORD: 'valid_demo_store_password_456',
        SSLCOMMERZ_IS_SANDBOX: true,
      };

      const res = envSchema.safeParse(sandboxProdEnv);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.SSLCOMMERZ_IS_SANDBOX).toBe(true);
        expect(res.data.SSLCOMMERZ_STORE_ID).toBe('valid_demo_store_id_123');
        expect(isSslcommerzConfigured(res.data)).toBe(true);
      }
    });

    it('allows production startup with live mode when configured with valid credentials', () => {
      const liveProdEnv = {
        ...baseValidProdEnv,
        SSLCOMMERZ_STORE_ID: 'valid_live_store_id_999',
        SSLCOMMERZ_STORE_PASSWORD: 'valid_live_store_password_888',
        SSLCOMMERZ_IS_SANDBOX: 'false',
      };

      const res = envSchema.safeParse(liveProdEnv);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.SSLCOMMERZ_IS_SANDBOX).toBe(false);
        expect(res.data.SSLCOMMERZ_STORE_ID).toBe('valid_live_store_id_999');
        expect(isSslcommerzConfigured(res.data)).toBe(true);
      }
    });

    it('requires explicit SSLCOMMERZ_IS_SANDBOX in production when credentials are configured and rejects invalid values', () => {
      const omittedMode = envSchema.safeParse({
        ...baseValidProdEnv,
        SSLCOMMERZ_IS_SANDBOX: undefined,
      });
      expect(omittedMode.success).toBe(false);
      if (!omittedMode.success) {
        expect(omittedMode.error.flatten().fieldErrors.SSLCOMMERZ_IS_SANDBOX?.[0]).toContain(
          'must be explicitly set',
        );
      }

      const invalidMode = envSchema.safeParse({
        ...baseValidProdEnv,
        SSLCOMMERZ_IS_SANDBOX: 'invalid_bool',
      });
      expect(invalidMode.success).toBe(false);
    });

    it('validates optional SSLCOMMERZ_IPN_URL and requires HTTPS in production', () => {
      const validHttps = envSchema.safeParse({
        ...baseValidProdEnv,
        SSLCOMMERZ_IPN_URL: 'https://tunnel.example.com/api/v1/payments/sslcommerz/ipn',
      });
      expect(validHttps.success).toBe(true);
      if (validHttps.success) {
        expect(validHttps.data.SSLCOMMERZ_IPN_URL).toBe(
          'https://tunnel.example.com/api/v1/payments/sslcommerz/ipn',
        );
      }

      const emptyString = envSchema.safeParse({
        ...baseValidProdEnv,
        SSLCOMMERZ_IPN_URL: '   ',
      });
      expect(emptyString.success).toBe(true);
      if (emptyString.success) {
        expect(emptyString.data.SSLCOMMERZ_IPN_URL).toBeUndefined();
      }

      const invalidUrl = envSchema.safeParse({
        ...baseValidProdEnv,
        SSLCOMMERZ_IPN_URL: 'not-a-valid-url',
      });
      expect(invalidUrl.success).toBe(false);

      const nonHttpScheme = envSchema.safeParse({
        ...baseValidProdEnv,
        SSLCOMMERZ_IPN_URL: 'ftp://tunnel.example.com/ipn',
      });
      expect(nonHttpScheme.success).toBe(false);

      const httpInProd = envSchema.safeParse({
        ...baseValidProdEnv,
        SSLCOMMERZ_IPN_URL: 'http://tunnel.example.com/api/v1/payments/sslcommerz/ipn',
      });
      expect(httpInProd.success).toBe(false);
    });

    it('fails production startup with partially configured SSLCommerz', () => {
      const onlyStoreId = envSchema.safeParse({
        ...baseValidProdEnv,
        SSLCOMMERZ_STORE_ID: 'valid_store_id',
        SSLCOMMERZ_STORE_PASSWORD: undefined,
      });
      expect(onlyStoreId.success).toBe(false);
      if (!onlyStoreId.success) {
        expect(onlyStoreId.error.flatten().fieldErrors.SSLCOMMERZ_STORE_PASSWORD?.[0]).toContain(
          'SSLCOMMERZ_STORE_PASSWORD is required when SSLCOMMERZ_STORE_ID is configured',
        );
      }

      const onlyPassword = envSchema.safeParse({
        ...baseValidProdEnv,
        SSLCOMMERZ_STORE_ID: undefined,
        SSLCOMMERZ_STORE_PASSWORD: 'valid_store_password',
      });
      expect(onlyPassword.success).toBe(false);
      if (!onlyPassword.success) {
        expect(onlyPassword.error.flatten().fieldErrors.SSLCOMMERZ_STORE_ID?.[0]).toContain(
          'SSLCOMMERZ_STORE_ID is required when SSLCOMMERZ_STORE_PASSWORD is configured',
        );
      }
    });

    it('rejects placeholder SSLCommerz credentials in any environment', () => {
      const placeholderStoreId = envSchema.safeParse({
        ...baseValidProdEnv,
        SSLCOMMERZ_STORE_ID: 'digitaldepot_sandbox_store',
        SSLCOMMERZ_STORE_PASSWORD: 'real_password_12345',
      });
      expect(placeholderStoreId.success).toBe(false);
      if (!placeholderStoreId.success) {
        expect(placeholderStoreId.error.flatten().fieldErrors.SSLCOMMERZ_STORE_ID?.[0]).toContain(
          'must not use placeholder credentials',
        );
      }

      const placeholderPassword = envSchema.safeParse({
        ...baseValidProdEnv,
        SSLCOMMERZ_STORE_ID: 'real_store_12345',
        SSLCOMMERZ_STORE_PASSWORD: 'digitaldepot_sandbox_password',
      });
      expect(placeholderPassword.success).toBe(false);
      if (!placeholderPassword.success) {
        expect(
          placeholderPassword.error.flatten().fieldErrors.SSLCOMMERZ_STORE_PASSWORD?.[0],
        ).toContain('must not use placeholder credentials');
      }
    });
  });

  describe('Security Secrets Enforcement', () => {
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

    it('rejects default security secrets in production', () => {
      const resJwt = envSchema.safeParse({
        ...baseValidProdEnv,
        JWT_ACCESS_SECRET: 'dev-jwt-access-secret-minimum-32-characters-long',
      });
      expect(resJwt.success).toBe(false);
      if (!resJwt.success) {
        expect(resJwt.error.flatten().fieldErrors.JWT_ACCESS_SECRET?.[0]).toContain(
          'must be set to a secure secret in production',
        );
      }

      const resCsrf = envSchema.safeParse({
        ...baseValidProdEnv,
        CSRF_SECRET: 'dev-csrf-secret-minimum-32-characters-long-key',
      });
      expect(resCsrf.success).toBe(false);
      if (!resCsrf.success) {
        expect(resCsrf.error.flatten().fieldErrors.CSRF_SECRET?.[0]).toContain(
          'must be set to a secure secret in production',
        );
      }

      const resOauthEnc = envSchema.safeParse({
        ...baseValidProdEnv,
        OAUTH_ENCRYPTION_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      });
      expect(resOauthEnc.success).toBe(false);
      if (!resOauthEnc.success) {
        expect(resOauthEnc.error.flatten().fieldErrors.OAUTH_ENCRYPTION_SECRET?.[0]).toContain(
          'must be set to a secure unique 64-hex key',
        );
      }

      const resOauthState = envSchema.safeParse({
        ...baseValidProdEnv,
        OAUTH_STATE_SECRET: 'dev-oauth-state-secret-minimum-32-characters-long!',
      });
      expect(resOauthState.success).toBe(false);
      if (!resOauthState.success) {
        expect(resOauthState.error.flatten().fieldErrors.OAUTH_STATE_SECRET?.[0]).toContain(
          'must be set to a secure unique 32-character key',
        );
      }
    });
  });

  describe('Cloudinary Configuration Rules', () => {
    it('allows startup without Cloudinary credentials', () => {
      const res = envSchema.safeParse({
        ...baseValidProdEnv,
        CLOUDINARY_CLOUD_NAME: undefined,
        CLOUDINARY_API_KEY: undefined,
        CLOUDINARY_API_SECRET: undefined,
      });

      expect(res.success).toBe(true);
      if (res.success) {
        expect(isCloudinaryConfigured(res.data)).toBe(false);
      }
    });

    it('accepts complete non-placeholder Cloudinary credentials', () => {
      const res = envSchema.safeParse({
        ...baseValidProdEnv,
        CLOUDINARY_CLOUD_NAME: 'digitaldepot-prod',
        CLOUDINARY_API_KEY: '998877665544332',
        CLOUDINARY_API_SECRET: 'real-cloudinary-api-secret-xyz',
      });

      expect(res.success).toBe(true);
      if (res.success) {
        expect(isCloudinaryConfigured(res.data)).toBe(true);
      }
    });

    it('rejects partial or placeholder Cloudinary credentials', () => {
      const partial = envSchema.safeParse({
        ...baseValidProdEnv,
        CLOUDINARY_CLOUD_NAME: 'digitaldepot-prod',
        CLOUDINARY_API_KEY: undefined,
        CLOUDINARY_API_SECRET: undefined,
      });
      expect(partial.success).toBe(false);
      if (!partial.success) {
        expect(partial.error.flatten().fieldErrors.CLOUDINARY_API_KEY?.[0]).toContain(
          'CLOUDINARY_API_KEY is required',
        );
      }

      const placeholder = envSchema.safeParse({
        ...baseValidProdEnv,
        CLOUDINARY_CLOUD_NAME: 'your-cloudinary-cloud-name',
        CLOUDINARY_API_KEY: '998877665544332',
        CLOUDINARY_API_SECRET: 'real-secret',
      });
      expect(placeholder.success).toBe(false);
      if (!placeholder.success) {
        expect(placeholder.error.flatten().fieldErrors.CLOUDINARY_CLOUD_NAME?.[0]).toContain(
          'must not use placeholder credentials',
        );
      }
    });
  });
});
