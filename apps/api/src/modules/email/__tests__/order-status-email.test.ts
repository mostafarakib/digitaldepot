import { describe, it, expect } from 'vitest';
import { renderOrderStatusEmail } from '../templates/order-status-email.js';
import { env } from '../../../config/env.js';

describe('Order Status Email Template Tests', () => {
  const baseData = {
    to: 'customer@example.com',
    customerName: 'Fatima Begum',
    orderNumber: 'ORD-20261115-XYZ789',
    orderId: 'cuid-order-456',
    items: [
      {
        productName: 'Wireless Earbuds',
        variantTitle: 'White',
        quantity: 1,
        unitPrice: 320000,
        lineTotal: 320000,
      },
    ],
    totalPayable: 326000,
    storeName: 'DigitalDepot',
    supportEmail: 'support@digitaldepot.com',
  };

  it('renders PROCESSING status in English and Bangla', () => {
    const en = renderOrderStatusEmail({
      ...baseData,
      status: 'PROCESSING',
      locale: 'en',
    });
    expect(en.subject).toBe('Order #ORD-20261115-XYZ789 Update: Processing');
    expect(en.text).toContain(
      'Your order has been confirmed and is now being picked, tested, and packaged for dispatch.',
    );
    expect(en.text).toContain(`${env.FRONTEND_URL}/en/account/orders/cuid-order-456`);

    const bn = renderOrderStatusEmail({
      ...baseData,
      status: 'PROCESSING',
      locale: 'bn',
    });
    expect(bn.subject).toBe('অর্ডার #ORD-20261115-XYZ789 এর স্ট্যাটাস আপডেট: প্রক্রিয়াকরণ চলছে');
    expect(bn.text).toContain(
      'আপনার অর্ডারটি প্রস্তুত করা হচ্ছে এবং খুব শীঘ্রই কুরিয়ারে হস্তান্তর করা হবে।',
    );
    expect(bn.text).toContain(`${env.FRONTEND_URL}/bn/account/orders/cuid-order-456`);
  });

  it('renders SHIPPED status with delivery notice', () => {
    const en = renderOrderStatusEmail({
      ...baseData,
      status: 'SHIPPED',
      locale: 'en',
    });
    expect(en.subject).toBe('Order #ORD-20261115-XYZ789 Update: Shipped / In Transit');
    expect(en.text).toContain(
      'Great news! Your package is on its way to your delivery address with our courier partner.',
    );

    const bn = renderOrderStatusEmail({
      ...baseData,
      status: 'SHIPPED',
      locale: 'bn',
    });
    expect(bn.subject).toBe(
      'অর্ডার #ORD-20261115-XYZ789 এর স্ট্যাটাস আপডেট: ডেলিভারির জন্য প্রেরিত',
    );
    expect(bn.text).toContain(
      'আপনার পার্সেলটি আমাদের ডেলিভারি পার্টনারের কাছে হস্তান্তর করা হয়েছে',
    );
  });

  it('renders DELIVERED status with satisfaction notice', () => {
    const en = renderOrderStatusEmail({
      ...baseData,
      status: 'DELIVERED',
      locale: 'en',
    });
    expect(en.subject).toBe('Order #ORD-20261115-XYZ789 Update: Delivered');
    expect(en.text).toContain(
      'Your order has been delivered. We hope you enjoy your purchase! You have 7 days to request a return if needed.',
    );

    const bn = renderOrderStatusEmail({
      ...baseData,
      status: 'DELIVERED',
      locale: 'bn',
    });
    expect(bn.subject).toBe('অর্ডার #ORD-20261115-XYZ789 এর স্ট্যাটাস আপডেট: ডেলিভারি সম্পন্ন');
    expect(bn.text).toContain(
      'আপনার অর্ডারটি সফলভাবে ডেলিভারি করা হয়েছে। যেকোনো প্রয়োজনে ৭ দিনের মধ্যে রিটার্ন আবেদন করতে পারবেন।',
    );
  });

  it('renders CANCELLED status with reason if provided', () => {
    const en = renderOrderStatusEmail({
      ...baseData,
      status: 'CANCELLED',
      reason: 'Requested by customer due to address change',
      locale: 'en',
    });
    expect(en.subject).toBe('Order #ORD-20261115-XYZ789 Update: Cancelled');
    expect(en.text).toContain('Reason: Requested by customer due to address change');

    const bn = renderOrderStatusEmail({
      ...baseData,
      status: 'CANCELLED',
      reason: 'গ্রাহকের অনুরোধে বাতিল',
      locale: 'bn',
    });
    expect(bn.subject).toBe('অর্ডার #ORD-20261115-XYZ789 এর স্ট্যাটাস আপডেট: বাতিল করা হয়েছে');
    expect(bn.text).toContain('কারণ: গ্রাহকের অনুরোধে বাতিল');
  });
});
