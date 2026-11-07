export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailTransport {
  send(options: SendEmailOptions): Promise<void>;
}

export interface VerificationEmailData {
  to: string;
  name: string;
  token: string;
  locale?: 'en' | 'bn';
}

export interface PasswordResetEmailData {
  to: string;
  name: string;
  token: string;
  locale?: 'en' | 'bn';
}
