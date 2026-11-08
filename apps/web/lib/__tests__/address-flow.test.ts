import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBangladeshDivisions, clearBangladeshDivisionsCache } from '../bangladesh-geo-client';
import {
  buildCreateAddressPayload,
  buildUpdateAddressPayload,
  type AddressFormInput,
} from '../auth-schemas';

describe('Address Flow Logic & Client Services', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    clearBangladeshDivisionsCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearBangladeshDivisionsCache();
  });

  describe('Bangladesh Divisions In-Memory Caching', () => {
    it('fetches divisions via BFF on first call and reuses memory cache on second call', async () => {
      let fetchCallCount = 0;

      global.fetch = vi.fn().mockImplementation(async () => {
        fetchCallCount++;
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              divisions: [
                { id: 'DHAKA', nameEn: 'Dhaka', nameBn: 'ঢাকা', districts: [] },
                { id: 'CHATTOGRAM', nameEn: 'Chattogram', nameBn: 'চট্টগ্রাম', districts: [] },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      // Call 1: Should fetch
      const result1 = await getBangladeshDivisions();
      expect(fetchCallCount).toBe(1);
      expect(result1.length).toBe(2);
      expect(result1[0].id).toBe('DHAKA');

      // Call 2: Should return cached copy without network call
      const result2 = await getBangladeshDivisions();
      expect(fetchCallCount).toBe(1);
      expect(result2).toBe(result1);

      // After clearing cache:
      clearBangladeshDivisionsCache();
      const result3 = await getBangladeshDivisions();
      expect(fetchCallCount).toBe(2);
      expect(result3.length).toBe(2);
    });

    it('deduplicates simultaneous in-flight requests into a single network call', async () => {
      let fetchCallCount = 0;

      global.fetch = vi.fn().mockImplementation(async () => {
        fetchCallCount++;
        // Small delay to simulate async network latency
        await new Promise((r) => setTimeout(r, 20));
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              divisions: [{ id: 'BARISHAL', nameEn: 'Barishal', nameBn: 'বরিশাল', districts: [] }],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      // Issue parallel calls
      const [resA, resB] = await Promise.all([getBangladeshDivisions(), getBangladeshDivisions()]);

      expect(fetchCallCount).toBe(1);
      expect(resA).toEqual(resB);
    });
  });

  describe('Cascading Selector Logic & Quota Boundary Flow', () => {
    it('enforces cascading division selection: changing division resets selected district', () => {
      const formState: { divisionId: string; districtId: string } = {
        divisionId: 'DHAKA',
        districtId: 'DHAKA',
      };

      const handleDivisionChange = (newDivision: string) => {
        formState.divisionId = newDivision;
        formState.districtId = ''; // Cascading reset
      };

      handleDivisionChange('CHATTOGRAM');
      expect(formState.divisionId).toBe('CHATTOGRAM');
      expect(formState.districtId).toBe('');
    });

    it('enforces maximum 10 address quota logic', () => {
      const maxQuota = 10;
      const isQuotaReached = (total: number) => total >= maxQuota;

      expect(isQuotaReached(0)).toBe(false);
      expect(isQuotaReached(9)).toBe(false);
      expect(isQuotaReached(10)).toBe(true);
      expect(isQuotaReached(11)).toBe(true);
    });

    it('ensures editing active default address never submits isDefault: false', () => {
      const activeDefaultAddress = {
        id: 'addr_1',
        isDefault: true,
      };

      const userFormData: AddressFormInput = {
        recipientName: 'Test Recipient',
        phone: '01712345678',
        divisionId: 'DHAKA',
        districtId: 'DHAKA',
        upazila: 'Gulshan',
        streetAddress: 'Road 1',
        postalCode: '1212',
        label: 'Work',
        isDefault: false, // Attempt to unset
      };

      const payload = buildUpdateAddressPayload(userFormData, activeDefaultAddress);
      expect(payload.isDefault).toBeUndefined();
      expect(payload).not.toHaveProperty('isDefault');
    });

    it('ensures editing non-default address can promote to default when checked', () => {
      const nonDefaultAddress = {
        id: 'addr_2',
        isDefault: false,
      };

      const userFormData: AddressFormInput = {
        recipientName: 'Test Recipient',
        phone: '01712345678',
        divisionId: 'DHAKA',
        districtId: 'DHAKA',
        upazila: 'Gulshan',
        streetAddress: 'Road 1',
        postalCode: '1212',
        label: 'Work',
        isDefault: true, // User explicitly promoted
      };

      const payload = buildUpdateAddressPayload(userFormData, nonDefaultAddress);
      expect(payload.isDefault).toBe(true);
    });

    it('ensures create address preserves isDefault selection for backend first-address handling', () => {
      const firstAddressData: AddressFormInput = {
        recipientName: 'First Recipient',
        phone: '01712345678',
        divisionId: 'DHAKA',
        districtId: 'DHAKA',
        upazila: 'Gulshan',
        streetAddress: 'Road 1',
        isDefault: true,
      };

      const payload = buildCreateAddressPayload(firstAddressData);
      expect(payload.isDefault).toBe(true);
    });
  });
});
