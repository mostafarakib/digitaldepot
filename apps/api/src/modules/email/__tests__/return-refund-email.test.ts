import { describe, it, expect } from 'vitest';
import { renderReturnStatusEmail } from '../templates/return-status-email.js';
import { renderRefundProcessedEmail } from '../templates/refund-processed-email.js';
import { env } from '../../../config/env.js';

describe('Return & Refund Email Template Tests', () => {
  describe('renderReturnStatusEmail', () => {
    const baseReturn = {
      to: 'customer@example.com',
      customerName: 'Karim Ahmed',
      returnNumber: 'RET-20261115-ABC111',
      orderNumber: 'ORD-20261115-XYZ222',
      returnId: 'cuid-ret-111',
      orderId: 'cuid-ord-222',
      items: [
        {
          productName: 'USB-C Cable',
          variantTitle: '2 Meter / Braided',
          quantity: 2,
        },
      ],
      storeName: 'DigitalDepot',
      supportEmail: 'support@digitaldepot.com',
    };

    it('renders APPROVED return email in English and Bangla', () => {
      const en = renderReturnStatusEmail({
        ...baseReturn,
        status: 'APPROVED',
        locale: 'en',
      });
      expect(en.subject).toBe('Return Request #RET-20261115-ABC111 Approved');
      expect(en.text).toContain('Your return request has been reviewed and approved by our team.');
      expect(en.text).toContain(`${env.FRONTEND_URL}/en/account/returns/cuid-ret-111`);

      const bn = renderReturnStatusEmail({
        ...baseReturn,
        status: 'APPROVED',
        locale: 'bn',
      });
      expect(bn.subject).toBe('রিটার্ন আবেদন #RET-20261115-ABC111 অনুমোদিত হয়েছে');
      expect(bn.text).toContain('আপনার রিটার্ন আবেদনটি পর্যালোচনা করে অনুমোদন দেওয়া হয়েছে।');
      expect(bn.text).toContain(`${env.FRONTEND_URL}/bn/account/returns/cuid-ret-111`);
    });

    it('renders REJECTED return email with reason in English and Bangla', () => {
      const en = renderReturnStatusEmail({
        ...baseReturn,
        status: 'REJECTED',
        reason: 'Item passed return window of 7 days',
        locale: 'en',
      });
      expect(en.subject).toBe('Return Request #RET-20261115-ABC111 Rejected');
      expect(en.text).toContain('Your return request has been reviewed and rejected.');
      expect(en.text).toContain('Reason: Item passed return window of 7 days');

      const bn = renderReturnStatusEmail({
        ...baseReturn,
        status: 'REJECTED',
        reason: '৭ দিনের রিটার্ন সময়সীমা অতিক্রান্ত হয়েছে',
        locale: 'bn',
      });
      expect(bn.subject).toBe('রিটার্ন আবেদন #RET-20261115-ABC111 প্রত্যাখ্যাত হয়েছে');
      expect(bn.text).toContain('আপনার রিটার্ন আবেদনটি পর্যালোচনা শেষে প্রত্যাখ্যাত হয়েছে।');
      expect(bn.text).toContain('কারণ: ৭ দিনের রিটার্ন সময়সীমা অতিক্রান্ত হয়েছে');
    });
  });

  describe('renderRefundProcessedEmail', () => {
    const baseRefund = {
      to: 'customer@example.com',
      customerName: 'Shakil Khan',
      refundNumber: 'REF-20261115-R999',
      returnNumber: 'RET-20261115-R888',
      orderNumber: 'ORD-20261115-O777',
      orderId: 'cuid-ord-777',
      refundId: 'cuid-ref-999',
      amount: 156000, // 1,560.00 BDT
      merchandiseAmount: 150000, // 1,500.00 BDT
      shippingAmount: 6000, // 60.00 BDT
      method: 'SSLCOMMERZ' as const,
      processedDate: new Date('2026-11-15T14:30:00Z'),
      storeName: 'DigitalDepot',
      supportEmail: 'support@digitaldepot.com',
    };

    it('renders SSLCommerz refund notice without promising fixed settlement guarantees (Clarification 6)', () => {
      const en = renderRefundProcessedEmail({
        ...baseRefund,
        locale: 'en',
      });

      expect(en.subject).toBe('Refund Processed #REF-20261115-R999 - ৳1,560');
      expect(en.text).toContain(
        'Your refund for Return #RET-20261115-R888 (Order #ORD-20261115-O777) has been successfully processed.',
      );
      expect(en.text).toContain('Total Refunded: ৳1,560');
      expect(en.text).toContain('Merchandise Refund: ৳1,500');
      expect(en.text).toContain('Shipping Fee Refund: ৳60');
      // Neutral settlement wording without false timeline promises
      expect(en.text).toContain(
        'Depending on your payment method and card issuer or mobile financial service provider',
      );
      expect(en.text).not.toContain('guaranteed within 24 hours');
      expect(en.text).toContain(`${env.FRONTEND_URL}/en/account/orders/cuid-ord-777`);
    });

    it('renders manual cash / COD refund in Bangla', () => {
      const bn = renderRefundProcessedEmail({
        ...baseRefund,
        method: 'MANUAL_CASH',
        locale: 'bn',
      });

      expect(bn.subject).toBe('রিফান্ড সম্পন্ন #REF-20261115-R999 - ৳১,৫৬০');
      expect(bn.text).toContain(
        'আপনার রিটার্ন #RET-20261115-R888 (অর্ডার #ORD-20261115-O777) এর রিফান্ড সফলভাবে সম্পন্ন হয়েছে।',
      );
      expect(bn.text).toContain('মোট রিফান্ডকৃত অর্থ: ৳১,৫৬০');
      expect(bn.text).toContain('পণ্য রিফান্ড: ৳১,৫০০');
      expect(bn.text).toContain('ডেলিভারি চার্জ রিফান্ড: ৳৬০');
      expect(bn.text).toContain('নগদ বা ম্যানুয়াল রিফান্ড নিষ্পত্তি সম্পন্ন হয়েছে।');
      expect(bn.text).toContain(`${env.FRONTEND_URL}/bn/account/orders/cuid-ord-777`);
    });
  });
});
