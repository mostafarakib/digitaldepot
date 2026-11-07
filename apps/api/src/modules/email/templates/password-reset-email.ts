import { env } from '../../../config/env.js';

export interface PasswordResetTemplateProps {
  name: string;
  token: string;
  locale?: 'en' | 'bn';
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderPasswordResetEmail({
  name,
  token,
  locale = 'en',
}: PasswordResetTemplateProps): RenderedEmail {
  const resetUrl = `${env.FRONTEND_URL}/${locale}/reset-password?token=${encodeURIComponent(token)}`;

  if (locale === 'bn') {
    const subject = 'আপনার DigitalDepot পাসওয়ার্ড রিসেট করুন';
    const text = `হ্যালো ${name},

আপনার DigitalDepot অ্যাকাউন্টের পাসওয়ার্ড রিসেট করার জন্য একটি অনুরোধ পেয়েছি।

পাসওয়ার্ড রিসেট করতে অনুগ্রহ করে নিচের লিংকে ক্লিক করুন:
${resetUrl}

এই লিংকটির মেয়াদ ১ ঘণ্টা থাকবে।

যদি আপনি পাসওয়ার্ড রিসেটের অনুরোধ না করে থাকেন, তবে নিশ্চিন্তে এই ইমেইলটি এড়িয়ে যেতে পারেন। আপনার পাসওয়ার্ড অপরিবর্তিত থাকবে।

ধন্যবাদ,
DigitalDepot টিম`;

    const html = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { font-size: 24px; font-weight: bold; color: #0f172a; margin-bottom: 24px; }
    .content { font-size: 16px; line-height: 26px; color: #334155; margin-bottom: 32px; }
    .button-container { text-align: center; margin: 32px 0; }
    .button { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 16px; padding: 12px 28px; border-radius: 6px; }
    .footer { font-size: 13px; color: #64748b; line-height: 20px; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 32px; }
    .link-alt { word-break: break-all; color: #2563eb; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">DigitalDepot</div>
      <div class="content">
        <p>হ্যালো <strong>${name}</strong>,</p>
        <p>আপনার DigitalDepot অ্যাকাউন্টের পাসওয়ার্ড রিসেট করার জন্য একটি অনুরোধ পাওয়া গেছে। একটি নতুন পাসওয়ার্ড নির্বাচন করতে নিচের বাটনে ক্লিক করুন:</p>
        <div class="button-container">
          <a href="${resetUrl}" class="button" target="_blank">পাসওয়ার্ড রিসেট করুন</a>
        </div>
        <p>এই পাসওয়ার্ড রিসেট লিংকটির মেয়াদ <strong>১ ঘণ্টা</strong> থাকবে।</p>
        <p>যদি বাটনটি কাজ না করে, নিচের লিংকটি কপি করে আপনার ব্রাউজারে পেস্ট করুন:</p>
        <p class="link-alt"><a href="${resetUrl}">${resetUrl}</a></p>
      </div>
      <div class="footer">
        <p>যদি আপনি এই অনুরোধ না করে থাকেন, তবে নিশ্চিন্তে এই ইমেইলটি এড়িয়ে চলুন। আপনার অনুমতি ছাড়া কোনো পাসওয়ার্ড পরিবর্তন হবে না।</p>
        <p>&copy; ${new Date().getFullYear()} DigitalDepot. সর্বস্বত্ব সংরক্ষিত।</p>
      </div>
    </div>
  </div>
</body>
</html>`;

    return { subject, html, text };
  }

  // Default to English
  const subject = 'Reset your DigitalDepot password';
  const text = `Hello ${name},

We received a request to reset your DigitalDepot account password.

Please click the following link to choose a new password:
${resetUrl}

This link is valid for 1 hour.

If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.

Best regards,
The DigitalDepot Team`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { font-size: 24px; font-weight: bold; color: #0f172a; margin-bottom: 24px; }
    .content { font-size: 16px; line-height: 26px; color: #334155; margin-bottom: 32px; }
    .button-container { text-align: center; margin: 32px 0; }
    .button { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 16px; padding: 12px 28px; border-radius: 6px; }
    .footer { font-size: 13px; color: #64748b; line-height: 20px; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 32px; }
    .link-alt { word-break: break-all; color: #2563eb; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">DigitalDepot</div>
      <div class="content">
        <p>Hello <strong>${name}</strong>,</p>
        <p>We received a request to reset the password for your DigitalDepot account. Click the button below to choose a new password:</p>
        <div class="button-container">
          <a href="${resetUrl}" class="button" target="_blank">Reset Password</a>
        </div>
        <p>This password reset link is valid for <strong>1 hour</strong>.</p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p class="link-alt"><a href="${resetUrl}">${resetUrl}</a></p>
      </div>
      <div class="footer">
        <p>If you did not request a password reset, you can safely ignore this email. Your account remains secure and your password will not be changed.</p>
        <p>&copy; ${new Date().getFullYear()} DigitalDepot. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  return { subject, html, text };
}
