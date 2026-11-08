import { describe, it, expect } from 'vitest';
import { profileFormSchema, BD_PHONE_REGEX } from '../auth-schemas';

describe('Profile Form Schema & BD Phone Regex Tests', () => {
  describe('BD_PHONE_REGEX', () => {
    it('accepts standard 11-digit local format: 01[3-9]XXXXXXXX', () => {
      expect(BD_PHONE_REGEX.test('01712345678')).toBe(true);
      expect(BD_PHONE_REGEX.test('01312345678')).toBe(true);
      expect(BD_PHONE_REGEX.test('01412345678')).toBe(true);
      expect(BD_PHONE_REGEX.test('01512345678')).toBe(true);
      expect(BD_PHONE_REGEX.test('01612345678')).toBe(true);
      expect(BD_PHONE_REGEX.test('01812345678')).toBe(true);
      expect(BD_PHONE_REGEX.test('01912345678')).toBe(true);
    });

    it('accepts full international format with plus: +8801[3-9]XXXXXXXX', () => {
      expect(BD_PHONE_REGEX.test('+8801712345678')).toBe(true);
      expect(BD_PHONE_REGEX.test('+8801912345678')).toBe(true);
    });

    it('accepts international format without plus: 8801[3-9]XXXXXXXX', () => {
      expect(BD_PHONE_REGEX.test('8801712345678')).toBe(true);
      expect(BD_PHONE_REGEX.test('8801812345678')).toBe(true);
    });

    it('rejects invalid prefixes and invalid operator codes', () => {
      expect(BD_PHONE_REGEX.test('01012345678')).toBe(false); // 010 invalid operator
      expect(BD_PHONE_REGEX.test('01112345678')).toBe(false); // 011 invalid operator
      expect(BD_PHONE_REGEX.test('01212345678')).toBe(false); // 012 invalid operator
      expect(BD_PHONE_REGEX.test('02712345678')).toBe(false); // landline prefix
      expect(BD_PHONE_REGEX.test('+14155552671')).toBe(false); // US format
    });

    it('rejects numbers with incorrect lengths or non-numeric characters', () => {
      expect(BD_PHONE_REGEX.test('0171234567')).toBe(false); // too short
      expect(BD_PHONE_REGEX.test('017123456789')).toBe(false); // too long
      expect(BD_PHONE_REGEX.test('01712-345678')).toBe(false); // hyphenated
      expect(BD_PHONE_REGEX.test('017 12345678')).toBe(false); // spaced
    });
  });

  describe('profileFormSchema', () => {
    it('accepts valid profile with all three BD phone formats', () => {
      expect(
        profileFormSchema.safeParse({
          firstName: 'Rahim',
          lastName: 'Chowdhury',
          phone: '01712345678',
        }).success,
      ).toBe(true);

      expect(
        profileFormSchema.safeParse({
          firstName: 'Rahim',
          lastName: 'Chowdhury',
          phone: '+8801712345678',
        }).success,
      ).toBe(true);

      expect(
        profileFormSchema.safeParse({
          firstName: 'Rahim',
          lastName: 'Chowdhury',
          phone: '8801712345678',
        }).success,
      ).toBe(true);
    });

    it('accepts empty string phone (for clearing phone)', () => {
      const res = profileFormSchema.safeParse({
        firstName: 'Rahim',
        lastName: 'Chowdhury',
        phone: '',
      });
      expect(res.success).toBe(true);
    });

    it('accepts omitted phone', () => {
      const res = profileFormSchema.safeParse({
        firstName: 'Rahim',
        lastName: 'Chowdhury',
      });
      expect(res.success).toBe(true);
    });

    it('rejects empty or whitespace-only first and last names', () => {
      const res1 = profileFormSchema.safeParse({
        firstName: '   ',
        lastName: 'Chowdhury',
      });
      expect(res1.success).toBe(false);

      const res2 = profileFormSchema.safeParse({
        firstName: 'Rahim',
        lastName: '',
      });
      expect(res2.success).toBe(false);
    });

    it('rejects first and last names longer than 50 characters', () => {
      const res = profileFormSchema.safeParse({
        firstName: 'a'.repeat(51),
        lastName: 'Chowdhury',
      });
      expect(res.success).toBe(false);
    });

    it('rejects invalid phone format with informative error message', () => {
      const res = profileFormSchema.safeParse({
        firstName: 'Rahim',
        lastName: 'Chowdhury',
        phone: '12345',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.flatten().fieldErrors.phone?.[0]).toContain('Invalid Bangladesh phone');
      }
    });
  });
});
