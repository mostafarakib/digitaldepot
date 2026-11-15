import { describe, it, expect } from 'vitest';
import { toBengaliDigits, formatPoishaToBDT } from '@/lib/utils';
import enMessages from '@/messages/en.json';
import bnMessages from '@/messages/bn.json';

describe('Phase 9C: UI Polish & Localization Utilities', () => {
  describe('toBengaliDigits', () => {
    it('should convert single digits accurately', () => {
      expect(toBengaliDigits(0)).toBe('০');
      expect(toBengaliDigits(1)).toBe('১');
      expect(toBengaliDigits(2)).toBe('২');
      expect(toBengaliDigits(3)).toBe('৩');
      expect(toBengaliDigits(4)).toBe('৪');
      expect(toBengaliDigits(5)).toBe('৫');
      expect(toBengaliDigits(6)).toBe('৬');
      expect(toBengaliDigits(7)).toBe('৭');
      expect(toBengaliDigits(8)).toBe('৮');
      expect(toBengaliDigits(9)).toBe('৯');
    });

    it('should convert multi-digit numbers and strings', () => {
      expect(toBengaliDigits(1234567890)).toBe('১২৩৪৫৬৭৮৯০');
      expect(toBengaliDigits('Order #4502')).toBe('Order #৪৫০২');
    });

    it('should preserve non-digit characters', () => {
      expect(toBengaliDigits('99+ items')).toBe('৯৯+ items');
    });
  });

  describe('formatPoishaToBDT', () => {
    it('should format poisha in English by default', () => {
      expect(formatPoishaToBDT(100000)).toBe('৳1,000');
      expect(formatPoishaToBDT(2500000)).toBe('৳25,000');
    });

    it('should format poisha with Bengali numerals when locale is bn', () => {
      expect(formatPoishaToBDT(100000, 'bn')).toBe('৳১,০০০');
      expect(formatPoishaToBDT(2500000, 'bn')).toBe('৳২৫,০০০');
    });
  });

  describe('Localization Parity for Phase 9C Common Keys', () => {
    const requiredCommonKeys = [
      'retry',
      'tryAgain',
      'loading',
      'errorTitle',
      'close',
      'backToOrders',
      'backToReturns',
      'cartWithCount',
      'wishlistWithCount',
      'orderNotFound',
      'returnNotFound',
    ] as const;

    it('should have all Phase 9C common keys defined in English', () => {
      for (const key of requiredCommonKeys) {
        expect(enMessages.common).toHaveProperty(key);
        expect((enMessages.common as Record<string, string>)[key].length).toBeGreaterThan(0);
      }
    });

    it('should have all Phase 9C common keys defined in Bengali', () => {
      for (const key of requiredCommonKeys) {
        expect(bnMessages.common).toHaveProperty(key);
        expect((bnMessages.common as Record<string, string>)[key].length).toBeGreaterThan(0);
      }
    });

    it('should maintain exact 1:1 key parity between en.json and bn.json', () => {
      function getDeepKeys(obj: Record<string, unknown>, prefix = ''): string[] {
        let keys: string[] = [];
        for (const [k, v] of Object.entries(obj)) {
          const fullKey = prefix ? `${prefix}.${k}` : k;
          if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
            keys = keys.concat(getDeepKeys(v as Record<string, unknown>, fullKey));
          } else {
            keys.push(fullKey);
          }
        }
        return keys;
      }

      const enKeys = new Set(getDeepKeys(enMessages as Record<string, unknown>));
      const bnKeys = new Set(getDeepKeys(bnMessages as Record<string, unknown>));

      const missingInBn = [...enKeys].filter((k) => !bnKeys.has(k));
      const missingInEn = [...bnKeys].filter((k) => !enKeys.has(k));

      expect(missingInBn).toEqual([]);
      expect(missingInEn).toEqual([]);
    });
  });
});
