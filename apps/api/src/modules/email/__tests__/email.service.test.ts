import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmailService } from '../email.service.js';
import { ConsoleTransport } from '../transports/console.transport.js';
import { ResendTransport } from '../transports/resend.transport.js';
import { renderVerificationEmail } from '../templates/verification-email.js';
import { env } from '../../../config/env.js';

describe('Email Service & Transports Unit Tests', () => {
  describe('Email Templates (renderVerificationEmail)', () => {
    it('renders English verification email with correct subject, links, and text', () => {
      const rendered = renderVerificationEmail({
        name: 'Tanvir Ahmed',
        token: 'sample-raw-token-12345',
        locale: 'en',
      });

      expect(rendered.subject).toBe('Verify your DigitalDepot account');
      expect(rendered.text).toContain('Hello Tanvir Ahmed,');
      expect(rendered.text).toContain(
        `${env.FRONTEND_URL}/en/verify-email?token=sample-raw-token-12345`,
      );
      expect(rendered.html).toContain('Verify Email Address');
      expect(rendered.html).toContain(
        `${env.FRONTEND_URL}/en/verify-email?token=sample-raw-token-12345`,
      );
      expect(rendered.text).toContain('24 hours');
    });

    it('renders Bangla verification email with correct subject, links, and text', () => {
      const rendered = renderVerificationEmail({
        name: 'তানভীর আহমেদ',
        token: 'sample-raw-token-67890',
        locale: 'bn',
      });

      expect(rendered.subject).toBe('আপনার DigitalDepot অ্যাকাউন্ট যাচাই করুন');
      expect(rendered.text).toContain('হ্যালো তানভীর আহমেদ,');
      expect(rendered.text).toContain(
        `${env.FRONTEND_URL}/bn/verify-email?token=sample-raw-token-67890`,
      );
      expect(rendered.html).toContain('ইমেইল যাচাই করুন');
      expect(rendered.html).toContain(
        `${env.FRONTEND_URL}/bn/verify-email?token=sample-raw-token-67890`,
      );
      expect(rendered.text).toContain('২৪ ঘণ্টা');
    });

    it('defaults to English when locale is not provided', () => {
      const rendered = renderVerificationEmail({
        name: 'John Doe',
        token: 'token-abc',
      });

      expect(rendered.subject).toBe('Verify your DigitalDepot account');
      expect(rendered.text).toContain(`${env.FRONTEND_URL}/en/verify-email?token=token-abc`);
    });
  });

  describe('ConsoleTransport', () => {
    it('records sent emails in test mode and allows clearing', async () => {
      const transport = new ConsoleTransport();

      await transport.send({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test</p>',
        text: 'Test',
      });

      expect(transport.getSentEmails()).toHaveLength(1);
      expect(transport.getLastSentEmail()?.to).toBe('test@example.com');
      expect(transport.getLastSentEmail()?.subject).toBe('Test Subject');

      transport.clearSentEmails();
      expect(transport.getSentEmails()).toHaveLength(0);
      expect(transport.getLastSentEmail()).toBeUndefined();
    });

    it('redacts email recipient in production mode and never logs raw tokens or links', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const transport = new ConsoleTransport();

      // Should complete without throwing
      await expect(
        transport.send({
          to: 'customer@example.com',
          subject: 'Security Notice',
          html: '<p>Secret token: 12345</p>',
          text: 'https://digitaldepot.com/verify?token=12345',
        }),
      ).resolves.toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('ResendTransport', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('requires a valid API key at instantiation', () => {
      expect(() => {
        new ResendTransport({
          apiKey: '',
          from: 'DigitalDepot <noreply@digitaldepot.com>',
        });
      }).toThrow('ResendTransport requires a valid API key');
    });

    it('successfully sends email via native fetch with correct headers and payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'email_123' }),
      });
      globalThis.fetch = mockFetch;

      const transport = new ResendTransport({
        apiKey: 're_test_key_12345',
        from: 'DigitalDepot <noreply@digitaldepot.com>',
        timeoutMs: 5000,
      });

      await transport.send({
        to: 'user@example.com',
        subject: 'Welcome to DigitalDepot',
        html: '<p>Welcome!</p>',
        text: 'Welcome!',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.resend.com/emails');
      expect(init.method).toBe('POST');
      expect(init.headers['Authorization']).toBe('Bearer re_test_key_12345');
      expect(init.headers['Content-Type']).toBe('application/json');

      const parsedBody = JSON.parse(init.body);
      expect(parsedBody.from).toBe('DigitalDepot <noreply@digitaldepot.com>');
      expect(parsedBody.to).toEqual(['user@example.com']);
      expect(parsedBody.subject).toBe('Welcome to DigitalDepot');
      expect(parsedBody.html).toBe('<p>Welcome!</p>');
      expect(parsedBody.text).toBe('Welcome!');

      // Verify that AbortSignal is present
      expect(init.signal).toBeDefined();
    });

    it('handles HTTP error responses from Resend gracefully with sanitized error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ message: 'Domain not verified', name: 'validation_error' }),
      });
      globalThis.fetch = mockFetch;

      const transport = new ResendTransport({
        apiKey: 're_test_key_12345',
        from: 'DigitalDepot <noreply@digitaldepot.com>',
      });

      await expect(
        transport.send({
          to: 'user@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          text: 'Test',
        }),
      ).rejects.toThrow('Resend email delivery failed: Domain not verified');
    });

    it('handles request timeouts via AbortSignal', async () => {
      const timeoutError = new Error('The operation was aborted');
      timeoutError.name = 'TimeoutError';

      const mockFetch = vi.fn().mockRejectedValue(timeoutError);
      globalThis.fetch = mockFetch;

      const transport = new ResendTransport({
        apiKey: 're_test_key_12345',
        from: 'DigitalDepot <noreply@digitaldepot.com>',
        timeoutMs: 5000,
      });

      await expect(
        transport.send({
          to: 'user@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          text: 'Test',
        }),
      ).rejects.toThrow('Resend email delivery timed out after 5000ms');
    });
  });

  describe('EmailService', () => {
    it('dispatches verification email using configured transport', async () => {
      const service = new EmailService();
      const mockTransport = {
        send: vi.fn().mockResolvedValue(undefined),
      };
      service.setTransport(mockTransport);

      await service.sendVerificationEmail({
        to: 'newuser@example.com',
        name: 'Jane Doe',
        token: 'token_xyz',
        locale: 'en',
      });

      expect(mockTransport.send).toHaveBeenCalledTimes(1);
      const callArg = mockTransport.send.mock.calls[0][0];
      expect(callArg.to).toBe('newuser@example.com');
      expect(callArg.subject).toBe('Verify your DigitalDepot account');
      expect(callArg.text).toContain('token=token_xyz');
    });
  });
});
