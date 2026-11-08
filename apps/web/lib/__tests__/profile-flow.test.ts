import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildProfileUpdatePayload } from '../auth-schemas';
import { apiClient, setInMemoryCsrfToken, ApiError } from '../api-client';

describe('Profile Form Flow & Contract Tests', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setInMemoryCsrfToken('test-csrf-token');
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setInMemoryCsrfToken(null);
  });

  describe('1. Phone Clearing & Payload Construction Contract', () => {
    it('converts empty string phone to null', () => {
      const payload = buildProfileUpdatePayload({
        firstName: 'Rahim',
        lastName: 'Chowdhury',
        phone: '',
      });

      expect(payload).toEqual({
        firstName: 'Rahim',
        lastName: 'Chowdhury',
        phone: null,
      });
    });

    it('converts whitespace-only phone to null', () => {
      const payload = buildProfileUpdatePayload({
        firstName: 'Rahim',
        lastName: 'Chowdhury',
        phone: '   ',
      });

      expect(payload).toEqual({
        firstName: 'Rahim',
        lastName: 'Chowdhury',
        phone: null,
      });
    });

    it('converts undefined phone to null', () => {
      const payload = buildProfileUpdatePayload({
        firstName: 'Rahim',
        lastName: 'Chowdhury',
        phone: undefined,
      });

      expect(payload).toEqual({
        firstName: 'Rahim',
        lastName: 'Chowdhury',
        phone: null,
      });
    });

    it('preserves and trims valid phone number string', () => {
      const payload = buildProfileUpdatePayload({
        firstName: '  Rahim  ',
        lastName: '  Chowdhury  ',
        phone: '  01712345678  ',
      });

      expect(payload).toEqual({
        firstName: 'Rahim',
        lastName: 'Chowdhury',
        phone: '01712345678',
      });
    });

    it('sends phone: null over the wire in PATCH /api/account/profile when phone is cleared', async () => {
      let capturedBody: unknown;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === '/api/account/profile') {
          capturedBody = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            headers: new Headers({
              'content-type': 'application/json',
              'x-csrf-token': 'rotated-csrf',
            }),
            json: async () => ({
              success: true,
              data: {
                profile: {
                  firstName: 'Rahim',
                  lastName: 'Chowdhury',
                  phone: null,
                },
              },
            }),
          } as unknown as Response;
        }
        throw new Error(`Unexpected url: ${url}`);
      });

      const formInput = {
        firstName: 'Rahim',
        lastName: 'Chowdhury',
        phone: '', // customer cleared the phone input
      };

      const payload = buildProfileUpdatePayload(formInput);

      const response = await apiClient<{ profile: { phone: string | null } }>(
        '/api/account/profile',
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      // Verifies backend received explicit null and responded with null phone
      expect(capturedBody).toEqual({
        firstName: 'Rahim',
        lastName: 'Chowdhury',
        phone: null,
      });
      expect(response.profile.phone).toBeNull();
    });
  });

  describe('2. Profile Update and State Refresh Separation', () => {
    it('isolates state refresh failure so backend profile update remains successful', async () => {
      // Mock successful profile update PATCH
      const mockProfilePatch = vi.fn().mockResolvedValue({
        profile: {
          firstName: 'UpdatedFirst',
          lastName: 'UpdatedLast',
          phone: '+8801712345678',
        },
      });

      // Mock refreshUser that fails (e.g. temporary network error on subsequent /api/auth/me)
      const mockRefreshUser = vi.fn().mockRejectedValue(new Error('Network glitch during refresh'));

      let updateSucceeded = false;
      let reportedError: string | null = null;

      // Simulate the exact ProfileForm submit workflow
      const handleProfileSubmit = async (data: {
        firstName: string;
        lastName: string;
        phone: string;
      }) => {
        const payload = buildProfileUpdatePayload(data);
        try {
          await mockProfilePatch(payload);
        } catch (err) {
          reportedError = err instanceof Error ? err.message : 'Update failed';
          return;
        }

        // Profile update succeeded
        updateSucceeded = true;

        // Separate best-effort refresh
        try {
          await mockRefreshUser();
        } catch {
          // Swallow client-state refresh failure so confirmed update is not marked failed
        }
      };

      await handleProfileSubmit({
        firstName: 'UpdatedFirst',
        lastName: 'UpdatedLast',
        phone: '01712345678',
      });

      expect(mockProfilePatch).toHaveBeenCalledTimes(1);
      expect(mockRefreshUser).toHaveBeenCalledTimes(1);
      expect(updateSucceeded).toBe(true);
      expect(reportedError).toBeNull();
    });

    it('reports failure when the backend PATCH profile update fails', async () => {
      const mockProfilePatch = vi
        .fn()
        .mockRejectedValue(new ApiError('Invalid phone number format', 'VALIDATION_ERROR', 400));
      const mockRefreshUser = vi.fn();

      let updateSucceeded = false;
      let reportedError: string | null = null;

      const handleProfileSubmit = async (data: {
        firstName: string;
        lastName: string;
        phone: string;
      }) => {
        const payload = buildProfileUpdatePayload(data);
        try {
          await mockProfilePatch(payload);
        } catch (err) {
          reportedError = err instanceof ApiError ? err.message : 'Update failed';
          return;
        }

        updateSucceeded = true;
        try {
          await mockRefreshUser();
        } catch {
          // Swallow refresh errors
        }
      };

      await handleProfileSubmit({
        firstName: 'UpdatedFirst',
        lastName: 'UpdatedLast',
        phone: 'invalid-phone',
      });

      expect(mockProfilePatch).toHaveBeenCalledTimes(1);
      expect(mockRefreshUser).not.toHaveBeenCalled();
      expect(updateSucceeded).toBe(false);
      expect(reportedError).toBe('Invalid phone number format');
    });
  });
});
