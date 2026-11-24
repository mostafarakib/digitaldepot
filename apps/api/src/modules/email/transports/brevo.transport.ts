import { logger } from '../../../lib/logger.js';
import type { EmailTransport, SendEmailOptions } from '../email.types.js';

const BREVO_SEND_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface BrevoTransportConfig {
  apiKey: string;
  from: string;
  timeoutMs?: number;
}

export interface BrevoSender {
  email: string;
  name?: string;
}

export function parseSenderAddress(from: string): BrevoSender {
  const trimmed = from.trim();
  const match = trimmed.match(/^([^<>]*)<\s*([^<>\s]+@[^<>\s]+)\s*>$/);

  if (match) {
    const rawName = match[1]
      .trim()
      .replace(/^["']|["']$/g, '')
      .trim();
    const email = match[2].trim();
    return rawName ? { name: rawName, email } : { email };
  }

  return { email: trimmed };
}

function redactEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  return localPart && domain ? `${localPart.slice(0, 2)}***@${domain}` : '***';
}

function sanitizeErrorText(text: string): string {
  return text
    .replace(/xkeysib-[a-z0-9._-]+/gi, '[REDACTED]')
    .replace(/(api[_-]?key|authorization|bearer)[:=\s]+[^\s,;]+/gi, '$1 [REDACTED]');
}

export class BrevoTransport implements EmailTransport {
  private readonly apiKey: string;
  private readonly sender: BrevoSender;
  private readonly timeoutMs: number;

  constructor(config: BrevoTransportConfig) {
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new Error('BrevoTransport requires a valid API key');
    }

    const parsedSender = parseSenderAddress(config.from || '');
    if (!parsedSender.email) {
      throw new Error('BrevoTransport requires a valid sender email address');
    }

    this.apiKey = config.apiKey.trim();
    this.sender = parsedSender;
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  async send(options: SendEmailOptions): Promise<void> {
    const redactedTo = redactEmail(options.to);

    try {
      const customHeaders: Record<string, string> = {};
      if (options.headers) {
        for (const [key, value] of Object.entries(options.headers)) {
          // Skip Resend-specific Idempotency-Key HTTP header; Brevo handles custom headers in body
          if (key.toLowerCase() !== 'idempotency-key') {
            customHeaders[key] = value;
          }
        }
      }

      // Brevo accepts `idempotencyKey` inside `headers` only when formatted as a valid UUID
      if (options.idempotencyKey && UUID_REGEX.test(options.idempotencyKey)) {
        customHeaders['idempotencyKey'] = options.idempotencyKey;
      }

      const requestBody: {
        sender: BrevoSender;
        to: Array<{ email: string }>;
        subject: string;
        htmlContent: string;
        textContent?: string;
        headers?: Record<string, string>;
      } = {
        sender: this.sender,
        to: [{ email: options.to }],
        subject: options.subject,
        htmlContent: options.html,
      };

      if (options.text) {
        requestBody.textContent = options.text;
      }

      if (Object.keys(customHeaders).length > 0) {
        requestBody.headers = customHeaders;
      }

      const response = await fetch(BREVO_SEND_EMAIL_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status} ${response.statusText}`.trim();
        let errorCode: string | undefined;

        if (typeof response.json === 'function') {
          try {
            const errorBody = (await response.json()) as { message?: string; code?: string };
            if (errorBody?.code) {
              errorCode = errorBody.code;
            }
            if (errorBody?.message) {
              errorMessage = errorCode ? `${errorBody.message} (${errorCode})` : errorBody.message;
            } else if (errorCode) {
              errorMessage = `${errorMessage} (${errorCode})`;
            }
          } catch {
            // If response body is not JSON, retain HTTP status fallback
          }
        }

        const safeError = sanitizeErrorText(errorMessage);
        logger.error(
          { to: redactedTo, status: response.status, code: errorCode, error: safeError },
          '[BrevoTransport] Email delivery failed',
        );
        throw new Error(`Brevo email delivery failed (${response.status}): ${safeError}`);
      }

      let messageId: string | undefined;
      if (typeof response.json === 'function') {
        try {
          const body = (await response.json()) as { messageId?: string };
          messageId = body?.messageId;
        } catch {
          // Ignore non-JSON empty success bodies
        }
      }

      logger.info(
        { to: redactedTo, subject: options.subject, ...(messageId ? { messageId } : {}) },
        '[BrevoTransport] Email delivered successfully',
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        logger.error(
          { to: redactedTo, timeoutMs: this.timeoutMs },
          '[BrevoTransport] Request timed out',
        );
        throw new Error(`Brevo email delivery timed out after ${this.timeoutMs}ms`);
      }

      if (error instanceof Error && error.message.startsWith('Brevo email delivery failed')) {
        throw error;
      }

      const safeMessage = sanitizeErrorText(error instanceof Error ? error.message : String(error));
      logger.error(
        { to: redactedTo, error: safeMessage },
        '[BrevoTransport] Network error during email delivery',
      );
      throw new Error(`Brevo email delivery network error: ${safeMessage}`);
    }
  }
}
