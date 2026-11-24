import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmailService } from '../email.service.js';
import { ConsoleTransport } from '../transports/console.transport.js';
import { BrevoTransport, parseSenderAddress } from '../transports/brevo.transport.js';
import { ResendTransport } from '../transports/resend.transport.js';
import { renderVerificationEmail } from '../templates/verification-email.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';

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

    it('forwards Idempotency-Key header to Resend API and clamps keys exceeding 256 characters', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'email_123' }),
      });
      globalThis.fetch = mockFetch;

      const transport = new ResendTransport({
        apiKey: 're_test_key_12345',
        from: 'DigitalDepot <noreply@digitaldepot.com>',
      });

      // 1. Valid key within 256 chars
      await transport.send({
        to: 'user@example.com',
        subject: 'Order Confirmed',
        html: '<p>Confirmed</p>',
        text: 'Confirmed',
        idempotencyKey: 'email:order-confirmed:cuid-123',
      });

      let [, init] = mockFetch.mock.calls[0];
      expect(init.headers['Idempotency-Key']).toBe('email:order-confirmed:cuid-123');

      // 2. Key exceeding 256 chars gets clamped to 256
      const longKey = 'k'.repeat(300);
      await transport.send({
        to: 'user@example.com',
        subject: 'Order Confirmed',
        html: '<p>Confirmed</p>',
        text: 'Confirmed',
        headers: { 'Idempotency-Key': longKey },
      });

      [, init] = mockFetch.mock.calls[1];
      expect(init.headers['Idempotency-Key']).toBe('k'.repeat(256));
      expect(init.headers['Idempotency-Key'].length).toBe(256);
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

  describe('BrevoTransport', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('parses named and plain sender addresses cleanly', () => {
      expect(parseSenderAddress('DigitalDepot <noreply@digitaldepot.com>')).toEqual({
        name: 'DigitalDepot',
        email: 'noreply@digitaldepot.com',
      });
      expect(parseSenderAddress('"DigitalDepot Support" <support@digitaldepot.com>')).toEqual({
        name: 'DigitalDepot Support',
        email: 'support@digitaldepot.com',
      });
      expect(parseSenderAddress('noreply@digitaldepot.com')).toEqual({
        email: 'noreply@digitaldepot.com',
      });
      expect(parseSenderAddress('<noreply@digitaldepot.com>')).toEqual({
        email: 'noreply@digitaldepot.com',
      });
    });

    it('requires a valid API key and sender email at instantiation', () => {
      expect(() => {
        new BrevoTransport({
          apiKey: '   ',
          from: 'DigitalDepot <noreply@digitaldepot.com>',
        });
      }).toThrow('BrevoTransport requires a valid API key');

      expect(() => {
        new BrevoTransport({
          apiKey: 'xkeysib-test-key',
          from: '   ',
        });
      }).toThrow('BrevoTransport requires a valid sender email address');
    });

    it('successfully sends email via Brevo HTTP v3 API with correct headers and payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<msg-123@smtp-relay.brevo.com>' }),
      });
      globalThis.fetch = mockFetch;

      const infoSpy = vi.spyOn(logger, 'info');

      const transport = new BrevoTransport({
        apiKey: 'xkeysib-test-secret-key-999',
        from: 'DigitalDepot <noreply@digitaldepot.com>',
        timeoutMs: 5000,
      });

      await transport.send({
        to: 'customer@example.com',
        subject: 'Verify your DigitalDepot account',
        html: '<p>Hello! Click link with secret-token-abc</p>',
        text: 'Hello! Click link with secret-token-abc',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      expect(init.method).toBe('POST');
      expect(init.headers['accept']).toBe('application/json');
      expect(init.headers['content-type']).toBe('application/json');
      expect(init.headers['api-key']).toBe('xkeysib-test-secret-key-999');
      expect(init.headers['Authorization']).toBeUndefined();

      const parsedBody = JSON.parse(init.body);
      expect(parsedBody).toEqual({
        sender: {
          name: 'DigitalDepot',
          email: 'noreply@digitaldepot.com',
        },
        to: [{ email: 'customer@example.com' }],
        subject: 'Verify your DigitalDepot account',
        htmlContent: '<p>Hello! Click link with secret-token-abc</p>',
        textContent: 'Hello! Click link with secret-token-abc',
      });
      expect(init.signal).toBeDefined();

      // Verify logs redact recipient and never log API key or sensitive content
      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'cu***@example.com',
          subject: 'Verify your DigitalDepot account',
          messageId: '<msg-123@smtp-relay.brevo.com>',
        }),
        '[BrevoTransport] Email delivered successfully',
      );
      const serializedLogs = JSON.stringify(infoSpy.mock.calls);
      expect(serializedLogs).not.toContain('xkeysib-test-secret-key-999');
      expect(serializedLogs).not.toContain('secret-token-abc');
      expect(serializedLogs).not.toContain('customer@example.com');
    });

    it('omits Resend-specific Idempotency-Key header and only passes valid UUID idempotencyKey in body headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<msg-456@smtp-relay.brevo.com>' }),
      });
      globalThis.fetch = mockFetch;

      const transport = new BrevoTransport({
        apiKey: 'xkeysib-test-key',
        from: 'noreply@digitaldepot.com',
      });

      // Non-UUID idempotencyKey from outbox worker is not forwarded as invalid Brevo header
      await transport.send({
        to: 'user@example.com',
        subject: 'Order Confirmed',
        html: '<p>Confirmed</p>',
        text: 'Confirmed',
        idempotencyKey: 'email:order-confirmed:ord_123',
        headers: {
          'Idempotency-Key': 'email:order-confirmed:ord_123',
          'X-Mailin-Custom': 'order_123',
        },
      });

      const body1 = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body1.sender).toEqual({ email: 'noreply@digitaldepot.com' });
      expect(body1.headers).toEqual({ 'X-Mailin-Custom': 'order_123' });

      // Valid UUID v4 idempotencyKey is mapped into Brevo headers.idempotencyKey
      await transport.send({
        to: 'user@example.com',
        subject: 'Batch Notice',
        html: '<p>Notice</p>',
        text: 'Notice',
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      });

      const body2 = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body2.headers).toEqual({
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      });
    });

    it('handles authentication failures (401 Unauthorized) without leaking API keys', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ code: 'unauthorized', message: 'Key not found' }),
      });
      globalThis.fetch = mockFetch;

      const errorSpy = vi.spyOn(logger, 'error');

      const transport = new BrevoTransport({
        apiKey: 'xkeysib-invalid-secret-key',
        from: 'DigitalDepot <noreply@digitaldepot.com>',
      });

      await expect(
        transport.send({
          to: 'user@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          text: 'Test',
        }),
      ).rejects.toThrow('Brevo email delivery failed (401): Key not found (unauthorized)');

      const serializedErrors = JSON.stringify(errorSpy.mock.calls);
      expect(serializedErrors).not.toContain('xkeysib-invalid-secret-key');
    });

    it('handles rejected requests (400 / 403) and non-JSON API errors (500)', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: async () => ({
            code: 'invalid_parameter',
            message: 'The sender email is invalid',
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          json: async () => ({
            code: 'not_allowed',
            message: 'Sender domain not verified',
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          json: async () => {
            throw new SyntaxError('Unexpected token < in JSON');
          },
        });
      globalThis.fetch = mockFetch;

      const transport = new BrevoTransport({
        apiKey: 'xkeysib-test-key',
        from: 'DigitalDepot <noreply@digitaldepot.com>',
      });

      await expect(
        transport.send({
          to: 'bad@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          text: 'Test',
        }),
      ).rejects.toThrow(
        'Brevo email delivery failed (400): The sender email is invalid (invalid_parameter)',
      );

      await expect(
        transport.send({
          to: 'user@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          text: 'Test',
        }),
      ).rejects.toThrow(
        'Brevo email delivery failed (403): Sender domain not verified (not_allowed)',
      );

      await expect(
        transport.send({
          to: 'user@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          text: 'Test',
        }),
      ).rejects.toThrow('Brevo email delivery failed (502): HTTP 502 Bad Gateway');
    });

    it('handles network failures and timeouts cleanly and redacts sensitive substrings', async () => {
      const timeoutError = new Error('The operation was aborted');
      timeoutError.name = 'TimeoutError';

      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(timeoutError)
        .mockRejectedValueOnce(new Error('connect ECONNREFUSED xkeysib-leak-attempt-123'));
      globalThis.fetch = mockFetch;

      const transport = new BrevoTransport({
        apiKey: 'xkeysib-test-key',
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
      ).rejects.toThrow('Brevo email delivery timed out after 5000ms');

      await expect(
        transport.send({
          to: 'user@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          text: 'Test',
        }),
      ).rejects.toThrow('Brevo email delivery network error: connect ECONNREFUSED [REDACTED]');
    });
  });

  describe('EmailService', () => {
    it('selects BrevoTransport when EMAIL_PROVIDER is brevo and never falls back silently', () => {
      const mutableEnv = env as {
        EMAIL_PROVIDER: 'console' | 'resend' | 'brevo';
        BREVO_API_KEY?: string;
        RESEND_API_KEY?: string;
      };
      const origProvider = mutableEnv.EMAIL_PROVIDER;
      const origBrevo = mutableEnv.BREVO_API_KEY;
      const origResend = mutableEnv.RESEND_API_KEY;

      try {
        mutableEnv.EMAIL_PROVIDER = 'brevo';
        mutableEnv.BREVO_API_KEY = 'xkeysib-selected-key';
        const brevoService = new EmailService();
        expect(brevoService.getTransport()).toBeInstanceOf(BrevoTransport);

        mutableEnv.BREVO_API_KEY = undefined;
        expect(() => new EmailService()).toThrow(
          'BREVO_API_KEY is required when EMAIL_PROVIDER is "brevo"',
        );

        mutableEnv.EMAIL_PROVIDER = 'resend';
        mutableEnv.RESEND_API_KEY = 're_selected_key';
        const resendService = new EmailService();
        expect(resendService.getTransport()).toBeInstanceOf(ResendTransport);

        mutableEnv.EMAIL_PROVIDER = 'console';
        const consoleService = new EmailService();
        expect(consoleService.getTransport()).toBeInstanceOf(ConsoleTransport);
      } finally {
        mutableEnv.EMAIL_PROVIDER = origProvider;
        mutableEnv.BREVO_API_KEY = origBrevo;
        mutableEnv.RESEND_API_KEY = origResend;
      }
    });

    it('dispatches verification and password reset emails using configured transport', async () => {
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

      await service.sendPasswordResetEmail({
        to: 'newuser@example.com',
        name: 'Jane Doe',
        token: 'reset_abc',
        locale: 'en',
      });

      expect(mockTransport.send).toHaveBeenCalledTimes(2);
      const resetArg = mockTransport.send.mock.calls[1][0];
      expect(resetArg.to).toBe('newuser@example.com');
      expect(resetArg.subject).toBe('Reset your DigitalDepot password');
      expect(resetArg.text).toContain('token=reset_abc');
    });
  });
});
