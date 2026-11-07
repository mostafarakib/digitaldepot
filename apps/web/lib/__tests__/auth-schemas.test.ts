import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  registerFormSchema,
  loginSchema,
  forgotPasswordFormSchema,
  resetPasswordFormSchema,
  changePasswordFormSchema,
  resendVerificationFormSchema,
} from '../auth-schemas';

describe('Auth Schemas Consistency Tests', () => {
  describe('registerSchema & Password Validation', () => {
    it('accepts passwords of exactly 8 characters with any characters', () => {
      const valid = {
        firstName: 'Rahim',
        lastName: 'Uddin',
        email: 'rahim@example.com',
        password: 'password', // 8 chars, all lowercase
      };
      const res = registerSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it('rejects passwords shorter than 8 characters', () => {
      const invalid = {
        firstName: 'Rahim',
        lastName: 'Uddin',
        email: 'rahim@example.com',
        password: 'pass123', // 7 chars
      };
      const res = registerSchema.safeParse(invalid);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.flatten().fieldErrors.password?.[0]).toContain('at least 8 characters');
      }
    });

    it('accepts passwords up to 128 characters and rejects 129 characters', () => {
      const valid128 = {
        firstName: 'Rahim',
        lastName: 'Uddin',
        email: 'rahim@example.com',
        password: 'a'.repeat(128),
      };
      expect(registerSchema.safeParse(valid128).success).toBe(true);

      const invalid129 = {
        firstName: 'Rahim',
        lastName: 'Uddin',
        email: 'rahim@example.com',
        password: 'a'.repeat(129),
      };
      expect(registerSchema.safeParse(invalid129).success).toBe(false);
    });

    it('does not impose arbitrary complexity requirements like uppercase or special characters', () => {
      const noSpecial = {
        firstName: 'Tanvir',
        lastName: 'Ahmed',
        email: 'tanvir@example.com',
        password: 'simplelongpassword',
      };
      expect(registerSchema.safeParse(noSpecial).success).toBe(true);
    });

    it('normalizes email to lowercase and trims names', () => {
      const res = registerSchema.safeParse({
        firstName: '  Tanvir  ',
        lastName: '  Ahmed  ',
        email: '  Tanvir.Ahmed@Example.COM  ',
        password: 'StrongPassword123',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.firstName).toBe('Tanvir');
        expect(res.data.lastName).toBe('Ahmed');
        expect(res.data.email).toBe('tanvir.ahmed@example.com');
      }
    });
  });

  describe('registerFormSchema with Confirmation', () => {
    it('accepts matching password and confirmPassword', () => {
      const res = registerFormSchema.safeParse({
        firstName: 'Tanvir',
        lastName: 'Ahmed',
        email: 'tanvir@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      });
      expect(res.success).toBe(true);
    });

    it('rejects mismatched confirmPassword', () => {
      const res = registerFormSchema.safeParse({
        firstName: 'Tanvir',
        lastName: 'Ahmed',
        email: 'tanvir@example.com',
        password: 'password123',
        confirmPassword: 'differentpassword',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.flatten().fieldErrors.confirmPassword?.[0]).toBe('Passwords do not match');
      }
    });
  });

  describe('loginSchema', () => {
    it('requires email and password', () => {
      expect(
        loginSchema.safeParse({ email: 'user@example.com', password: 'password' }).success,
      ).toBe(true);
      expect(loginSchema.safeParse({ email: 'invalid-email', password: 'password' }).success).toBe(
        false,
      );
      expect(loginSchema.safeParse({ email: 'user@example.com', password: '' }).success).toBe(
        false,
      );
    });
  });

  describe('forgotPasswordFormSchema', () => {
    it('accepts valid email and normalizes', () => {
      const res = forgotPasswordFormSchema.safeParse({ email: '  Test.User@example.com  ' });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.email).toBe('test.user@example.com');
      }
    });

    it('rejects invalid email formats', () => {
      expect(forgotPasswordFormSchema.safeParse({ email: '' }).success).toBe(false);
      expect(forgotPasswordFormSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
    });
  });

  describe('resetPasswordFormSchema', () => {
    it('accepts matching passwords between 8 and 128 characters', () => {
      const res = resetPasswordFormSchema.safeParse({
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
      });
      expect(res.success).toBe(true);
    });

    it('rejects passwords shorter than 8 characters', () => {
      const res = resetPasswordFormSchema.safeParse({
        password: 'short7!',
        confirmPassword: 'short7!',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.flatten().fieldErrors.password?.[0]).toContain('at least 8 characters');
      }
    });

    it('rejects passwords exceeding 128 characters', () => {
      const longPass = 'A'.repeat(129);
      const res = resetPasswordFormSchema.safeParse({
        password: longPass,
        confirmPassword: longPass,
      });
      expect(res.success).toBe(false);
    });

    it('rejects mismatched passwords', () => {
      const res = resetPasswordFormSchema.safeParse({
        password: 'Password123!',
        confirmPassword: 'DifferentPassword456!',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.flatten().fieldErrors.confirmPassword?.[0]).toBe('Passwords do not match');
      }
    });
  });

  describe('changePasswordFormSchema', () => {
    it('accepts valid password change input with distinct passwords', () => {
      const res = changePasswordFormSchema.safeParse({
        currentPassword: 'OldPassword123!',
        newPassword: 'BrandNewPassword456!',
        confirmPassword: 'BrandNewPassword456!',
        revokeAllSessions: true,
      });
      expect(res.success).toBe(true);
    });

    it('rejects identical new and current passwords', () => {
      const res = changePasswordFormSchema.safeParse({
        currentPassword: 'SamePassword123!',
        newPassword: 'SamePassword123!',
        confirmPassword: 'SamePassword123!',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.flatten().fieldErrors.newPassword?.[0]).toContain('must be different');
      }
    });

    it('rejects mismatched new password and confirmation', () => {
      const res = changePasswordFormSchema.safeParse({
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewPassword123!',
        confirmPassword: 'MismatchPassword456!',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.flatten().fieldErrors.confirmPassword?.[0]).toBe('Passwords do not match');
      }
    });

    it('rejects new password under 8 characters', () => {
      const res = changePasswordFormSchema.safeParse({
        currentPassword: 'CurrentPassword123!',
        newPassword: 'short',
        confirmPassword: 'short',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.flatten().fieldErrors.newPassword?.[0]).toContain('at least 8 characters');
      }
    });
  });

  describe('resendVerificationFormSchema', () => {
    it('accepts valid email or empty email', () => {
      expect(resendVerificationFormSchema.safeParse({ email: 'user@example.com' }).success).toBe(
        true,
      );
      expect(resendVerificationFormSchema.safeParse({}).success).toBe(true);
      expect(resendVerificationFormSchema.safeParse({ email: '' }).success).toBe(false);
    });
  });
});
