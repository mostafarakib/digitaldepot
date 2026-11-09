import { z } from 'zod';
import { BadRequestError } from '../../lib/errors.js';
import { DEFAULT_OAUTH_RETURN_URL } from './auth.constants.js';

const DUMMY_BASE_ORIGIN = 'http://localhost';

/**
 * Validates that an OAuth returnUrl is strictly a safe relative path.
 * Neutralizes single, double, and nested URL encoding attacks.
 */
export function validateSafeReturnUrl(
  input: unknown,
  defaultUrl = DEFAULT_OAUTH_RETURN_URL,
): string {
  if (typeof input !== 'string' || input.trim().length === 0) {
    return defaultUrl;
  }

  const trimmed = input.trim();

  // 1. Literal path safety
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    throw new BadRequestError('INVALID_RETURN_URL', 'Return URL must be a relative path');
  }

  // 2. Reject control characters (0x00 - 0x1F, 0x7F)
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    throw new BadRequestError(
      'INVALID_RETURN_URL',
      'Return URL contains invalid control characters',
    );
  }

  // 3. Iterative decoding check: neutralizes double and nested encodings (%255C, %252F, etc.)
  let current = trimmed;
  let iterations = 0;
  const maxIterations = 3;

  while (current.includes('%') && iterations < maxIterations) {
    iterations++;
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;

      // Inspect decoded form on every layer
      if (current.includes('\\') || current.startsWith('//') || /[\x00-\x1F\x7F]/.test(current)) {
        throw new BadRequestError(
          'INVALID_RETURN_URL',
          'Return URL contains dangerous encoded characters',
        );
      }
    } catch (err) {
      if (err instanceof BadRequestError) throw err;
      throw new BadRequestError(
        'INVALID_RETURN_URL',
        'Return URL contains malformed percent encoding',
      );
    }
  }

  // If still containing raw percent signs after max iterations, reject as deeply nested
  if (current.includes('%')) {
    throw new BadRequestError(
      'INVALID_RETURN_URL',
      'Return URL exceeds maximum permitted encoding depth',
    );
  }

  // 4. Authoritative URL parser against fixed origin
  let parsed: URL;
  try {
    parsed = new URL(trimmed, DUMMY_BASE_ORIGIN);
  } catch {
    throw new BadRequestError('INVALID_RETURN_URL', 'Return URL is not a valid relative path');
  }

  if (parsed.origin !== DUMMY_BASE_ORIGIN) {
    throw new BadRequestError('INVALID_RETURN_URL', 'Return URL cannot specify an external origin');
  }

  if (!parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) {
    throw new BadRequestError('INVALID_RETURN_URL', 'Return URL pathname must be relative');
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export const safeRelativeUrlSchema = z
  .string()
  .superRefine((val, ctx) => {
    try {
      validateSafeReturnUrl(val);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid return URL';
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
      });
    }
  })
  .transform((val) => validateSafeReturnUrl(val));

export const registerSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'First name is required')
    .max(50, 'First name cannot exceed 50 characters'),
  lastName: z
    .string()
    .trim()
    .min(1, 'Last name is required')
    .max(50, 'Last name cannot exceed 50 characters'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email address')
    .max(254, 'Email cannot exceed 254 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password cannot exceed 128 characters'),
  locale: z.enum(['en', 'bn']).optional().default('en'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password cannot exceed 128 characters'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  locale: z.enum(['en', 'bn']).optional().default('en'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password cannot exceed 128 characters'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Current password is required')
      .max(128, 'Password cannot exceed 128 characters'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .max(128, 'Password cannot exceed 128 characters'),
    revokeAllSessions: z.boolean().optional().default(false),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

export const revokeSessionParamsSchema = z.object({
  id: z.string().min(1, 'Session ID is required'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

export const resendVerificationSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address').optional(),
  locale: z.enum(['en', 'bn']).optional().default('en'),
});

export const oauthInitiateQuerySchema = z.object({
  returnUrl: safeRelativeUrlSchema.optional(),
});

export const oauthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State is required'),
});

export const confirmLinkSchema = z.object({
  challengePrefix: z.string().regex(/^[A-Za-z0-9_-]{16}$/, 'Invalid challenge prefix'),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password cannot exceed 128 characters'),
});

export const confirmPasswordSchema = z.object({
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password cannot exceed 128 characters'),
});

export const setPasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password cannot exceed 128 characters'),
});

export const oauthReauthSchema = z.object({
  returnUrl: safeRelativeUrlSchema.optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type OAuthInitiateQueryInput = z.infer<typeof oauthInitiateQuerySchema>;
export type OAuthCallbackInput = z.infer<typeof oauthCallbackSchema>;
export type ConfirmLinkInput = z.infer<typeof confirmLinkSchema>;
export type ConfirmPasswordInput = z.infer<typeof confirmPasswordSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type OAuthReauthInput = z.infer<typeof oauthReauthSchema>;
