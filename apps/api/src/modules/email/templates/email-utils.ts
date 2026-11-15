export interface EmailLayoutOptions {
  title: string;
  bodyContent: string;
  storeName?: string;
  supportEmail?: string;
  supportPhone?: string;
  locale?: 'en' | 'bn';
}

const BN_DIGITS: Record<string, string> = {
  '0': '০',
  '1': '১',
  '2': '২',
  '3': '৩',
  '4': '৪',
  '5': '৫',
  '6': '৬',
  '7': '৭',
  '8': '৮',
  '9': '৯',
};

export function toBengaliDigits(str: string | number): string {
  return String(str).replace(/[0-9]/g, (match) => BN_DIGITS[match] || match);
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Formats integer BDT poisha into a clean currency string with BDT symbol.
 * Example: 10800000 -> ৳1,08,000 (en) or ৳১,০৮,০০০ (bn)
 */
export function formatPoisha(poisha: number, locale: 'en' | 'bn' = 'en'): string {
  const isNegative = poisha < 0;
  const absPoisha = Math.abs(poisha);
  const taka = Math.floor(absPoisha / 100);
  const remainderPoisha = absPoisha % 100;

  const integerFormatted = taka.toLocaleString('en-IN');
  const baseFormatted =
    remainderPoisha > 0
      ? `${integerFormatted}.${remainderPoisha.toString().padStart(2, '0')}`
      : integerFormatted;

  const sign = isNegative ? '-' : '';
  if (locale === 'bn') {
    return `${sign}৳${toBengaliDigits(baseFormatted)}`;
  }
  return `${sign}৳${baseFormatted}`;
}

export function wrapInEmailLayout(options: EmailLayoutOptions): string {
  const storeName = escapeHtml(options.storeName || 'DigitalDepot');
  const supportEmail = escapeHtml(options.supportEmail || 'support@digitaldepot.local');
  const supportPhone = options.supportPhone ? escapeHtml(options.supportPhone) : null;
  const locale = options.locale || 'en';
  const year = new Date().getFullYear();
  const yearDisplay = locale === 'bn' ? toBengaliDigits(year) : year;

  const footerText =
    locale === 'bn'
      ? `<p>কোনো প্রশ্ন থাকলে অনুগ্রহ করে আমাদের সাথে যোগাযোগ করুন: <a href="mailto:${supportEmail}" style="color: #2563eb;">${supportEmail}</a>${
          supportPhone ? ` অথবা কল করুন: <strong>${supportPhone}</strong>` : ''
        }</p>
         <p>&copy; ${yearDisplay} ${storeName}. সর্বস্বত্ব সংরক্ষিত।</p>`
      : `<p>If you have any questions, reach out to us at <a href="mailto:${supportEmail}" style="color: #2563eb;">${supportEmail}</a>${
          supportPhone ? ` or call <strong>${supportPhone}</strong>` : ''
        }</p>
         <p>&copy; ${yearDisplay} ${storeName}. All rights reserved.</p>`;

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(options.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; -webkit-text-size-adjust: 100%; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 32px 16px; }
    .card { background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { font-size: 24px; font-weight: bold; color: #0f172a; margin-bottom: 24px; border-bottom: 2px solid #2563eb; padding-bottom: 12px; }
    .header a { text-decoration: none; color: #0f172a; }
    .content { font-size: 15px; line-height: 24px; color: #334155; }
    .badge { display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 600; border-radius: 4px; }
    .badge-blue { background-color: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .badge-green { background-color: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
    .badge-amber { background-color: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
    .badge-slate { background-color: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
    .badge-red { background-color: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { text-align: left; padding: 10px 12px; font-size: 13px; font-weight: 600; color: #475569; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    td { padding: 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .text-right { text-align: right; }
    .summary-table td { padding: 6px 12px; border: none; }
    .summary-table .total-row td { border-top: 1px solid #e2e8f0; font-size: 16px; font-weight: bold; color: #0f172a; padding-top: 12px; }
    .button-container { text-align: center; margin: 28px 0; }
    .button { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 15px; padding: 12px 28px; border-radius: 6px; }
    .footer { font-size: 13px; color: #64748b; line-height: 20px; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 32px; }
    .notes-box { background-color: #f8fafc; border-left: 3px solid #2563eb; padding: 12px 16px; margin: 16px 0; font-size: 14px; color: #475569; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <a href="https://digitaldepot.local">${storeName}</a>
      </div>
      <div class="content">
        ${options.bodyContent}
      </div>
      <div class="footer">
        ${footerText}
      </div>
    </div>
  </div>
</body>
</html>`;
}
