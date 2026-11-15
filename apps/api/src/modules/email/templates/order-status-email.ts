import { env } from '../../../config/env.js';
import type { OrderStatusEmailData } from '../email.types.js';
import { escapeHtml, formatPoisha, toBengaliDigits, wrapInEmailLayout } from './email-utils.js';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderOrderStatusEmail(data: OrderStatusEmailData): RenderedEmail {
  const locale = data.locale || 'en';
  const orderUrl = `${env.FRONTEND_URL}/${locale}/account/orders/${data.orderId}`;
  const isBn = locale === 'bn';

  let statusTitleEn = '';
  let statusTitleBn = '';
  let descriptionEn = '';
  let descriptionBn = '';
  let badgeClass = 'badge-blue';

  switch (data.status) {
    case 'PROCESSING':
      statusTitleEn = 'Processing';
      statusTitleBn = 'প্রক্রিয়াকরণ চলছে';
      descriptionEn =
        'Your order has been confirmed and is now being picked, tested, and packaged for dispatch.';
      descriptionBn =
        'আপনার অর্ডারটি প্রস্তুত করা হচ্ছে এবং খুব শীঘ্রই কুরিয়ারে হস্তান্তর করা হবে।';
      badgeClass = 'badge-blue';
      break;
    case 'SHIPPED':
      statusTitleEn = 'Shipped / In Transit';
      statusTitleBn = 'ডেলিভারির জন্য প্রেরিত';
      descriptionEn =
        'Great news! Your package is on its way to your delivery address with our courier partner.';
      descriptionBn =
        'আপনার পার্সেলটি আমাদের ডেলিভারি পার্টনারের কাছে হস্তান্তর করা হয়েছে এবং আপনার ঠিকানায় পৌঁছানোর পথে রয়েছে।';
      badgeClass = 'badge-amber';
      break;
    case 'DELIVERED':
      statusTitleEn = 'Delivered';
      statusTitleBn = 'ডেলিভারি সম্পন্ন';
      descriptionEn =
        'Your order has been delivered. We hope you enjoy your purchase! You have 7 days to request a return if needed.';
      descriptionBn =
        'আপনার অর্ডারটি সফলভাবে ডেলিভারি করা হয়েছে। যেকোনো প্রয়োজনে ৭ দিনের মধ্যে রিটার্ন আবেদন করতে পারবেন।';
      badgeClass = 'badge-green';
      break;
    case 'CANCELLED':
      statusTitleEn = 'Cancelled';
      statusTitleBn = 'বাতিল করা হয়েছে';
      descriptionEn = `Your order has been cancelled.${
        data.reason ? ` Reason: ${data.reason}` : ''
      } If you made an online payment, a refund will be processed in accordance with our return and refund policy.`;
      descriptionBn = `আপনার অর্ডারটি বাতিল করা হয়েছে।${
        data.reason ? ` কারণ: ${data.reason}` : ''
      } অনলাইন পেমেন্ট করে থাকলে আমাদের নীতিমালা অনুযায়ী রিফান্ড প্রদান করা হবে।`;
      badgeClass = 'badge-red';
      break;
  }

  const statusLabel = isBn ? statusTitleBn : statusTitleEn;
  const description = isBn ? descriptionBn : descriptionEn;

  const subject = isBn
    ? `অর্ডার #${data.orderNumber} এর স্ট্যাটাস আপডেট: ${statusLabel}`
    : `Order #${data.orderNumber} Update: ${statusLabel}`;

  // Plain Text Version
  const textItems = data.items
    .map((item) => `- ${item.productName} (${item.variantTitle}) x${item.quantity}`)
    .join('\n');

  const text = isBn
    ? `হ্যালো ${data.customerName},

আপনার অর্ডার #${data.orderNumber} এর স্ট্যাটাস আপডেট হয়েছে।

বর্তমান স্ট্যাটাস: ${statusLabel}
${description}

পণ্যসমূহ:
${textItems}

মোট প্রদেয়: ${formatPoisha(data.totalPayable, locale)}

অর্ডারের সম্পূর্ণ অগ্রগতি দেখতে ভিজিট করুন:
${orderUrl}

ধন্যবাদ,
${data.storeName || 'DigitalDepot'} টিম`
    : `Hello ${data.customerName},

There is an update on your order #${data.orderNumber}.

Current Status: ${statusLabel}
${description}

Order Items:
${textItems}

Total Payable: ${formatPoisha(data.totalPayable, locale)}

View your complete order timeline here:
${orderUrl}

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
      ${isBn ? `অর্ডার #${data.orderNumber} আপডেট` : `Update on Order #${data.orderNumber}`}
    </h2>

    <p style="font-size: 15px; line-height: 24px; color: #334155;">
      ${isBn ? `হ্যালো <strong>${escapeHtml(data.customerName)}</strong>,` : `Hello <strong>${escapeHtml(data.customerName)}</strong>,`}
    </p>

    <div class="notes-box">
      ${escapeHtml(description)}
    </div>

    <h3 style="font-size: 15px; font-weight: 600; color: #0f172a; margin-top: 24px; margin-bottom: 8px;">
      ${isBn ? 'অর্ডারের পণ্যসমূহ' : 'Items in this order'}
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
      <a href="${orderUrl}" class="button" target="_blank">
        ${isBn ? 'অর্ডারের বিস্তারিত দেখুন' : 'Track Order Status'}
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
