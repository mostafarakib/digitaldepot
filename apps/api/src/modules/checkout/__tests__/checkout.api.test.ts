import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool } from '../../../test/setup.js';
import { env } from '../../../config/env.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { hashPassword, signAccessToken } from '../../../lib/crypto.js';
import { categoryService } from '../../catalogue/category.service.js';
import { brandService } from '../../catalogue/brand.service.js';
import { productService } from '../../catalogue/product.service.js';
import { variantService } from '../../catalogue/variant.service.js';
import { couponService } from '../../coupon/coupon.service.js';

describe('Phase 5E: Checkout Preparation & Pre-Validation API', () => {
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

  async function createCustomer(email: string, emailVerified = true) {
    const passwordHash = await hashPassword('CustPass123!');
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified,
        profile: {
          create: {
            firstName: 'Tanvir',
            lastName: 'Ahmed',
            phone: '+8801700000001',
          },
        },
      },
    });

    const now = new Date();
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        reauthenticatedAt: now,
        lastUsedAt: now,
      },
    });

    const accessToken = await signAccessToken({
      sub: user.id,
      sid: session.id,
    });

    const customerCookie = `${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`;
    return { user, customerCookie };
  }

  async function createPublishedProduct(params?: {
    categoryActive?: boolean;
    brandActive?: boolean;
    initialPrice?: number;
    initialStock?: number;
  }) {
    const suffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const category = await categoryService.create({
      name: `Category ${suffix}`,
      slug: `cat-${suffix}`,
      isActive: params?.categoryActive ?? true,
    });

    let brandId: string | undefined;
    if (params?.brandActive !== undefined) {
      const brand = await brandService.create({
        name: `Brand ${suffix}`,
        slug: `brand-${suffix}`,
        isActive: params.brandActive,
      });
      brandId = brand.id;
    }

    const product = await productService.create({
      name: `Product ${suffix}`,
      summary: 'Product for checkout test',
      categoryId: category.id,
      brandId,
      initialVariant: {
        sku: `SKU-${suffix}`,
        price: params?.initialPrice ?? 100000, // ৳1,000
        initialStock: params?.initialStock ?? 20,
      },
    });

    await prisma.product.update({
      where: { id: product.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });

    const fullProduct = await productService.getById(product.id);
    const variant = fullProduct.variants[0];

    return { product, variant, category };
  }

  async function createCustomerAddress(
    userId: string,
    params?: { districtId?: string; isDefault?: boolean },
  ) {
    return prisma.address.create({
      data: {
        userId,
        recipientName: 'Tanvir Ahmed',
        phone: '+8801700000001',
        divisionId: 'DHAKA',
        districtId: params?.districtId ?? 'DHAKA',
        upazila: 'Dhanmondi',
        streetAddress: 'House 12, Road 4',
        postalCode: '1205',
        isDefault: params?.isDefault ?? false,
      },
    });
  }

  describe('1. Authentication & Email Verification Gates', () => {
    it('rejects unauthenticated requests with 401 AUTHENTICATION_REQUIRED', async () => {
      const res = await request(app)
        .post('/api/v1/checkout/validate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects unverified customers with 403 EMAIL_NOT_VERIFIED', async () => {
      const { customerCookie } = await createCustomer('unverified-checkout@example.com', false);

      const res = await request(app)
        .post('/api/v1/checkout/validate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });
  });

  describe('2. Empty Cart & Address Handling', () => {
    it('returns EMPTY_CART issue when customer has no cart or zero items', async () => {
      const { customerCookie } = await createCustomer('empty-cart@example.com');

      const res = await request(app)
        .post('/api/v1/checkout/validate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.isValid).toBe(false);
      expect(res.body.data.canProceed).toBe(false);
      expect(res.body.data.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'EMPTY_CART' })]),
      );
    });

    it('rejects an addressId belonging to another customer with INVALID_ADDRESS', async () => {
      const { customerCookie, user: userA } = await createCustomer('cust-a@example.com');
      const { user: userB } = await createCustomer('cust-b@example.com');
      const addressB = await createCustomerAddress(userB.id);

      const { variant } = await createPublishedProduct();

      // Create cart for userA
      await prisma.cart.create({
        data: {
          userId: userA.id,
          items: {
            create: {
              variantId: variant.id,
              quantity: 1,
              unitPriceAtAdd: variant.price,
            },
          },
        },
      });

      const res = await request(app)
        .post('/api/v1/checkout/validate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: addressB.id });

      expect(res.status).toBe(200);
      expect(res.body.data.isValid).toBe(false);
      expect(res.body.data.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'INVALID_ADDRESS' })]),
      );
    });

    it('falls back to customer default address when addressId is omitted', async () => {
      const { customerCookie, user } = await createCustomer('default-addr@example.com');
      const defaultAddr = await createCustomerAddress(user.id, {
        districtId: 'DHAKA',
        isDefault: true,
      });

      const { variant } = await createPublishedProduct({ initialPrice: 150000 });

      await prisma.cart.create({
        data: {
          userId: user.id,
          items: {
            create: {
              variantId: variant.id,
              quantity: 2,
              unitPriceAtAdd: variant.price,
            },
          },
        },
      });

      const res = await request(app)
        .post('/api/v1/checkout/validate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.isValid).toBe(true);
      expect(res.body.data.address).not.toBeNull();
      expect(res.body.data.address.id).toBe(defaultAddr.id);
      expect(res.body.data.summary.shippingFee).toBe(6000); // ৳60 Inside Dhaka
    });
  });

  describe('3. Shipping Calculations & District Rates', () => {
    it('calculates Outside Dhaka shipping rate (৳120) for Chittagong delivery', async () => {
      const { customerCookie, user } = await createCustomer('ctg-checkout@example.com');
      const ctgAddr = await createCustomerAddress(user.id, {
        districtId: 'CHATTOGRAM',
        isDefault: true,
      });

      const { variant } = await createPublishedProduct({ initialPrice: 200000 }); // ৳2,000

      await prisma.cart.create({
        data: {
          userId: user.id,
          items: {
            create: {
              variantId: variant.id,
              quantity: 1,
              unitPriceAtAdd: variant.price,
            },
          },
        },
      });

      const res = await request(app)
        .post('/api/v1/checkout/validate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: ctgAddr.id });

      expect(res.status).toBe(200);
      expect(res.body.data.summary.merchandiseSubtotal).toBe(200000);
      expect(res.body.data.summary.shippingFee).toBe(12000); // ৳120 Outside Dhaka
      expect(res.body.data.summary.finalTotal).toBe(212000); // ৳2,120
      expect(res.body.data.summary.isFreeShipping).toBe(false);
    });

    it('grants free shipping when merchandise subtotal reaches ৳5,000 before coupon', async () => {
      const { customerCookie, user } = await createCustomer('free-ship@example.com');
      const addr = await createCustomerAddress(user.id, { districtId: 'CHATTOGRAM' });

      const { variant } = await createPublishedProduct({ initialPrice: 500000 }); // ৳5,000

      await prisma.cart.create({
        data: {
          userId: user.id,
          items: {
            create: {
              variantId: variant.id,
              quantity: 1,
              unitPriceAtAdd: variant.price,
            },
          },
        },
      });

      const res = await request(app)
        .post('/api/v1/checkout/validate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: addr.id });

      expect(res.status).toBe(200);
      expect(res.body.data.summary.shippingFee).toBe(0);
      expect(res.body.data.summary.isFreeShipping).toBe(true);
      expect(res.body.data.summary.finalTotal).toBe(500000);
    });
  });

  describe('4. Price Changes & Customer Acknowledgement (Clarification #1)', () => {
    it('uses current live price, flags hasPriceChanges, but keeps isValid = true', async () => {
      const { customerCookie, user } = await createCustomer('price-change@example.com');
      const addr = await createCustomerAddress(user.id, { districtId: 'DHAKA' });

      const { variant } = await createPublishedProduct({ initialPrice: 100000 }); // ৳1,000

      // Cart added when price was ৳1,000
      await prisma.cart.create({
        data: {
          userId: user.id,
          items: {
            create: {
              variantId: variant.id,
              quantity: 1,
              unitPriceAtAdd: 100000,
            },
          },
        },
      });

      // Price updated to ৳1,250
      await variantService.update(variant.id, {
        price: 125000,
        reason: 'Supplier cost increase',
      });

      const res = await request(app)
        .post('/api/v1/checkout/validate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: addr.id });

      expect(res.status).toBe(200);
      expect(res.body.data.isValid).toBe(true);
      expect(res.body.data.canProceed).toBe(true);
      expect(res.body.data.hasPriceChanges).toBe(true);
      expect(res.body.data.requiresPriceAcknowledgement).toBe(true);

      const item = res.body.data.items[0];
      expect(item.unitPrice).toBe(125000); // Live price
      expect(item.oldUnitPrice).toBe(100000); // Old price
      expect(item.hasPriceChanged).toBe(true);
      expect(item.priceDifference).toBe(25000);

      // Subtotal reflects live price
      expect(res.body.data.summary.merchandiseSubtotal).toBe(125000);
      expect(res.body.data.summary.finalTotal).toBe(125000 + 6000); // ৳1,250 + ৳60 shipping
    });
  });

  describe('5. Stock and Publication Availability Guards', () => {
    it('flags UNAVAILABLE and marks isValid = false if product was unpublished', async () => {
      const { customerCookie, user } = await createCustomer('unpub-check@example.com');
      const addr = await createCustomerAddress(user.id, { districtId: 'DHAKA' });

      const { product, variant } = await createPublishedProduct();

      await prisma.cart.create({
        data: {
          userId: user.id,
          items: {
            create: {
              variantId: variant.id,
              quantity: 1,
              unitPriceAtAdd: variant.price,
            },
          },
        },
      });

      // Product archived
      await productService.archive(product.id);

      const res = await request(app)
        .post('/api/v1/checkout/validate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: addr.id });

      expect(res.status).toBe(200);
      expect(res.body.data.isValid).toBe(false);
      expect(res.body.data.hasUnavailableItems).toBe(true);
      expect(res.body.data.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'UNAVAILABLE' })]),
      );
    });

    it('flags INSUFFICIENT_STOCK if requested quantity exceeds available physical stock', async () => {
      const { customerCookie, user } = await createCustomer('stock-check@example.com');
      const addr = await createCustomerAddress(user.id, { districtId: 'DHAKA' });

      const { variant } = await createPublishedProduct({ initialStock: 5 });

      await prisma.cart.create({
        data: {
          userId: user.id,
          items: {
            create: {
              variantId: variant.id,
              quantity: 10, // 10 requested, only 5 available
              unitPriceAtAdd: variant.price,
            },
          },
        },
      });

      const res = await request(app)
        .post('/api/v1/checkout/validate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: addr.id });

      expect(res.status).toBe(200);
      expect(res.body.data.isValid).toBe(false);
      expect(res.body.data.hasInsufficientStock).toBe(true);
      expect(res.body.data.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'INSUFFICIENT_STOCK' })]),
      );
    });
  });

  describe('6. Coupon Calculation & Invariant Enforcement', () => {
    it('applies percentage coupon discount with Math.round without incrementing usageCount', async () => {
      const { customerCookie, user } = await createCustomer('coupon-check@example.com');
      const addr = await createCustomerAddress(user.id, { districtId: 'DHAKA' });

      const coupon = await couponService.createCoupon({
        code: 'PROMO15',
        discountType: 'PERCENTAGE',
        discountValue: 15, // 15%
        startDate: new Date(Date.now() - 3600000).toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
        usageLimit: 100,
        perCustomerLimit: 1,
        isActive: true,
      });

      // Subtotal: ৳1,999 (199,900 poisha). 15% of 199,900 = 29,985 poisha
      const { variant } = await createPublishedProduct({ initialPrice: 199900 });

      await prisma.cart.create({
        data: {
          userId: user.id,
          couponId: coupon.id,
          items: {
            create: {
              variantId: variant.id,
              quantity: 1,
              unitPriceAtAdd: variant.price,
            },
          },
        },
      });

      const res = await request(app)
        .post('/api/v1/checkout/validate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: addr.id });

      expect(res.status).toBe(200);
      expect(res.body.data.isValid).toBe(true);
      expect(res.body.data.coupon).not.toBeNull();
      expect(res.body.data.coupon.code).toBe('PROMO15');
      expect(res.body.data.summary.discount).toBe(29985); // Exactly Math.round(199900 * 0.15)
      expect(res.body.data.summary.finalTotal).toBe(199900 - 29985 + 6000);

      // Usage count in database must remain 0 (no consumption during pre-validation)
      const freshCoupon = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
      expect(freshCoupon.usageCount).toBe(0);

      const usageRecords = await prisma.couponUsage.count({ where: { couponId: coupon.id } });
      expect(usageRecords).toBe(0);
    });
  });

  describe('7. Strict Read-Only Invariant Enforcement (Clarification #2)', () => {
    it('does NOT modify Cart.estimatedDistrict, creates zero orders, and modifies zero inventory', async () => {
      const { customerCookie, user } = await createCustomer('readonly-guard@example.com');
      const addr = await createCustomerAddress(user.id, { districtId: 'CHATTOGRAM' });

      const { variant } = await createPublishedProduct({ initialPrice: 100000, initialStock: 10 });

      const cart = await prisma.cart.create({
        data: {
          userId: user.id,
          estimatedDistrict: null, // Initially null
          items: {
            create: {
              variantId: variant.id,
              quantity: 2,
              unitPriceAtAdd: variant.price,
            },
          },
        },
      });

      const inventoryBefore = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });

      const res = await request(app)
        .post('/api/v1/checkout/validate')
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ addressId: addr.id });

      expect(res.status).toBe(200);
      expect(res.body.data.isValid).toBe(true);

      // 1. Cart.estimatedDistrict in database remains NULL
      const freshCart = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(freshCart.estimatedDistrict).toBeNull();

      // 2. Inventory stock remains completely untouched
      const inventoryAfter = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      });
      expect(inventoryAfter.quantity).toBe(inventoryBefore.quantity);
      expect(inventoryAfter.reservedQuantity).toBe(inventoryBefore.reservedQuantity);

      // 3. Zero orders created
      const orderCount = await prisma.order.count();
      expect(orderCount).toBe(0);
    });
  });
});
