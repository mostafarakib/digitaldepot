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
import { couponService } from '../coupon.service.js';

function extractCookie(headers: Record<string, unknown>, cookieName: string): string {
  const raw = headers['set-cookie'];
  const cookies = Array.isArray(raw) ? (raw as string[]) : [];
  const found = cookies.find((c) => c.startsWith(`${cookieName}=`));
  return found ? found.split(';')[0] : '';
}

describe('Phase 5B: Coupon Management & Storefront Validation', () => {
  let csrfToken: string;
  let csrfCookie: string;
  let adminCookie: string;
  let adminUser: { id: string; email: string };

  beforeEach(async () => {
    await cleanDatabase();
    csrfToken = generateCsrfToken();
    csrfCookie = `${COOKIE_NAMES.CSRF_TOKEN}=${csrfToken}`;

    // Create admin user for admin endpoints
    const passwordHash = await hashPassword('AdminPass123!');
    adminUser = await prisma.user.create({
      data: {
        email: 'admin-coupon@example.com',
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        profile: {
          create: {
            firstName: 'Admin',
            lastName: 'User',
            phone: '+8801700000000',
          },
        },
      },
    });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', env.FRONTEND_URL)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', csrfCookie)
      .send({ email: 'admin-coupon@example.com', password: 'AdminPass123!' });

    const cookies = loginRes.headers['set-cookie'] as unknown as string[];
    const sessionCookie = cookies?.find((c) => c.startsWith(`${COOKIE_NAMES.ACCESS_TOKEN}=`));
    adminCookie = sessionCookie ? sessionCookie.split(';')[0] : '';
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

  async function createCustomerUser(email = 'customer@example.com') {
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

    const cookies = loginRes.headers['set-cookie'] as unknown as string[];
    const sessionCookie = cookies?.find((c) => c.startsWith(`${COOKIE_NAMES.ACCESS_TOKEN}=`));
    const customerCookie = sessionCookie ? sessionCookie.split(';')[0] : '';

    return { user, customerCookie };
  }

  describe('1. Admin Coupon CRUD & Effective Configuration Validation', () => {
    it('creates a percentage coupon with max discount cap and valid dates', async () => {
      const now = new Date();
      const startDate = new Date(now.getTime() - 60000).toISOString();
      const endDate = new Date(now.getTime() + 86400000 * 7).toISOString();

      const res = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({
          code: 'promo10',
          description: '10% off storewide',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          maxDiscountAmount: 50000, // ৳500 max cap
          minOrderAmount: 200000, // ৳2,000 min order
          startDate,
          endDate,
          usageLimit: 100,
          perCustomerLimit: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('PROMO10'); // Normalized uppercase
      expect(res.body.data.discountValue).toBe(10);
      expect(res.body.data.maxDiscountAmount).toBe(50000);
    });

    it('rejects percentage coupon with discount value exceeding 100', async () => {
      const now = new Date();
      const res = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({
          code: 'INVALID150',
          discountType: 'PERCENTAGE',
          discountValue: 150,
          startDate: now.toISOString(),
          endDate: new Date(now.getTime() + 86400000).toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects maxDiscountAmount on FIXED_AMOUNT coupon', async () => {
      const now = new Date();
      const res = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({
          code: 'FLAT500',
          discountType: 'FIXED_AMOUNT',
          discountValue: 50000,
          maxDiscountAmount: 100000, // invalid for FIXED_AMOUNT
          startDate: now.toISOString(),
          endDate: new Date(now.getTime() + 86400000).toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects duplicate coupon code case-insensitively', async () => {
      const now = new Date();
      await request(app)
        .post('/api/v1/admin/coupons')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({
          code: 'DUPLICATE',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          startDate: now.toISOString(),
          endDate: new Date(now.getTime() + 86400000).toISOString(),
        });

      const res = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({
          code: 'duplicate',
          discountType: 'FIXED_AMOUNT',
          discountValue: 10000,
          startDate: now.toISOString(),
          endDate: new Date(now.getTime() + 86400000).toISOString(),
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('COUPON_CODE_EXISTS');
    });

    it('enforces merged effective configuration validation on partial update (Clarification #2)', async () => {
      const now = new Date();
      const createRes = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({
          code: 'CONFIG-TEST',
          discountType: 'PERCENTAGE',
          discountValue: 20,
          startDate: now.toISOString(),
          endDate: new Date(now.getTime() + 86400000 * 5).toISOString(),
        });

      const couponId = createRes.body.data.id;

      // 1. Partial update setting discountValue to 150 on existing PERCENTAGE coupon must fail
      const updateValueRes = await request(app)
        .patch(`/api/v1/admin/coupons/${couponId}`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({ discountValue: 150 });

      expect(updateValueRes.status).toBe(400);
      expect(updateValueRes.body.error.code).toBe('INVALID_DISCOUNT_VALUE');

      // 2. Partial update changing endDate to before existing startDate must fail
      const updateDateRes = await request(app)
        .patch(`/api/v1/admin/coupons/${couponId}`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({ endDate: new Date(now.getTime() - 86400000).toISOString() });

      expect(updateDateRes.status).toBe(400);
      expect(updateDateRes.body.error.code).toBe('INVALID_DATE_RANGE');

      // 3. Valid partial update succeeds
      const validUpdate = await request(app)
        .patch(`/api/v1/admin/coupons/${couponId}`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({ discountValue: 25, description: 'Updated discount' });

      expect(validUpdate.status).toBe(200);
      expect(validUpdate.body.data.discountValue).toBe(25);
      expect(validUpdate.body.data.description).toBe('Updated discount');
    });

    it('safeguards coupon deletion: allows deleting unused coupon but rejects when usage history exists', async () => {
      const now = new Date();
      const createRes = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({
          code: 'UNUSED-DEL',
          discountType: 'FIXED_AMOUNT',
          discountValue: 10000,
          startDate: now.toISOString(),
          endDate: new Date(now.getTime() + 86400000).toISOString(),
        });

      const couponId = createRes.body.data.id;

      // 1. Unused coupon deletes cleanly
      const delRes = await request(app)
        .delete(`/api/v1/admin/coupons/${couponId}`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // 2. Create coupon with usage record
      const usedCoupon = await prisma.coupon.create({
        data: {
          code: 'USED-COUPON',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          startDate: now,
          endDate: new Date(now.getTime() + 86400000),
          usageCount: 1,
          usages: {
            create: {
              userId: adminUser.id,
            },
          },
        },
      });

      const delUsedRes = await request(app)
        .delete(`/api/v1/admin/coupons/${usedCoupon.id}`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`);

      expect(delUsedRes.status).toBe(409);
      expect(delUsedRes.body.error.code).toBe('COUPON_HAS_USAGE_HISTORY');
    });
  });

  describe('2. Storefront Cart Coupon Application & Integer Poisha Calculations', () => {
    it('applies a percentage coupon, calculates capped discount, and does NOT consume usage', async () => {
      const { variant } = await createTestProduct(500000, 10); // ৳5,000 per item
      const now = new Date();

      // Create coupon: 20% off with max discount ৳500 (50000 poisha)
      const coupon = await prisma.coupon.create({
        data: {
          code: 'SAVE20',
          discountType: 'PERCENTAGE',
          discountValue: 20,
          maxDiscountAmount: 50000, // ৳500 cap
          minOrderAmount: 200000, // ৳2,000 min order
          startDate: new Date(now.getTime() - 60000),
          endDate: new Date(now.getTime() + 86400000),
          usageLimit: 10,
          usageCount: 0,
        },
      });

      // 1. Add 1 item to cart (subtotal = ৳5,000 = 500000 poisha)
      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 1 });

      const guestCookie = extractCookie(addRes.headers, COOKIE_NAMES.GUEST_CART);

      // 2. Apply coupon
      const applyRes = await request(app)
        .post('/api/v1/cart/coupon')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ code: 'save20' }); // lower case input gets normalized

      expect(applyRes.status).toBe(200);
      expect(applyRes.body.success).toBe(true);

      const cartData = applyRes.body.data;
      expect(cartData.subtotal).toBe(500000); // ৳5,000
      expect(cartData.discount).toBe(50000); // 20% of ৳5,000 is ৳1,000, but capped at ৳500 (50000 poisha)
      expect(cartData.total).toBe(450000); // ৳4,500
      expect(cartData.coupon).toBeDefined();
      expect(cartData.coupon.code).toBe('SAVE20');
      expect(cartData.coupon.discountAmount).toBe(50000);

      // Invariant: Non-consumption verification
      const couponInDb = await prisma.coupon.findUnique({ where: { id: coupon.id } });
      expect(couponInDb?.usageCount).toBe(0);
      const usageRecords = await prisma.couponUsage.count({ where: { couponId: coupon.id } });
      expect(usageRecords).toBe(0);
    });

    it('calculates percentage discount using Math.round and correctly resolves fractional poisha where Math.round differs from Math.floor', async () => {
      // Subtotal = 12,550 poisha (৳125.50). Discount = 15%.
      // (12550 * 15) / 100 = 1882.5 poisha.
      // Math.floor(1882.5) = 1882.
      // Math.round(1882.5) = 1883.
      const { variant } = await createTestProduct(12550, 10);
      const now = new Date();

      await prisma.coupon.create({
        data: {
          code: 'ROUND15',
          discountType: 'PERCENTAGE',
          discountValue: 15,
          startDate: new Date(now.getTime() - 60000),
          endDate: new Date(now.getTime() + 86400000),
        },
      });

      // Unit service level verification
      const directResult = await couponService.validateCouponEligibility('ROUND15', 12550);
      expect(directResult.discount).toBe(1883);
      expect(directResult.discount).not.toBe(Math.floor((12550 * 15) / 100));

      // End-to-end cart API verification
      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 1 });

      const guestCookie = extractCookie(addRes.headers, COOKIE_NAMES.GUEST_CART);

      const applyRes = await request(app)
        .post('/api/v1/cart/coupon')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ code: 'ROUND15' });

      expect(applyRes.status).toBe(200);
      const cartData = applyRes.body.data;
      expect(cartData.subtotal).toBe(12550);
      // Explicitly check that discount is 1883 (Math.round) and NOT 1882 (Math.floor)
      expect(cartData.discount).toBe(1883);
      expect(cartData.discount).not.toBe(1882);
      expect(cartData.total).toBe(10667);
      expect(cartData.total).not.toBe(10668);
    });

    it('rejects coupon when global usageLimit is exhausted for both guest and authenticated carts without consuming usage', async () => {
      const { variant } = await createTestProduct(100000, 10); // ৳1,000 item
      const now = new Date();

      const coupon = await prisma.coupon.create({
        data: {
          code: 'EXHAUSTED',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          usageLimit: 5,
          usageCount: 5, // Exhausted: usageCount >= usageLimit
          startDate: new Date(now.getTime() - 60000),
          endDate: new Date(now.getTime() + 86400000),
        },
      });

      // 1. Guest cart attempt
      const guestAdd = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 1 });

      const guestCookie = extractCookie(guestAdd.headers, COOKIE_NAMES.GUEST_CART);

      const guestApply = await request(app)
        .post('/api/v1/cart/coupon')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ code: 'EXHAUSTED' });

      expect(guestApply.status).toBe(400);
      expect(guestApply.body.error.code).toBe('COUPON_LIMIT_REACHED');

      // 2. Authenticated cart attempt
      const { customerCookie } = await createCustomerUser('auth-exhausted@example.com');

      await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ variantId: variant.id, quantity: 1 });

      const authApply = await request(app)
        .post('/api/v1/cart/coupon')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ code: 'EXHAUSTED' });

      expect(authApply.status).toBe(400);
      expect(authApply.body.error.code).toBe('COUPON_LIMIT_REACHED');

      // 3. Invariant: Non-consumption verification
      // usageCount must NOT be incremented, and no CouponUsage record created
      const couponInDb = await prisma.coupon.findUnique({ where: { id: coupon.id } });
      expect(couponInDb?.usageCount).toBe(5);
      const usageCountInDb = await prisma.couponUsage.count({ where: { couponId: coupon.id } });
      expect(usageCountInDb).toBe(0);
    });

    it('auto-detaches coupon on subsequent cart fetch when global usageLimit is exhausted in database', async () => {
      const { variant } = await createTestProduct(100000, 10);
      const now = new Date();

      const coupon = await prisma.coupon.create({
        data: {
          code: 'WILL-EXHAUST',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          usageLimit: 1,
          usageCount: 0,
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

      // Successfully apply coupon
      const applyRes = await request(app)
        .post('/api/v1/cart/coupon')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ code: 'WILL-EXHAUST' });

      expect(applyRes.status).toBe(200);
      expect(applyRes.body.data.coupon).toBeDefined();

      // Simulate coupon becoming exhausted in database by another completed order
      await prisma.coupon.update({
        where: { id: coupon.id },
        data: { usageCount: 1 },
      });

      // Subsequent read of the cart
      const getRes = await request(app)
        .get('/api/v1/cart')
        .set('Cookie', `${csrfCookie}; ${guestCookie}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.coupon).toBeNull();
      expect(getRes.body.data.discount).toBe(0);
      expect(getRes.body.data.total).toBe(100000);
      expect(getRes.body.data.couponNotice).toBe(
        'This coupon has reached its maximum usage limit.',
      );

      // Verify non-consumption invariant
      const couponInDb = await prisma.coupon.findUnique({ where: { id: coupon.id } });
      expect(couponInDb?.usageCount).toBe(1);
      const usageCountInDb = await prisma.couponUsage.count({ where: { couponId: coupon.id } });
      expect(usageCountInDb).toBe(0);
    });

    it('applies a fixed amount coupon and caps discount to subtotal (never negative)', async () => {
      const { variant } = await createTestProduct(30000, 10); // ৳300 item
      const now = new Date();

      // Flat ৳500 discount (50000 poisha)
      await prisma.coupon.create({
        data: {
          code: 'FLAT500',
          discountType: 'FIXED_AMOUNT',
          discountValue: 50000,
          startDate: new Date(now.getTime() - 60000),
          endDate: new Date(now.getTime() + 86400000),
        },
      });

      // Add 1 item of ৳300
      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 1 });

      const guestCookie = extractCookie(addRes.headers, COOKIE_NAMES.GUEST_CART);

      // Apply coupon: discount must not exceed ৳300, total must be 0 (not negative)
      const applyRes = await request(app)
        .post('/api/v1/cart/coupon')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ code: 'FLAT500' });

      expect(applyRes.status).toBe(200);
      expect(applyRes.body.data.subtotal).toBe(30000);
      expect(applyRes.body.data.discount).toBe(30000);
      expect(applyRes.body.data.total).toBe(0);
    });

    it('rejects coupon when subtotal is below minimum order amount', async () => {
      const { variant } = await createTestProduct(50000, 10); // ৳500 item
      const now = new Date();

      await prisma.coupon.create({
        data: {
          code: 'BIGSPENDER',
          discountType: 'PERCENTAGE',
          discountValue: 15,
          minOrderAmount: 200000, // ৳2,000 min order
          startDate: new Date(now.getTime() - 60000),
          endDate: new Date(now.getTime() + 86400000),
        },
      });

      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 1 }); // ৳500 subtotal

      const guestCookie = extractCookie(addRes.headers, COOKIE_NAMES.GUEST_CART);

      const applyRes = await request(app)
        .post('/api/v1/cart/coupon')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ code: 'BIGSPENDER' });

      expect(applyRes.status).toBe(400);
      expect(applyRes.body.error.code).toBe('MINIMUM_ORDER_NOT_MET');
    });

    it('removes coupon cleanly and restores regular subtotal', async () => {
      const { variant } = await createTestProduct(100000, 10);
      const now = new Date();

      await prisma.coupon.create({
        data: {
          code: 'REMOVE-ME',
          discountType: 'PERCENTAGE',
          discountValue: 10,
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

      // Apply
      await request(app)
        .post('/api/v1/cart/coupon')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ code: 'REMOVE-ME' });

      // Remove
      const removeRes = await request(app)
        .delete('/api/v1/cart/coupon')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`);

      expect(removeRes.status).toBe(200);
      expect(removeRes.body.data.discount).toBe(0);
      expect(removeRes.body.data.total).toBe(100000);
      expect(removeRes.body.data.coupon).toBeNull();
    });

    it('auto-detaches coupon when cart subtotal falls below minimum order amount during line item update', async () => {
      const { variant } = await createTestProduct(100000, 10); // ৳1,000 per unit
      const now = new Date();

      await prisma.coupon.create({
        data: {
          code: 'MIN3000',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          minOrderAmount: 300000, // ৳3,000 minimum
          startDate: new Date(now.getTime() - 60000),
          endDate: new Date(now.getTime() + 86400000),
        },
      });

      // Add 4 units (subtotal = ৳4,000)
      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 4 });

      const guestCookie = extractCookie(addRes.headers, COOKIE_NAMES.GUEST_CART);
      const itemId = addRes.body.data.items[0].id;

      // Apply coupon (valid because ৳4,000 >= ৳3,000)
      const applyRes = await request(app)
        .post('/api/v1/cart/coupon')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ code: 'MIN3000' });

      expect(applyRes.status).toBe(200);
      expect(applyRes.body.data.coupon).toBeDefined();

      // Reduce quantity to 1 unit (subtotal becomes ৳1,000 < ৳3,000)
      const updateRes = await request(app)
        .patch(`/api/v1/cart/items/${itemId}`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ quantity: 1 });

      expect(updateRes.status).toBe(200);
      // Coupon must be automatically detached and a notice provided
      expect(updateRes.body.data.coupon).toBeNull();
      expect(updateRes.body.data.discount).toBe(0);
      expect(updateRes.body.data.total).toBe(100000);
      expect(updateRes.body.data.couponNotice).toBeDefined();
    });
  });

  describe('3. Per-Customer Usage Limits: Guest vs Authenticated Customer', () => {
    it('allows guest to apply coupon with perCustomerLimit, but rejects authenticated customer who reached limit', async () => {
      const { variant } = await createTestProduct(100000, 10);
      const now = new Date();

      const coupon = await prisma.coupon.create({
        data: {
          code: 'ONCEPERCUST',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          perCustomerLimit: 1,
          startDate: new Date(now.getTime() - 60000),
          endDate: new Date(now.getTime() + 86400000),
        },
      });

      // 1. Guest can apply it (guest cannot be authoritatively checked per customer; deferred)
      const guestAdd = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 1 });

      const guestCookie = extractCookie(guestAdd.headers, COOKIE_NAMES.GUEST_CART);

      const guestApply = await request(app)
        .post('/api/v1/cart/coupon')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${guestCookie}`)
        .send({ code: 'ONCEPERCUST' });

      expect(guestApply.status).toBe(200);
      expect(guestApply.body.data.coupon).toBeDefined();

      // 2. Create customer who already has 1 CouponUsage recorded
      const { user, customerCookie } = await createCustomerUser('cust-used@example.com');
      await prisma.couponUsage.create({
        data: {
          couponId: coupon.id,
          userId: user.id,
        },
      });

      // Customer adds item to cart
      await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ variantId: variant.id, quantity: 1 });

      // Customer tries to apply coupon: must be rejected with COUPON_CUSTOMER_LIMIT_REACHED
      const customerApply = await request(app)
        .post('/api/v1/cart/coupon')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ code: 'ONCEPERCUST' });

      expect(customerApply.status).toBe(400);
      expect(customerApply.body.error.code).toBe('COUPON_CUSTOMER_LIMIT_REACHED');
    });
  });
});
