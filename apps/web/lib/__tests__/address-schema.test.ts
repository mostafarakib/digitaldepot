import { describe, it, expect } from 'vitest';
import {
  addressFormSchema,
  buildCreateAddressPayload,
  buildUpdateAddressPayload,
} from '../auth-schemas';

describe('Address Form Schema & Payload Builders', () => {
  const validBaseData = {
    recipientName: 'Rahim Chowdhury',
    phone: '01712345678',
    divisionId: 'DHAKA',
    districtId: 'DHAKA',
    upazila: 'Dhanmondi',
    streetAddress: 'House 12, Road 4',
    postalCode: '1205',
    label: 'Home',
    isDefault: false,
  };

  describe('Validation Parity with Backend Constraints', () => {
    it('accepts valid address data with all 3 Bangladesh phone formats', () => {
      const formats = ['01712345678', '+8801712345678', '8801712345678'];
      for (const phone of formats) {
        const parsed = addressFormSchema.safeParse({ ...validBaseData, phone });
        expect(parsed.success).toBe(true);
      }
    });

    it('rejects invalid Bangladesh mobile number formats', () => {
      const invalidPhones = [
        '01212345678',
        '017123456',
        '017123456789',
        '+8801234567890',
        'invalid',
      ];
      for (const phone of invalidPhones) {
        const parsed = addressFormSchema.safeParse({ ...validBaseData, phone });
        expect(parsed.success).toBe(false);
      }
    });

    it('validates postal code: accepts 4 digits or empty string, rejects non-4 digits', () => {
      expect(addressFormSchema.safeParse({ ...validBaseData, postalCode: '1205' }).success).toBe(
        true,
      );
      expect(addressFormSchema.safeParse({ ...validBaseData, postalCode: '' }).success).toBe(true);
      expect(addressFormSchema.safeParse({ ...validBaseData, postalCode: undefined }).success).toBe(
        true,
      );

      expect(addressFormSchema.safeParse({ ...validBaseData, postalCode: '123' }).success).toBe(
        false,
      );
      expect(addressFormSchema.safeParse({ ...validBaseData, postalCode: '12345' }).success).toBe(
        false,
      );
      expect(addressFormSchema.safeParse({ ...validBaseData, postalCode: 'abcd' }).success).toBe(
        false,
      );
    });

    it('validates label length up to 50 characters and rejects exceeding', () => {
      expect(addressFormSchema.safeParse({ ...validBaseData, label: 'A'.repeat(50) }).success).toBe(
        true,
      );
      expect(addressFormSchema.safeParse({ ...validBaseData, label: 'A'.repeat(51) }).success).toBe(
        false,
      );
    });

    it('validates recipientName required (1-100 characters)', () => {
      expect(addressFormSchema.safeParse({ ...validBaseData, recipientName: '' }).success).toBe(
        false,
      );
      expect(addressFormSchema.safeParse({ ...validBaseData, recipientName: '   ' }).success).toBe(
        false,
      );
      expect(
        addressFormSchema.safeParse({ ...validBaseData, recipientName: 'A'.repeat(100) }).success,
      ).toBe(true);
      expect(
        addressFormSchema.safeParse({ ...validBaseData, recipientName: 'A'.repeat(101) }).success,
      ).toBe(false);
    });

    it('validates streetAddress (3-255 characters)', () => {
      expect(addressFormSchema.safeParse({ ...validBaseData, streetAddress: 'AB' }).success).toBe(
        false,
      );
      expect(addressFormSchema.safeParse({ ...validBaseData, streetAddress: 'ABC' }).success).toBe(
        true,
      );
      expect(
        addressFormSchema.safeParse({ ...validBaseData, streetAddress: 'A'.repeat(255) }).success,
      ).toBe(true);
      expect(
        addressFormSchema.safeParse({ ...validBaseData, streetAddress: 'A'.repeat(256) }).success,
      ).toBe(false);
    });

    it('validates upazila required (1-100 characters)', () => {
      expect(addressFormSchema.safeParse({ ...validBaseData, upazila: '' }).success).toBe(false);
      expect(
        addressFormSchema.safeParse({ ...validBaseData, upazila: 'A'.repeat(100) }).success,
      ).toBe(true);
      expect(
        addressFormSchema.safeParse({ ...validBaseData, upazila: 'A'.repeat(101) }).success,
      ).toBe(false);
    });

    it('validates divisionId and districtId required', () => {
      expect(addressFormSchema.safeParse({ ...validBaseData, divisionId: '' }).success).toBe(false);
      expect(addressFormSchema.safeParse({ ...validBaseData, districtId: '' }).success).toBe(false);
    });
  });

  describe('buildCreateAddressPayload', () => {
    it('trims fields, converts empty postalCode/label to null, and preserves selected isDefault', () => {
      const payload = buildCreateAddressPayload({
        recipientName: '  Karim Uddin  ',
        phone: '  01812345678  ',
        divisionId: '  CHATTOGRAM  ',
        districtId: '  CUMILLA  ',
        upazila: '  Kotwali  ',
        streetAddress: '  Station Road  ',
        postalCode: '   ',
        label: '',
        isDefault: true,
      });

      expect(payload).toEqual({
        recipientName: 'Karim Uddin',
        phone: '01812345678',
        divisionId: 'CHATTOGRAM',
        districtId: 'CUMILLA',
        upazila: 'Kotwali',
        streetAddress: 'Station Road',
        postalCode: null,
        label: null,
        isDefault: true,
      });
    });
  });

  describe('buildUpdateAddressPayload - Default Invariant Safeguards', () => {
    it('editing current default address strictly OMITS isDefault to prevent CANNOT_UNSET_DEFAULT', () => {
      const initialDefaultAddress = { isDefault: true };

      // User submits form with isDefault: false (e.g. default form state or tampered checkbox)
      const payload = buildUpdateAddressPayload(
        {
          ...validBaseData,
          isDefault: false,
        },
        initialDefaultAddress,
      );

      // Must NOT contain isDefault property at all
      expect(payload).not.toHaveProperty('isDefault');
      expect(payload.isDefault).toBeUndefined();
    });

    it('editing non-default address sends isDefault: true when user checks the box', () => {
      const initialNonDefaultAddress = { isDefault: false };

      const payload = buildUpdateAddressPayload(
        {
          ...validBaseData,
          isDefault: true,
        },
        initialNonDefaultAddress,
      );

      expect(payload.isDefault).toBe(true);
    });

    it('editing non-default address omits isDefault when left unchecked', () => {
      const initialNonDefaultAddress = { isDefault: false };

      const payload = buildUpdateAddressPayload(
        {
          ...validBaseData,
          isDefault: false,
        },
        initialNonDefaultAddress,
      );

      expect(payload).not.toHaveProperty('isDefault');
      expect(payload.isDefault).toBeUndefined();
    });

    it('converts empty label and postalCode to null and trims strings', () => {
      const payload = buildUpdateAddressPayload(
        {
          ...validBaseData,
          postalCode: '   ',
          label: '   ',
          streetAddress: '  New Address Line  ',
        },
        { isDefault: false },
      );

      expect(payload.postalCode).toBeNull();
      expect(payload.label).toBeNull();
      expect(payload.streetAddress).toBe('New Address Line');
    });
  });
});
