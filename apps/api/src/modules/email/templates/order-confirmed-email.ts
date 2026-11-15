import { env } from '../../../config/env.js';
import type { OrderConfirmedEmailData } from '../email.types.js';
import { escapeHtml, formatPoisha, toBengaliDigits, wrapInEmailLayout } from './email-utils.js';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderOrderConfirmedEmail(data: OrderConfirmedEmailData): RenderedEmail {
  const locale = data.locale || 'en';
  const orderUrl = `${env.FRONTEND_URL}/${locale}/account/orders/${data.orderId}`;
  const isBn = locale === 'bn';

  const daysMin = isBn ? toBengaliDigits(data.estimatedDaysMin) : data.estimatedDaysMin;
  const daysMax = isBn ? toBengaliDigits(data.estimatedDaysMax) : data.estimatedDaysMax;

  const paymentMethodLabel =
    data.paymentMethod === 'COD'
      ? isBn
        ? 'ক্যাশ অন ডেলিভারি (পণ্য গ্রহণের সময় পরিশোধযোগ্য)'
        : 'Cash on Delivery (Pay upon delivery)'
      : isBn
        ? 'অনলাইন পেমেন্ট (পরিশোধিত)'
        : 'Online Payment (Paid)';

  const subject = isBn
    ? `অর্ডার নিশ্চিতকরণ #${data.orderNumber} - ${data.storeName || 'DigitalDepot'}`
    : `Order Confirmation #${data.orderNumber} - ${data.storeName || 'DigitalDepot'}`;

  // Plain Text Version
  const textItems = data.items
    .map(
      (item) =>
        `- ${item.productName} (${item.variantTitle}) x${item.quantity} = ${formatPoisha(
          item.lineTotal,
          locale,
        )}`,
    )
    .join('\n');

  const text = isBn
    ? `হ্যালো ${data.customerName},

আপনার অর্ডারটি সফলভাবে গৃহীত ও নিশ্চিত করা হয়েছে।

অর্ডার নম্বর: #${data.orderNumber}
পেমেন্ট মাধ্যম: ${paymentMethodLabel}
সম্ভাব্য ডেলিভারি সময়: ${daysMin}–${daysMax} কর্মদিবস

ডেলিভারি ঠিকানা:
${data.shippingRecipientName}
${data.shippingPhone}
${data.shippingAddress}

অর্ডারকৃত পণ্যসমূহ:
${textItems}

উপমোট: ${formatPoisha(data.merchandiseSubtotal, locale)}${
        data.discountAmount > 0 ? `\nকুপন ছাড়: -${formatPoisha(data.discountAmount, locale)}` : ''
      }
ডেলিভারি চার্জ: ${formatPoisha(data.shippingFee, locale)}
সর্বমোট প্রদেয়: ${formatPoisha(data.totalPayable, locale)}

আপনার অর্ডারটি ট্র্যাক করতে ভিজিট করুন:
${orderUrl}

ধন্যবাদ,
${data.storeName || 'DigitalDepot'} টিম`
    : `Hello ${data.customerName},

Thank you for your order! Your order has been successfully placed and confirmed.

Order Number: #${data.orderNumber}
Payment Method: ${paymentMethodLabel}
Estimated Delivery: ${daysMin}–${daysMax} business days

Shipping Address:
${data.shippingRecipientName}
${data.shippingPhone}
${data.shippingAddress}

Items:
${textItems}

Subtotal: ${formatPoisha(data.merchandiseSubtotal, locale)}${
        data.discountAmount > 0 ? `\nDiscount: -${formatPoisha(data.discountAmount, locale)}` : ''
      }
Shipping Fee: ${formatPoisha(data.shippingFee, locale)}
Total Payable: ${formatPoisha(data.totalPayable, locale)}

You can track your order here:
${orderUrl}

Thank you for shopping with us!
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
        <td class="text-right" style="color: #334155;">${formatPoisha(item.unitPrice, locale)}</td>
        <td class="text-right" style="font-weight: 600; color: #0f172a;">${formatPoisha(
          item.lineTotal,
          locale,
        )}</td>
      </tr>`,
    )
    .join('');

  const bodyContent = `
    <h2 style="font-size: 20px; font-weight: bold; margin-top: 0; color: #0f172a;">
      ${isBn ? 'আপনার অর্ডারের জন্য ধন্যবাদ!' : 'Thank you for your order!'}
    </h2>
    <p>
      ${
        isBn
          ? `হ্যালো <strong>${escapeHtml(data.customerName)}</strong>, আপনার অর্ডারটি সফলভাবে গ্রহণ ও নিশ্চিত করা হয়েছে।`
          : `Hello <strong>${escapeHtml(data.customerName)}</strong>, your order has been received and confirmed.`
      }
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 20px 0;">
      <table style="margin: 0; width: 100%;">
        <tr>
          <td style="padding: 4px 0; border: none; font-size: 13px; color: #64748b;">${isBn ? 'অর্ডার নম্বর:' : 'Order Number:'}</td>
          <td style="padding: 4px 0; border: none; font-size: 14px; font-weight: 600; text-align: right; color: #0f172a;">#${escapeHtml(data.orderNumber)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; border: none; font-size: 13px; color: #64748b;">${isBn ? 'পেমেন্ট মাধ্যম:' : 'Payment Method:'}</td>
          <td style="padding: 4px 0; border: none; font-size: 13px; font-weight: 500; text-align: right; color: #0f172a;">${escapeHtml(paymentMethodLabel)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; border: none; font-size: 13px; color: #64748b;">${isBn ? 'সম্ভাব্য ডেলিভারি:' : 'Estimated Delivery:'}</td>
          <td style="padding: 4px 0; border: none; font-size: 13px; font-weight: 600; text-align: right; color: #2563eb;">${daysMin}–${daysMax} ${isBn ? 'কর্মদিবস' : 'business days'}</td>
        </tr>
      </table>
    </div>

    <h3 style="font-size: 16px; font-weight: 600; color: #0f172a; margin-top: 24px; margin-bottom: 8px;">
      ${isBn ? 'অর্ডারকৃত পণ্যসমূহ' : 'Order Items'}
    </h3>
    <table>
      <thead>
        <tr>
          <th>${isBn ? 'পণ্য' : 'Item'}</th>
          <th style="text-align: center;">${isBn ? 'পরিমাণ' : 'Qty'}</th>
          <th class="text-right">${isBn ? 'মূল্য' : 'Price'}</th>
          <th class="text-right">${isBn ? 'মোট' : 'Total'}</th>
        </tr>
      </thead>
      <tbody>
        ${htmlItems}
      </tbody>
    </table>

    <!-- Financial Totals -->
    <table class="summary-table" style="max-width: 320px; margin-left: auto; margin-right: 0;">
      <tr>
        <td style="color: #64748b;">${isBn ? 'উপমোট:' : 'Subtotal:'}</td>
        <td class="text-right" style="color: #0f172a;">${formatPoisha(data.merchandiseSubtotal, locale)}</td>
      </tr>
      ${
        data.discountAmount > 0
          ? `<tr>
              <td style="color: #16a34a;">${isBn ? 'কুপন ছাড়:' : 'Discount:'}</td>
              <td class="text-right" style="color: #16a34a;">-${formatPoisha(data.discountAmount, locale)}</td>
            </tr>`
          : ''
      }
      <tr>
        <td style="color: #64748b;">${isBn ? 'ডেলিভারি চার্জ:' : 'Shipping Fee:'}</td>
        <td class="text-right" style="color: #0f172a;">${formatPoisha(data.shippingFee, locale)}</td>
      </tr>
      <tr class="total-row">
        <td>${isBn ? 'সর্বমোট প্রদেয়:' : 'Total Payable:'}</td>
        <td class="text-right">${formatPoisha(data.totalPayable, locale)}</td>
      </tr>
    </table>

    <!-- Shipping Address -->
    <div style="background-color: #f8fafc; border-radius: 6px; padding: 16px; margin: 24px 0;">
      <div style="font-weight: 600; font-size: 14px; color: #0f172a; margin-bottom: 4px;">
        ${isBn ? 'ডেলিভারি ঠিকানা' : 'Shipping Address'}
      </div>
      <div style="font-size: 13px; line-height: 20px; color: #475569;">
        <strong>${escapeHtml(data.shippingRecipientName)}</strong> (${escapeHtml(data.shippingPhone)})<br>
        ${escapeHtml(data.shippingAddress)}
      </div>
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
