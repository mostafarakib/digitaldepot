import { describe, it, expect } from 'vitest';
import {
  sslcommerzSuccessCallbackSchema,
  sslcommerzFailCallbackSchema,
  sslcommerzCancelCallbackSchema,
  sslcommerzIpnCallbackSchema,
} from '../payment.schemas.js';

describe('SSLCommerz Callback Payload Validation (Clarification 1)', () => {
  describe('Success Callback Schema', () => {
    it('accepts valid success callback with val_id, tran_id, and preserves ancillary fields', () => {
      const payload = {
        val_id: 'val_success_123',
        tran_id: 'TXN-20261116-ABCD1234',
        amount: '1500.00',
        currency: 'BDT',
        card_type: 'VISA',
        bank_tran_id: 'BANK-999',
        extra_gateway_field: 'retained',
      };

      const parsed = sslcommerzSuccessCallbackSchema.parse(payload);
      expect(parsed.val_id).toBe('val_success_123');
      expect(parsed.tran_id).toBe('TXN-20261116-ABCD1234');
      expect(parsed.extra_gateway_field).toBe('retained');
    });

    it('rejects success callback when val_id is missing or empty', () => {
      expect(() =>
        sslcommerzSuccessCallbackSchema.parse({
          tran_id: 'TXN-123',
        }),
      ).toThrow();

      expect(() =>
        sslcommerzSuccessCallbackSchema.parse({
          val_id: '   ',
          tran_id: 'TXN-123',
        }),
      ).toThrow();
    });

    it('rejects success callback when tran_id is missing or empty', () => {
      expect(() =>
        sslcommerzSuccessCallbackSchema.parse({
          val_id: 'val_123',
        }),
      ).toThrow();
    });
  });

  describe('Fail Callback Schema', () => {
    it('accepts valid fail callback with tran_id, without requiring val_id', () => {
      const payload = {
        tran_id: 'TXN-FAIL-001',
        error: 'Insufficient funds in card',
        status: 'FAILED',
        currency: 'BDT',
      };

      const parsed = sslcommerzFailCallbackSchema.parse(payload);
      expect(parsed.tran_id).toBe('TXN-FAIL-001');
      expect(parsed.val_id).toBeUndefined();
      expect(parsed.error).toBe('Insufficient funds in card');
    });

    it('preserves val_id if gateway happens to include it on failure', () => {
      const payload = {
        tran_id: 'TXN-FAIL-002',
        val_id: 'val_fail_optional',
        status: 'FAILED',
      };

      const parsed = sslcommerzFailCallbackSchema.parse(payload);
      expect(parsed.tran_id).toBe('TXN-FAIL-002');
      expect(parsed.val_id).toBe('val_fail_optional');
    });

    it('rejects fail callback when tran_id is missing', () => {
      expect(() =>
        sslcommerzFailCallbackSchema.parse({
          error: 'Something failed',
        }),
      ).toThrow();
    });
  });

  describe('Cancel Callback Schema', () => {
    it('accepts valid cancel callback with tran_id, without requiring val_id', () => {
      const payload = {
        tran_id: 'TXN-CANCEL-001',
        status: 'CANCELLED',
      };

      const parsed = sslcommerzCancelCallbackSchema.parse(payload);
      expect(parsed.tran_id).toBe('TXN-CANCEL-001');
      expect(parsed.val_id).toBeUndefined();
    });

    it('rejects cancel callback when tran_id is missing', () => {
      expect(() =>
        sslcommerzCancelCallbackSchema.parse({
          status: 'CANCELLED',
        }),
      ).toThrow();
    });
  });

  describe('IPN Callback Schema', () => {
    it('accepts valid IPN with VALID status when val_id is provided', () => {
      const payload = {
        tran_id: 'TXN-IPN-001',
        status: 'VALID',
        val_id: 'val_ipn_verified',
        amount: '2500.00',
        currency: 'BDT',
      };

      const parsed = sslcommerzIpnCallbackSchema.parse(payload);
      expect(parsed.status).toBe('VALID');
      expect(parsed.val_id).toBe('val_ipn_verified');
    });

    it('accepts valid IPN with VALIDATED status when val_id is provided', () => {
      const payload = {
        tran_id: 'TXN-IPN-002',
        status: 'VALIDATED',
        val_id: 'val_ipn_validated_123',
      };

      const parsed = sslcommerzIpnCallbackSchema.parse(payload);
      expect(parsed.status).toBe('VALIDATED');
      expect(parsed.val_id).toBe('val_ipn_validated_123');
    });

    it('rejects IPN with VALID status when val_id is omitted or empty', () => {
      expect(() =>
        sslcommerzIpnCallbackSchema.parse({
          tran_id: 'TXN-IPN-003',
          status: 'VALID',
        }),
      ).toThrow('val_id is required when IPN status is VALID or VALIDATED');

      expect(() =>
        sslcommerzIpnCallbackSchema.parse({
          tran_id: 'TXN-IPN-003',
          status: 'VALID',
          val_id: '   ',
        }),
      ).toThrow();
    });

    it('accepts IPN with FAILED status without requiring val_id', () => {
      const payload = {
        tran_id: 'TXN-IPN-FAILED',
        status: 'FAILED',
        currency: 'BDT',
      };

      const parsed = sslcommerzIpnCallbackSchema.parse(payload);
      expect(parsed.status).toBe('FAILED');
      expect(parsed.val_id).toBeUndefined();
    });

    it('accepts IPN with CANCELLED status without requiring val_id', () => {
      const payload = {
        tran_id: 'TXN-IPN-CANCELLED',
        status: 'CANCELLED',
      };

      const parsed = sslcommerzIpnCallbackSchema.parse(payload);
      expect(parsed.status).toBe('CANCELLED');
    });
  });
});
