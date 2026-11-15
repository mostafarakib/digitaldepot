import { describe, it, expect } from 'vitest';
import { renderOrderConfirmedEmail } from '../templates/order-confirmed-email.js';
import { env } from '../../../config/env.js';

describe('Order Confirmed Email Template Tests', () => {
  const baseOrderData = {
    to: 'customer@example.com',
    customerName: 'Rahim Uddin',
    orderNumber: 'ORD-20261115-ABC123',
    orderId: 'cuid-order-123',
    orderDate: new Date('2026-11-15T12:00:00Z'),
    paymentMethod: 'COD' as const,
    paymentStatus: 'PENDING' as const,
    shippingRecipientName: 'Rahim Uddin',
    shippingPhone: '+8801712345678',
    shippingAddress: 'House 12, Road 4, Dhanmondi, Dhaka',
    items: [
      {
        productName: 'Mechanical Keyboard',
        variantTitle: 'Blue Switches / RGB',
        quantity: 1,
        unitPrice: 550000, // 5,500 BDT
        lineTotal: 550000,
      },
      {
        productName: 'Gaming Mouse',
        variantTitle: 'Wireless Black',
        quantity: 2,
        unitPrice: 200000, // 2,000 BDT
        lineTotal: 400000, // 4,000 BDT
      },
    ],
    merchandiseSubtotal: 950000, // 9,500 BDT
    discountAmount: 50000, // 500 BDT
    shippingFee: 6000, // 60 BDT
    totalPayable: 906000, // 9,060 BDT
    isInsideDhaka: true,
    estimatedDaysMin: 2,
    estimatedDaysMax: 3,
    storeName: 'DigitalDepot',
    supportEmail: 'support@digitaldepot.com',
  };

  it('renders English order confirmation email with dynamic delivery window and COD notice', () => {
    const rendered = renderOrderConfirmedEmail({
      ...baseOrderData,
      locale: 'en',
    });

    expect(rendered.subject).toBe('Order Confirmation #ORD-20261115-ABC123 - DigitalDepot');
    expect(rendered.text).toContain('Hello Rahim Uddin,');
    expect(rendered.text).toContain(
      'Thank you for your order! Your order has been successfully placed and confirmed.',
    );
    expect(rendered.text).toContain('Estimated Delivery: 2–3 business days');
    expect(rendered.text).toContain('Payment Method: Cash on Delivery (Pay upon delivery)');
    expect(rendered.text).toContain('Mechanical Keyboard (Blue Switches / RGB) x1 = ৳5,500');
    expect(rendered.text).toContain('Gaming Mouse (Wireless Black) x2 = ৳4,000');
    expect(rendered.text).toContain('Total Payable: ৳9,060');
    expect(rendered.text).toContain(`${env.FRONTEND_URL}/en/account/orders/cuid-order-123`);

    // HTML assertions
    expect(rendered.html).toContain('your order has been received and confirmed.');
    expect(rendered.html).toContain('ORD-20261115-ABC123');
    expect(rendered.html).toContain('2–3 business days');
    expect(rendered.html).toContain('Cash on Delivery (Pay upon delivery)');
    expect(rendered.html).toContain('Gaming Mouse');
  });

  it('renders Bangla order confirmation email with Bengali numerals and dynamic outside-Dhaka estimate', () => {
    const rendered = renderOrderConfirmedEmail({
      ...baseOrderData,
      isInsideDhaka: false,
      estimatedDaysMin: 3,
      estimatedDaysMax: 5,
      locale: 'bn',
      paymentMethod: 'SSLCOMMERZ',
      paymentStatus: 'PAID',
    });

    expect(rendered.subject).toBe('অর্ডার নিশ্চিতকরণ #ORD-20261115-ABC123 - DigitalDepot');
    expect(rendered.text).toContain('হ্যালো Rahim Uddin,');
    expect(rendered.text).toContain('আপনার অর্ডারটি সফলভাবে গৃহীত ও নিশ্চিত করা হয়েছে।');
    expect(rendered.text).toContain('সম্ভাব্য ডেলিভারি সময়: ৩–৫ কর্মদিবস');
    expect(rendered.text).toContain('পেমেন্ট মাধ্যম: অনলাইন পেমেন্ট (পরিশোধিত)');
    // Bengali digits in BDT formatting: 9,060 -> ৯,০৬০
    expect(rendered.text).toContain('সর্বমোট প্রদেয়: ৳৯,০৬০');
    expect(rendered.text).toContain(`${env.FRONTEND_URL}/bn/account/orders/cuid-order-123`);

    // HTML assertions
    expect(rendered.html).toContain('আপনার অর্ডারটি সফলভাবে গ্রহণ ও নিশ্চিত করা হয়েছে।');
    expect(rendered.html).toContain('৩–৫ কর্মদিবস');
    expect(rendered.html).toContain('অনলাইন পেমেন্ট (পরিশোধিত)');
  });

  it('safely escapes HTML special characters in customer input', () => {
    const rendered = renderOrderConfirmedEmail({
      ...baseOrderData,
      customerName: '<script>alert("xss")</script>',
      shippingAddress: 'House 1 & 2 <br>',
      items: [
        {
          productName: '<b>Bold Product</b>',
          variantTitle: 'Size "L" & Blue',
          quantity: 1,
          unitPrice: 10000,
          lineTotal: 10000,
        },
      ],
    });

    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(rendered.html).toContain('&lt;b&gt;Bold Product&lt;/b&gt;');
    expect(rendered.html).toContain('Size &quot;L&quot; &amp; Blue');
  });
});
