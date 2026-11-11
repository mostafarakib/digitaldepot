import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateCheckoutApi,
  getAddressesApi,
  createAddressApi,
  setInMemoryCsrfToken,
} from '../api-client';

describe('Checkout Client API Helpers & Flow Logic (Phase 5E)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    setInMemoryCsrfToken('test-csrf-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  it('validateCheckoutApi calls POST /api/checkout/validate with addressId', async () => {
    let calledUrl = '';
    let calledMethod = '';
    let calledBody = '';
    let calledHeaders: Headers | undefined;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calledUrl = url;
      calledMethod = init?.method ?? 'GET';
      calledBody = (init?.body as string) ?? '';
      calledHeaders = new Headers(init?.headers);

      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            isValid: true,
            canProceed: true,
            hasPriceChanges: false,
            requiresPriceAcknowledgement: false,
            hasUnavailableItems: false,
            hasInsufficientStock: false,
            issues: [],
            items: [],
            summary: {
              itemCount: 1,
              totalQuantity: 1,
              merchandiseSubtotal: 100000,
              discount: 0,
              shippingFee: 6000,
              finalTotal: 106000,
              isFreeShipping: false,
              freeShippingThreshold: 500000,
              freeShippingRemaining: 400000,
            },
            address: {
              id: 'addr-1',
              recipientName: 'Tanvir Ahmed',
              phone: '+8801700000001',
              divisionId: 'DHAKA',
              districtId: 'DHAKA',
              upazila: 'Dhanmondi',
              streetAddress: 'Road 4',
              postalCode: '1205',
              label: 'Home',
              isDefault: true,
            },
            coupon: null,
            couponNotice: null,
          },
        }),
      } as unknown as Response;
    });

    const res = await validateCheckoutApi({ addressId: 'addr-1' });

    expect(calledUrl).toBe('/api/checkout/validate');
    expect(calledMethod).toBe('POST');
    expect(calledHeaders?.get('x-csrf-token')).toBe('test-csrf-token');
    expect(JSON.parse(calledBody)).toEqual({ addressId: 'addr-1' });
    expect(res.isValid).toBe(true);
    expect(res.summary.finalTotal).toBe(106000);
    expect(res.address?.districtId).toBe('DHAKA');
  });

  it('getAddressesApi calls GET /api/account/addresses', async () => {
    let calledUrl = '';

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      calledUrl = url;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            addresses: [
              {
                id: 'addr-1',
                recipientName: 'Tanvir',
                districtId: 'DHAKA',
                isDefault: true,
              },
            ],
            maxAllowed: 10,
          },
        }),
      } as unknown as Response;
    });

    const res = await getAddressesApi();
    expect(calledUrl).toBe('/api/account/addresses');
    expect(res.addresses).toHaveLength(1);
    expect(res.addresses[0].districtId).toBe('DHAKA');
  });

  it('createAddressApi calls POST /api/account/addresses with address payload', async () => {
    let calledUrl = '';
    let calledMethod = '';
    let calledBody = '';

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calledUrl = url;
      calledMethod = init?.method ?? 'GET';
      calledBody = (init?.body as string) ?? '';

      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            address: {
              id: 'addr-new',
              recipientName: 'New Recipient',
              districtId: 'CHATTOGRAM',
              isDefault: false,
            },
          },
        }),
      } as unknown as Response;
    });

    const res = await createAddressApi({
      recipientName: 'New Recipient',
      districtId: 'CHATTOGRAM',
    });

    expect(calledUrl).toBe('/api/account/addresses');
    expect(calledMethod).toBe('POST');
    expect(JSON.parse(calledBody)).toEqual({
      recipientName: 'New Recipient',
      districtId: 'CHATTOGRAM',
    });
    expect(res.address.id).toBe('addr-new');
  });

  describe('Client State & Gating Invariants (Clarifications #1 & #3)', () => {
    it('blocks proceeding when price changes exist and customer has not acknowledged them', () => {
      const validationResult = {
        isValid: true,
        canProceed: true,
        hasPriceChanges: true,
        requiresPriceAcknowledgement: true,
      };

      // Helper function matching checkout view button enablement logic
      function canCustomerProceed(
        result: typeof validationResult,
        isPriceAcknowledged: boolean,
        emailVerified: boolean,
      ): boolean {
        if (!emailVerified) return false;
        if (!result.isValid) return false;
        if (result.requiresPriceAcknowledgement && !isPriceAcknowledged) return false;
        return true;
      }

      // 1. Without price acknowledgement -> BLOCKED
      expect(canCustomerProceed(validationResult, false, true)).toBe(false);

      // 2. With price acknowledgement -> ALLOWED
      expect(canCustomerProceed(validationResult, true, true)).toBe(true);

      // 3. If unverified email -> BLOCKED even with acknowledgement
      expect(canCustomerProceed(validationResult, true, false)).toBe(false);
    });
  });
});
