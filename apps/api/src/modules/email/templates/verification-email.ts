import { env } from '../../../config/env.js';

export interface VerificationTemplateProps {
  name: string;
  token: string;
  locale?: 'en' | 'bn';
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderVerificationEmail({
  name,
  token,
  locale = 'en',
}: VerificationTemplateProps): RenderedEmail {
  const verificationUrl = `${env.FRONTEND_URL}/${locale}/verify-email?token=${encodeURIComponent(token)}`;

  if (locale === 'bn') {
    const subject = 'আপনার DigitalDepot অ্যাকাউন্ট যাচাই করুন';
    const text = `হ্যালো ${name},

DigitalDepot-এ অ্যাকাউন্ট তৈরি করার জন্য ধন্যবাদ।

আপনার ইমেইল ঠিকানা যাচাই করতে অনুগ্রহ করে নিচের লিংকে ক্লিক করুন:
${verificationUrl}

এই লিংকটির মেয়াদ ২৪ ঘণ্টা।

যদি আপনি এই অ্যাকাউন্টটি তৈরি না করে থাকেন, তবে কোনো পদক্ষেপের প্রয়োজন নেই।

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
        <p>DigitalDepot-এ অ্যাকাউন্ট তৈরি করার জন্য আপনাকে ধন্যবাদ। আপনার অ্যাকাউন্টটি সক্রিয় করতে এবং কেনাকাটা শুরু করতে অনুগ্রহ করে আপনার ইমেইল ঠিকানা যাচাই করুন।</p>
        <div class="button-container">
          <a href="${verificationUrl}" class="button" target="_blank">ইমেইল যাচাই করুন</a>
        </div>
        <p>এই যাচাইকরণ লিংকটির মেয়াদ <strong>২৪ ঘণ্টা</strong> থাকবে।</p>
        <p>যদি বাটনটি কাজ না করে, নিচের লিংকটি কপি করে আপনার ব্রাউজারে পেস্ট করুন:</p>
        <p class="link-alt"><a href="${verificationUrl}">${verificationUrl}</a></p>
      </div>
      <div class="footer">
        <p>যদি আপনি এই অ্যাকাউন্টটি তৈরি না করে থাকেন, তবে নিশ্চিন্তে এই ইমেইলটি এড়িয়ে যেতে পারেন। আপনার অনুমতি ছাড়া কোনো অ্যাকাউন্ট সক্রিয় হবে না।</p>
        <p>&copy; ${new Date().getFullYear()} DigitalDepot. সর্বস্বত্ব সংরক্ষিত।</p>
      </div>
    </div>
  </div>
</body>
</html>`;

    return { subject, html, text };
  }

  // Default to English
  const subject = 'Verify your DigitalDepot account';
  const text = `Hello ${name},

Thank you for creating an account with DigitalDepot.

Please verify your email address by visiting the following link:
${verificationUrl}

This link is valid for 24 hours.

If you did not create an account, no further action is required.

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
        <p>Thank you for creating an account with DigitalDepot. Please click the button below to verify your email address and activate your account.</p>
        <div class="button-container">
          <a href="${verificationUrl}" class="button" target="_blank">Verify Email Address</a>
        </div>
        <p>This verification link is valid for <strong>24 hours</strong>.</p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p class="link-alt"><a href="${verificationUrl}">${verificationUrl}</a></p>
      </div>
      <div class="footer">
        <p>If you did not register for an account, you can safely ignore this email. No account will be activated without verification.</p>
        <p>&copy; ${new Date().getFullYear()} DigitalDepot. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  return { subject, html, text };
}
