import { env } from '../../config/env.js';
import type {
  EmailTransport,
  VerificationEmailData,
  PasswordResetEmailData,
} from './email.types.js';
import { ConsoleTransport } from './transports/console.transport.js';
import { BrevoTransport } from './transports/brevo.transport.js';
import { ResendTransport } from './transports/resend.transport.js';
import { renderVerificationEmail } from './templates/verification-email.js';
import { renderPasswordResetEmail } from './templates/password-reset-email.js';
import {
  renderOrderConfirmedEmail,
  type RenderedEmail,
} from './templates/order-confirmed-email.js';
import { renderOrderStatusEmail } from './templates/order-status-email.js';
import { renderReturnStatusEmail } from './templates/return-status-email.js';
import { renderRefundProcessedEmail } from './templates/refund-processed-email.js';

export {
  renderOrderConfirmedEmail,
  renderOrderStatusEmail,
  renderReturnStatusEmail,
  renderRefundProcessedEmail,
  type RenderedEmail,
};

export class EmailService {
  private transport: EmailTransport;

  constructor() {
    this.transport = this.createDefaultTransport();
  }

  private createDefaultTransport(): EmailTransport {
    if (env.EMAIL_PROVIDER === 'brevo') {
      if (!env.BREVO_API_KEY || env.BREVO_API_KEY.trim().length === 0) {
        throw new Error('BREVO_API_KEY is required when EMAIL_PROVIDER is "brevo"');
      }
      return new BrevoTransport({
        apiKey: env.BREVO_API_KEY,
        from: env.EMAIL_FROM,
        timeoutMs: 5000,
      });
    }

    if (env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY) {
      return new ResendTransport({
        apiKey: env.RESEND_API_KEY,
        from: env.EMAIL_FROM,
        timeoutMs: 5000,
      });
    }

    return new ConsoleTransport();
  }

  setTransport(transport: EmailTransport): void {
    this.transport = transport;
  }

  getTransport(): EmailTransport {
    return this.transport;
  }

  async sendVerificationEmail(data: VerificationEmailData): Promise<void> {
    const rendered = renderVerificationEmail({
      name: data.name,
      token: data.token,
      locale: data.locale,
    });

    await this.transport.send({
      to: data.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }

  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
    const rendered = renderPasswordResetEmail({
      name: data.name,
      token: data.token,
      locale: data.locale,
    });

    await this.transport.send({
      to: data.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }
}

export const emailService = new EmailService();
