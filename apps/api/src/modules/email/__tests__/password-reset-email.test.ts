import { describe, it, expect, vi } from 'vitest';
import { renderPasswordResetEmail } from '../templates/password-reset-email.js';
import { EmailService } from '../email.service.js';
import { env } from '../../../config/env.js';

describe('Password Reset Email Templates & Service Tests', () => {
  describe('renderPasswordResetEmail', () => {
    it('renders English password reset email with correct subject, links, and text', () => {
      const rendered = renderPasswordResetEmail({
        name: 'John Doe',
        token: 'reset-raw-token-12345',
        locale: 'en',
      });

      expect(rendered.subject).toBe('Reset your DigitalDepot password');
      expect(rendered.text).toContain('Hello John Doe,');
      expect(rendered.text).toContain(
        `${env.FRONTEND_URL}/en/reset-password?token=reset-raw-token-12345`,
      );
      expect(rendered.html).toContain('Reset Password');
      expect(rendered.html).toContain(
        `${env.FRONTEND_URL}/en/reset-password?token=reset-raw-token-12345`,
      );
      expect(rendered.text).toContain('1 hour');
    });

    it('renders Bangla password reset email with correct subject, links, and text', () => {
      const rendered = renderPasswordResetEmail({
        name: 'হাসান মাহমুদ',
        token: 'reset-raw-token-67890',
        locale: 'bn',
      });

      expect(rendered.subject).toBe('আপনার DigitalDepot পাসওয়ার্ড রিসেট করুন');
      expect(rendered.text).toContain('হ্যালো হাসান মাহমুদ,');
      expect(rendered.text).toContain(
        `${env.FRONTEND_URL}/bn/reset-password?token=reset-raw-token-67890`,
      );
      expect(rendered.html).toContain('পাসওয়ার্ড রিসেট করুন');
      expect(rendered.html).toContain(
        `${env.FRONTEND_URL}/bn/reset-password?token=reset-raw-token-67890`,
      );
      expect(rendered.text).toContain('১ ঘণ্টা');
    });

    it('defaults to English when locale is omitted', () => {
      const rendered = renderPasswordResetEmail({
        name: 'Jane Doe',
        token: 'token-abc',
      });

      expect(rendered.subject).toBe('Reset your DigitalDepot password');
      expect(rendered.text).toContain(`${env.FRONTEND_URL}/en/reset-password?token=token-abc`);
    });
  });

  describe('EmailService.sendPasswordResetEmail', () => {
    it('dispatches password reset email through the configured transport', async () => {
      const service = new EmailService();
      const mockTransport = {
        send: vi.fn().mockResolvedValue(undefined),
      };
      service.setTransport(mockTransport);

      await service.sendPasswordResetEmail({
        to: 'customer@example.com',
        name: 'Customer',
        token: 'secret-token',
        locale: 'bn',
      });

      expect(mockTransport.send).toHaveBeenCalledTimes(1);
      const callArg = mockTransport.send.mock.calls[0][0];
      expect(callArg.to).toBe('customer@example.com');
      expect(callArg.subject).toBe('আপনার DigitalDepot পাসওয়ার্ড রিসেট করুন');
      expect(callArg.text).toContain('/bn/reset-password?token=secret-token');
    });
  });
});
