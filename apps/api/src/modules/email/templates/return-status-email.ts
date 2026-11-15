import { env } from '../../../config/env.js';
import type { ReturnStatusEmailData } from '../email.types.js';
import { escapeHtml, toBengaliDigits, wrapInEmailLayout } from './email-utils.js';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderReturnStatusEmail(data: ReturnStatusEmailData): RenderedEmail {
  const locale = data.locale || 'en';
  const returnUrl = `${env.FRONTEND_URL}/${locale}/account/returns/${data.returnId}`;
  const isBn = locale === 'bn';

  const isApproved = data.status === 'APPROVED';
  const statusLabel = isApproved
    ? isBn
      ? 'অনুমোদিত'
      : 'Approved'
    : isBn
      ? 'প্রত্যাখ্যাত'
      : 'Rejected';

  const badgeClass = isApproved ? 'badge-green' : 'badge-red';

  const subject = isBn
    ? `রিটার্ন আবেদন #${data.returnNumber} ${statusLabel} হয়েছে`
    : `Return Request #${data.returnNumber} ${statusLabel}`;

  const messageEn = isApproved
    ? 'Your return request has been reviewed and approved by our team. Please securely package the items with all original accessories and packaging. Our courier partner will collect the items from your address, or you may drop them off at our designated point. Final refund will be processed upon physical item inspection.'
    : `Your return request has been reviewed and rejected.${
        data.reason ? ` Reason: ${data.reason}` : ''
      } If you have questions regarding this decision, please contact our support team.`;

  const messageBn = isApproved
    ? 'আপনার রিটার্ন আবেদনটি পর্যালোচনা করে অনুমোদন দেওয়া হয়েছে। অনুগ্রহ করে পণ্যটি তার মূল প্যাকেজিং ও প্রয়োজনীয় এক্সেসরিজসহ সুরক্ষিতভাবে প্রস্তুত রাখুন। আমাদের কুরিয়ার প্রতিনিধি আপনার সাথে যোগাযোগ করবেন। পণ্যটি হাতে পাওয়ার পর যথাযথ পরীক্ষার মাধ্যমে চূড়ান্ত রিফান্ড সম্পন্ন করা হবে।'
    : `আপনার রিটার্ন আবেদনটি পর্যালোচনা শেষে প্রত্যাখ্যাত হয়েছে।${
        data.reason ? ` কারণ: ${data.reason}` : ''
      } এ বিষয়ে কোনো জিজ্ঞাসা থাকলে আমাদের কাস্টমার সাপোর্টে যোগাযোগ করতে পারেন।`;

  const message = isBn ? messageBn : messageEn;

  // Plain Text Version
  const textItems = data.items
    .map((item) => `- ${item.productName} (${item.variantTitle}) x${item.quantity}`)
    .join('\n');

  const text = isBn
    ? `হ্যালো ${data.customerName},

আপনার রিটার্ন আবেদন #${data.returnNumber} (অর্ডার #${data.orderNumber}) এর অগ্রগতি:

স্ট্যাটাস: ${statusLabel}
${message}

ফেরতকৃত পণ্যসমূহ:
${textItems}

রিটার্ন আবেদনের বিস্তারিত দেখতে ভিজিট করুন:
${returnUrl}

ধন্যবাদ,
${data.storeName || 'DigitalDepot'} টিম`
    : `Hello ${data.customerName},

Update regarding your return request #${data.returnNumber} for Order #${data.orderNumber}:

Status: ${statusLabel}
${message}

Returned Items:
${textItems}

View return request details:
${returnUrl}

Thank you,
${data.storeName || 'DigitalDepot'} Team`;

  // HTML Version
  const htmlItems = data.items
    .map(
      (item) => `
      <tr>
        <td>
          <div style="font-weight: 600; color: #0f172a;">${escapeHtml(item.productName)}</div>
          <div style="font-size: 13px; color: #64748b;">${escapeHtml(item.variantTitle)}</div>
        </td>
        <td style="text-align: center; color: #334155;">${
          isBn ? toBengaliDigits(item.quantity) : item.quantity
        }</td>
      </tr>`,
    )
    .join('');

  const bodyContent = `
    <div style="margin-bottom: 20px;">
      <span class="badge ${badgeClass}" style="font-size: 13px; padding: 6px 12px;">
        ${escapeHtml(statusLabel)}
      </span>
    </div>

    <h2 style="font-size: 20px; font-weight: bold; margin-top: 0; color: #0f172a;">
      ${isBn ? `রিটার্ন আবেদন #${data.returnNumber} আপডেট` : `Return Request #${data.returnNumber} Update`}
    </h2>

    <p style="font-size: 15px; line-height: 24px; color: #334155;">
      ${isBn ? `হ্যালো <strong>${escapeHtml(data.customerName)}</strong>,` : `Hello <strong>${escapeHtml(data.customerName)}</strong>,`}
    </p>

    <div class="notes-box">
      ${escapeHtml(message)}
    </div>

    <h3 style="font-size: 15px; font-weight: 600; color: #0f172a; margin-top: 24px; margin-bottom: 8px;">
      ${isBn ? 'ফেরতকৃত পণ্যসমূহ' : 'Returned Items'}
    </h3>
    <table>
      <thead>
        <tr>
          <th>${isBn ? 'পণ্য' : 'Item'}</th>
          <th style="text-align: center;">${isBn ? 'পরিমাণ' : 'Qty'}</th>
        </tr>
      </thead>
      <tbody>
        ${htmlItems}
      </tbody>
    </table>

    <div class="button-container">
      <a href="${returnUrl}" class="button" target="_blank">
        ${isBn ? 'রিটার্নের বিবরণ দেখুন' : 'View Return Details'}
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
