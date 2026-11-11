import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool } from '../../../test/setup.js';
import { env } from '../../../config/env.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { hashPassword } from '../../../lib/crypto.js';
import { categoryService } from '../../catalogue/category.service.js';
import { productService } from '../../catalogue/product.service.js';
import { variantService } from '../../catalogue/variant.service.js';
import { imageService } from '../../catalogue/image.service.js';

function extractCookie(headers: Record<string, unknown>, cookieName: string): string {
  const raw = headers['set-cookie'];
  const cookies = Array.isArray(raw) ? (raw as string[]) : [];
  const found = cookies.find((c) => c.startsWith(`${cookieName}=`));
  return found ? found.split(';')[0] : '';
}

describe('Phase 5C: Shipping Configuration & Cart Totals Engine', () => {
  let csrfToken: string;
  let csrfCookie: string;

  beforeEach(async () => {
    await cleanDatabase();
    csrfToken = generateCsrfToken();
    csrfCookie = `${COOKIE_NAMES.CSRF_TOKEN}=${csrfToken}`;
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPool.end();
  });

  async function createTestProduct(price = 100000, initialStock = 10) {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const category = await categoryService.create({
      name: 'Electronics',
      slug: `elec-${uniqueSuffix}`,
    });

    const product = await productService.create({
      name: `Test Product ${uniqueSuffix}`,
      summary: 'Product summary',
      description: 'Product description',
      categoryId: category.id,
      initialVariant: {
        sku: `SKU-${uniqueSuffix}`,
        price,
        initialStock,
      },
    });

    await imageService.add(product.id, {
      url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      altText: 'Sample Image',
      isPrimary: true,
    });

    await productService.publish(product.id);
    const variant = await variantService.getById(product.variants[0].id);
    return { product, variant };
  }

  async function createCustomerUser(email = 'customer-shipping@example.com') {
    const passwordHash = await hashPassword('CustomerPass123!');
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
        profile: {
          create: {
            firstName: 'Customer',
            lastName: 'User',
          },
        },
      },
    });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', env.FRONTEND_URL)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', csrfCookie)
      .send({ email, password: 'CustomerPass123!' });

    const customerCookie = extractCookie(loginRes.headers, COOKIE_NAMES.ACCESS_TOKEN);
    return { user, customerCookie };
  }

  describe('1. Shipping Calculations & District Classification', () => {
    it('calculates ৳60 (6,000 poisha) Inside Dhaka case-insensitively', async () => {
      const { variant } = await createTestProduct(100000, 10); // ৳1,000 (subtotal < ৳5,000)

      // Add item as guest
      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 1 });

      const guestCookie = extractCookie(addRes.headers, COOKIE_NAMES.GUEST_CART);

      // 1. Lowercase 'dhaka'
      const estimateRes1 = await request(app)
        .post('/api/v1/cart/shipping-estimate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ district: 'dhaka' });

      expect(estimateRes1.status).toBe(200);
      expect(estimateRes1.body.data.shipping.district).toBe('DHAKA');
      expect(estimateRes1.body.data.shipping.isInsideDhaka).toBe(true);
      expect(estimateRes1.body.data.shipping.standardFee).toBe(6000);
      expect(estimateRes1.body.data.shipping.shippingFee).toBe(6000);
      expect(estimateRes1.body.data.shipping.isFreeShipping).toBe(false);
      expect(estimateRes1.body.data.subtotal).toBe(100000);
      expect(estimateRes1.body.data.total).toBe(106000); // 100000 + 6000

      // 2. Mixed case 'Dhaka '
      const estimateRes2 = await request(app)
        .post('/api/v1/cart/shipping-estimate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ district: 'Dhaka ' });

      expect(estimateRes2.status).toBe(200);
      expect(estimateRes2.body.data.shipping.district).toBe('DHAKA');
      expect(estimateRes2.body.data.shipping.isInsideDhaka).toBe(true);
      expect(estimateRes2.body.data.shipping.shippingFee).toBe(6000);
    });

    it('calculates ৳120 (12,000 poisha) Outside Dhaka', async () => {
      const { variant } = await createTestProduct(100000, 10); // ৳1,000

      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 1 });

      const guestCookie = extractCookie(addRes.headers, COOKIE_NAMES.GUEST_CART);

      const estimateRes = await request(app)
        .post('/api/v1/cart/shipping-estimate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ district: 'CHATTOGRAM' });

      expect(estimateRes.status).toBe(200);
      expect(estimateRes.body.data.shipping.district).toBe('CHATTOGRAM');
      expect(estimateRes.body.data.shipping.isInsideDhaka).toBe(false);
      expect(estimateRes.body.data.shipping.standardFee).toBe(12000);
      expect(estimateRes.body.data.shipping.shippingFee).toBe(12000);
      expect(estimateRes.body.data.total).toBe(112000); // 100000 + 12000
    });

    it('rejects invalid Bangladesh district with 400 INVALID_DISTRICT', async () => {
      const { variant } = await createTestProduct(100000, 10);

      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 1 });

      const guestCookie = extractCookie(addRes.headers, COOKIE_NAMES.GUEST_CART);

      const estimateRes = await request(app)
        .post('/api/v1/cart/shipping-estimate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ district: 'NON_EXISTENT_DISTRICT' });

      expect(estimateRes.status).toBe(400);
      expect(estimateRes.body.error.code).toBe('INVALID_DISTRICT');
    });

    it('clears shipping estimate cleanly via DELETE /api/v1/cart/shipping-estimate', async () => {
      const { variant } = await createTestProduct(100000, 10);

      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 1 });

      const guestCookie = extractCookie(addRes.headers, COOKIE_NAMES.GUEST_CART);

      // Estimate
      await request(app)
        .post('/api/v1/cart/shipping-estimate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ district: 'DHAKA' });

      // Clear
      const clearRes = await request(app)
        .delete('/api/v1/cart/shipping-estimate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`);

      expect(clearRes.status).toBe(200);
      expect(clearRes.body.data.shipping.district).toBeNull();
      expect(clearRes.body.data.shipping.isEstimated).toBe(false);
      expect(clearRes.body.data.shipping.shippingFee).toBe(0);
      expect(clearRes.body.data.total).toBe(100000);
    });
  });

  describe('2. Free Shipping Threshold & Pre-Coupon Precedence', () => {
    it('qualifies for free shipping when subtotal >= ৳5,000 (500,000 poisha) nationwide', async () => {
      const { variant } = await createTestProduct(250000, 10); // ৳2,500 each

      // Add 2 items (subtotal = ৳5,000 = 500000 poisha)
      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 2 });

      const guestCookie = extractCookie(addRes.headers, COOKIE_NAMES.GUEST_CART);

      // Test Outside Dhaka: fee must be 0 because subtotal >= ৳5,000
      const estimateRes = await request(app)
        .post('/api/v1/cart/shipping-estimate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ district: 'SYLHET' });

      expect(estimateRes.status).toBe(200);
      const shipping = estimateRes.body.data.shipping;
      expect(shipping.isFreeShipping).toBe(true);
      expect(shipping.shippingFee).toBe(0);
      expect(shipping.standardFee).toBe(12000); // Standard was ৳120
      expect(shipping.amountNeededForFreeShipping).toBe(0);
      expect(shipping.freeShippingProgressPercent).toBe(100);
      expect(estimateRes.body.data.total).toBe(500000); // 500000 + 0
    });

    it('determines free shipping on merchandise subtotal BEFORE coupon discount', async () => {
      // Subtotal = ৳5,000 (500000 poisha). Free threshold = ৳5,000.
      // Coupon: ৳500 off (50000 poisha).
      // Merchandise payable = ৳4,500 (450000 poisha).
      // Rule: Free shipping still applies because subtotal (500000) >= threshold (500000).
      const { variant } = await createTestProduct(500000, 10); // ৳5,000
      const now = new Date();

      await prisma.coupon.create({
        data: {
          code: 'DISCOUNT500',
          discountType: 'FIXED_AMOUNT',
          discountValue: 50000, // ৳500
          startDate: new Date(now.getTime() - 60000),
          endDate: new Date(now.getTime() + 86400000),
        },
      });

      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 1 });

      const guestCookie = extractCookie(addRes.headers, COOKIE_NAMES.GUEST_CART);

      // Estimate outside Dhaka (standard ৳120)
      await request(app)
        .post('/api/v1/cart/shipping-estimate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ district: 'RAJSHAHI' });

      // Apply coupon
      const applyRes = await request(app)
        .post('/api/v1/cart/coupon')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ code: 'DISCOUNT500' });

      expect(applyRes.status).toBe(200);
      const cart = applyRes.body.data;
      expect(cart.subtotal).toBe(500000); // ৳5,000 merchandise subtotal
      expect(cart.discount).toBe(50000); // ৳500 coupon discount
      expect(cart.shipping.isFreeShipping).toBe(true); // Free shipping maintained!
      expect(cart.shipping.shippingFee).toBe(0);
      // Total = (500000 - 50000) + 0 = 450000
      expect(cart.total).toBe(450000);
    });

    it('revalidates shipping dynamically when line item quantity drops subtotal below free shipping threshold', async () => {
      const { variant } = await createTestProduct(300000, 10); // ৳3,000 per unit

      // Add 2 units (subtotal = ৳6,000 > ৳5,000)
      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 2 });

      const guestCookie = extractCookie(addRes.headers, COOKIE_NAMES.GUEST_CART);
      const itemId = addRes.body.data.items[0].id;

      // Estimate Inside Dhaka
      const estRes = await request(app)
        .post('/api/v1/cart/shipping-estimate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ district: 'DHAKA' });

      expect(estRes.body.data.shipping.isFreeShipping).toBe(true);
      expect(estRes.body.data.shipping.shippingFee).toBe(0);
      expect(estRes.body.data.total).toBe(600000);

      // Reduce quantity from 2 to 1 (subtotal becomes ৳3,000 < ৳5,000)
      const updateRes = await request(app)
        .patch(`/api/v1/cart/items/${itemId}`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ quantity: 1 });

      expect(updateRes.status).toBe(200);
      const updatedCart = updateRes.body.data;
      expect(updatedCart.subtotal).toBe(300000);
      // Shipping dynamically flips from free to standard Inside Dhaka fee (৳60)
      expect(updatedCart.shipping.isFreeShipping).toBe(false);
      expect(updatedCart.shipping.shippingFee).toBe(6000);
      expect(updatedCart.shipping.amountNeededForFreeShipping).toBe(200000); // ৳2,000 needed
      expect(updatedCart.total).toBe(306000); // 300000 + 6000
    });
  });

  describe('3. Saved Address Resolution & Default Address Fallback', () => {
    it('resolves district from customer saved address ID and persists district ID to cart', async () => {
      const { user, customerCookie } = await createCustomerUser('saved-addr@example.com');
      const { variant } = await createTestProduct(100000, 10);

      // Create a saved address in Chattogram
      const address = await prisma.address.create({
        data: {
          userId: user.id,
          recipientName: 'Test Recipient',
          phone: '+8801712345678',
          divisionId: 'CHATTOGRAM',
          districtId: 'CHATTOGRAM',
          upazila: 'Pahartali',
          streetAddress: '123 Station Road',
          isDefault: true,
        },
      });

      // Customer adds item to cart
      await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ variantId: variant.id, quantity: 1 });

      // Customer provides addressId to shipping estimation
      const estRes = await request(app)
        .post('/api/v1/cart/shipping-estimate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: address.id });

      expect(estRes.status).toBe(200);
      expect(estRes.body.data.shipping.district).toBe('CHATTOGRAM');
      expect(estRes.body.data.shipping.isInsideDhaka).toBe(false);
      expect(estRes.body.data.shipping.shippingFee).toBe(12000);

      // Verify database stored the resolved districtId, not the address ID
      const cartInDb = await prisma.cart.findUnique({ where: { userId: user.id } });
      expect(cartInDb?.estimatedDistrict).toBe('CHATTOGRAM');
    });

    it('rejects saved address selection from guest users with 400 AUTHENTICATION_REQUIRED', async () => {
      const { variant } = await createTestProduct(100000, 10);

      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 1 });

      const guestCookie = extractCookie(addRes.headers, COOKIE_NAMES.GUEST_CART);

      const estRes = await request(app)
        .post('/api/v1/cart/shipping-estimate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ addressId: 'some-addr-id' });

      expect(estRes.status).toBe(400);
      expect(estRes.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('automatically falls back to default saved address district when cart has no explicit estimate', async () => {
      const { user, customerCookie } = await createCustomerUser('default-fallback@example.com');
      const { variant } = await createTestProduct(100000, 10);

      // Customer has default address in DHAKA
      await prisma.address.create({
        data: {
          userId: user.id,
          recipientName: 'Dhaka Recipient',
          phone: '+8801712345678',
          divisionId: 'DHAKA',
          districtId: 'DHAKA',
          upazila: 'Dhanmondi',
          streetAddress: 'Road 27',
          isDefault: true,
        },
      });

      // Customer adds item to cart without setting shipping estimate
      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ variantId: variant.id, quantity: 1 });

      expect(addRes.status).toBe(200);
      // Automatically fell back to DHAKA
      expect(addRes.body.data.shipping.district).toBe('DHAKA');
      expect(addRes.body.data.shipping.isInsideDhaka).toBe(true);
      expect(addRes.body.data.shipping.shippingFee).toBe(6000);
      expect(addRes.body.data.total).toBe(106000);
    });
  });

  describe('4. Cart Merging District Resolution (Clarification #2)', () => {
    it('preserves customer existing district estimate during merge, otherwise transfers guest estimate', async () => {
      const { user, customerCookie } = await createCustomerUser('merge-district@example.com');
      const { variant } = await createTestProduct(100000, 10);

      // 1. Guest creates cart with district 'CHATTOGRAM'
      const guestAdd = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 1 });

      const guestCookie = extractCookie(guestAdd.headers, COOKIE_NAMES.GUEST_CART);

      await request(app)
        .post('/api/v1/cart/shipping-estimate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ district: 'CHATTOGRAM' });

      // Customer cart has NO district estimate yet
      // Merge guest cart into customer cart
      const mergeRes = await request(app)
        .post('/api/v1/cart/merge')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}; ${guestCookie}`);

      expect(mergeRes.status).toBe(200);
      // Guest estimate 'CHATTOGRAM' transferred to customer cart
      expect(mergeRes.body.data.shipping.district).toBe('CHATTOGRAM');
      expect(mergeRes.body.data.shipping.shippingFee).toBe(12000);

      const customerCartInDb = await prisma.cart.findUnique({ where: { userId: user.id } });
      expect(customerCartInDb?.estimatedDistrict).toBe('CHATTOGRAM');
    });

    it('preserves customer existing estimate when customer cart already had a district', async () => {
      const { customerCookie } = await createCustomerUser('cust-preserve@example.com');
      const { variant } = await createTestProduct(100000, 10);

      // Customer already has cart with district 'DHAKA'
      await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ variantId: variant.id, quantity: 1 });

      await request(app)
        .post('/api/v1/cart/shipping-estimate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ district: 'DHAKA' });

      // Guest creates cart with district 'SYLHET'
      const guestAdd = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 1 });

      const guestCookie = extractCookie(guestAdd.headers, COOKIE_NAMES.GUEST_CART);

      await request(app)
        .post('/api/v1/cart/shipping-estimate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ district: 'SYLHET' });

      // Merge: Customer's 'DHAKA' must be preserved!
      const mergeRes = await request(app)
        .post('/api/v1/cart/merge')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}; ${guestCookie}`);

      expect(mergeRes.status).toBe(200);
      expect(mergeRes.body.data.shipping.district).toBe('DHAKA');
      expect(mergeRes.body.data.shipping.shippingFee).toBe(6000);
    });
  });

  describe('5. Non-Commitment Invariant', () => {
    it('creates zero order records and does NOT reserve inventory during shipping estimation', async () => {
      const { variant } = await createTestProduct(100000, 10);

      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 2 });

      const guestCookie = extractCookie(addRes.headers, COOKIE_NAMES.GUEST_CART);

      await request(app)
        .post('/api/v1/cart/shipping-estimate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ district: 'DHAKA' });

      // Check inventoryItem reservedQuantity remains 0
      const invItem = await prisma.inventoryItem.findUnique({
        where: { variantId: variant.id },
      });
      expect(invItem?.quantity).toBe(10);
      expect(invItem?.reservedQuantity).toBe(0);
    });
  });
});
