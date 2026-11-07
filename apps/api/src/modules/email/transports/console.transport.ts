import { logger } from '../../../lib/logger.js';
import type { EmailTransport, SendEmailOptions } from '../email.types.js';

export class ConsoleTransport implements EmailTransport {
  private sentEmails: SendEmailOptions[] = [];

  async send(options: SendEmailOptions): Promise<void> {
    const isProd = process.env.NODE_ENV === 'production';
    const isTest = process.env.NODE_ENV === 'test';

    if (isTest) {
      this.sentEmails.push({ ...options });
      return;
    }

    if (isProd) {
      // In production, redact recipient and do NOT log html or sensitive content
      const [localPart, domain] = options.to.split('@');
      const redactedTo = localPart && domain ? `${localPart.slice(0, 2)}***@${domain}` : '***';
      logger.info(
        { to: redactedTo, subject: options.subject },
        '[ConsoleTransport] Email dispatched',
      );
      return;
    }

    // Development environment: log helpful info for local testing
    logger.info(
      {
        to: options.to,
        subject: options.subject,
      },
      `[ConsoleTransport] Email dispatched to ${options.to}`,
    );

    // Extract any verification/reset URL from text if present for local convenience
    const linkMatch = options.text.match(/https?:\/\/[^\s]+/);
    if (linkMatch) {
      logger.info(`[ConsoleTransport] Action URL: ${linkMatch[0]}`);
    }
  }

  getSentEmails(): SendEmailOptions[] {
    return [...this.sentEmails];
  }

  getLastSentEmail(): SendEmailOptions | undefined {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  clearSentEmails(): void {
    this.sentEmails = [];
  }
}
