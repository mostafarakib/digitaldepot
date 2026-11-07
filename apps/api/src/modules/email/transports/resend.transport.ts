import { logger } from '../../../lib/logger.js';
import type { EmailTransport, SendEmailOptions } from '../email.types.js';

export interface ResendTransportConfig {
  apiKey: string;
  from: string;
  timeoutMs?: number;
}

export class ResendTransport implements EmailTransport {
  private readonly apiKey: string;
  private readonly from: string;
  private readonly timeoutMs: number;

  constructor(config: ResendTransportConfig) {
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new Error('ResendTransport requires a valid API key');
    }
    this.apiKey = config.apiKey.trim();
    this.from = config.from;
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  async send(options: SendEmailOptions): Promise<void> {
    const [localPart, domain] = options.to.split('@');
    const redactedTo = localPart && domain ? `${localPart.slice(0, 2)}***@${domain}` : '***';

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [options.to],
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status} ${response.statusText}`;
        try {
          const errorBody = (await response.json()) as { message?: string; name?: string };
          if (errorBody?.message) {
            errorMessage = errorBody.message;
          }
        } catch {
          // If response body is not JSON, retain default status text
        }

        logger.error(
          { to: redactedTo, status: response.status, error: errorMessage },
          '[ResendTransport] Email delivery failed',
        );
        throw new Error(`Resend email delivery failed: ${errorMessage}`);
      }

      logger.info(
        { to: redactedTo, subject: options.subject },
        '[ResendTransport] Email delivered successfully',
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        logger.error(
          { to: redactedTo, timeoutMs: this.timeoutMs },
          '[ResendTransport] Request timed out',
        );
        throw new Error(`Resend email delivery timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    }
  }
}
