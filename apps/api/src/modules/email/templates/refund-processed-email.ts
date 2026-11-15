import { env } from '../../../config/env.js';
import type { RefundProcessedEmailData } from '../email.types.js';
import { escapeHtml, formatPoisha, wrapInEmailLayout } from './email-utils.js';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderRefundProcessedEmail(data: RefundProcessedEmailData): RenderedEmail {
  const locale = data.locale || 'en';
  const orderUrl = `${env.FRONTEND_URL}/${locale}/account/orders/${data.orderId}`;
  const isBn = locale === 'bn';

  const methodLabelEn =
    data.method === 'SSLCOMMERZ' ? 'Original Payment Method (Online)' : 'Cash / Manual Settlement';
  const methodLabelBn =
    data.method === 'SSLCOMMERZ'
      ? 'মূল পেমেন্ট মাধ্যম (অনলাইন পেমেন্ট গেটওয়ে)'
      : 'নগদ / ম্যানুয়াল নিষ্পত্তি';

  const methodLabel = isBn ? methodLabelBn : methodLabelEn;

  // Review Clarification 6: Do not promise fixed settlement timelines
  const timelineNoticeEn =
    data.method === 'SSLCOMMERZ'
      ? 'Depending on your payment method and card issuer or mobile financial service provider, the refunded amount will reflect in your account according to standard banking processing times.'
      : 'Cash or manual settlement has been completed directly. Please check your account or contact our support team if you have any questions.';

  const timelineNoticeBn =
    data.method === 'SSLCOMMERZ'
      ? 'আপনার পেমেন্ট মাধ্যম এবং সংশ্লিষ্ট ব্যাংক বা মোবাইল ফাইন্যান্সিয়াল সার্ভিসের নির্ধারিত প্রক্রিয়াকরণ সময় অনুযায়ী রিফান্ডের অর্থ আপনার অ্যাকাউন্টে জমা হবে।'
      : 'নগদ বা ম্যানুয়াল রিফান্ড নিষ্পত্তি সম্পন্ন হয়েছে। কোনো তথ্যের জন্য আমাদের কাস্টমার সাপোর্টে যোগাযোগ করতে পারেন।';

  const timelineNotice = isBn ? timelineNoticeBn : timelineNoticeEn;

  const subject = isBn
    ? `রিফান্ড সম্পন্ন #${data.refundNumber} - ${formatPoisha(data.amount, locale)}`
    : `Refund Processed #${data.refundNumber} - ${formatPoisha(data.amount, locale)}`;

  // Plain Text Version
  const text = isBn
    ? `হ্যালো ${data.customerName},

আপনার রিটার্ন #${data.returnNumber} (অর্ডার #${data.orderNumber}) এর রিফান্ড সফলভাবে সম্পন্ন হয়েছে।

রিফান্ড নম্বর: #${data.refundNumber}
পেমেন্ট মাধ্যম: ${methodLabel}

রিফান্ড বিবরণ:
- পণ্য রিফান্ড: ${formatPoisha(data.merchandiseAmount, locale)}${
        data.shippingAmount > 0
          ? `\n- ডেলিভারি চার্জ রিফান্ড: ${formatPoisha(data.shippingAmount, locale)}`
          : ''
      }
মোট রিফান্ডকৃত অর্থ: ${formatPoisha(data.amount, locale)}

${timelineNotice}

অর্ডারের বিবরণ দেখতে ভিজিট করুন:
${orderUrl}

ধন্যবাদ,
${data.storeName || 'DigitalDepot'} টিম`
    : `Hello ${data.customerName},

Your refund for Return #${data.returnNumber} (Order #${data.orderNumber}) has been successfully processed.

Refund Number: #${data.refundNumber}
Refund Method: ${methodLabel}

Refund Summary:
- Merchandise Refund: ${formatPoisha(data.merchandiseAmount, locale)}${
        data.shippingAmount > 0
          ? `\n- Shipping Fee Refund: ${formatPoisha(data.shippingAmount, locale)}`
          : ''
      }
Total Refunded: ${formatPoisha(data.amount, locale)}

${timelineNotice}

View your order history here:
${orderUrl}

Thank you,
${data.storeName || 'DigitalDepot'} Team`;

  // HTML Version
  const bodyContent = `
    <div style="margin-bottom: 20px;">
      <span class="badge badge-green" style="font-size: 13px; padding: 6px 12px;">
        ${isBn ? 'রিফান্ড সম্পন্ন' : 'Refund Processed'}
      </span>
    </div>

    <h2 style="font-size: 20px; font-weight: bold; margin-top: 0; color: #0f172a;">
      ${isBn ? `রিফান্ড #${data.refundNumber}` : `Refund #${data.refundNumber}`}
    </h2>

    <p style="font-size: 15px; line-height: 24px; color: #334155;">
      ${
        isBn
          ? `হ্যালো <strong>${escapeHtml(data.customerName)}</strong>, আপনার রিটার্ন আবেদন #${escapeHtml(
              data.returnNumber,
            )} এর রিফান্ড সফলভাবে সম্পন্ন করা হয়েছে।`
          : `Hello <strong>${escapeHtml(data.customerName)}</strong>, your refund for return request #${escapeHtml(
              data.returnNumber,
            )} has been processed.`
      }
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 20px 0;">
      <table style="margin: 0; width: 100%;">
        <tr>
          <td style="padding: 4px 0; border: none; font-size: 13px; color: #64748b;">${isBn ? 'অর্ডার নম্বর:' : 'Order Number:'}</td>
          <td style="padding: 4px 0; border: none; font-size: 14px; font-weight: 600; text-align: right; color: #0f172a;">#${escapeHtml(data.orderNumber)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; border: none; font-size: 13px; color: #64748b;">${isBn ? 'রিটার্ন নম্বর:' : 'Return Number:'}</td>
          <td style="padding: 4px 0; border: none; font-size: 13px; font-weight: 600; text-align: right; color: #0f172a;">#${escapeHtml(data.returnNumber)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; border: none; font-size: 13px; color: #64748b;">${isBn ? 'রিফান্ড মাধ্যম:' : 'Refund Method:'}</td>
          <td style="padding: 4px 0; border: none; font-size: 13px; font-weight: 500; text-align: right; color: #0f172a;">${escapeHtml(methodLabel)}</td>
        </tr>
      </table>
    </div>

    <!-- Refund Totals -->
    <table class="summary-table" style="max-width: 320px; margin-left: auto; margin-right: 0;">
      <tr>
        <td style="color: #64748b;">${isBn ? 'পণ্য রিফান্ড:' : 'Merchandise Refund:'}</td>
        <td class="text-right" style="color: #0f172a;">${formatPoisha(data.merchandiseAmount, locale)}</td>
      </tr>
      ${
        data.shippingAmount > 0
          ? `<tr>
              <td style="color: #64748b;">${isBn ? 'ডেলিভারি চার্জ রিফান্ড:' : 'Shipping Refund:'}</td>
              <td class="text-right" style="color: #0f172a;">${formatPoisha(data.shippingAmount, locale)}</td>
            </tr>`
          : ''
      }
      <tr class="total-row">
        <td>${isBn ? 'মোট রিফান্ড:' : 'Total Refund:'}</td>
        <td class="text-right" style="color: #15803d;">${formatPoisha(data.amount, locale)}</td>
      </tr>
    </table>

    <div class="notes-box">
      ${escapeHtml(timelineNotice)}
    </div>

    <div class="button-container">
      <a href="${orderUrl}" class="button" target="_blank">
        ${isBn ? 'অর্ডারের বিবরণ দেখুন' : 'View Order Details'}
      </a>
    </div>
  `;

  const html = wrapInEmailLayout({
    title: subject,
    bodyContent,
    storeName: data.storeName,
    supportEmail: data.supportEmail,
    supportPhone: data.supportPhone,
    locale,
  });

  return { subject, html, text };
}
