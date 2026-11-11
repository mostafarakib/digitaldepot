import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool } from '../../../test/setup.js';
import { hashToken } from '../../../lib/crypto.js';
import { COOKIE_NAMES } from '../../../lib/cookies.js';
import { generateCsrfToken } from '../../../middleware/csrf.js';
import { categoryService } from '../../catalogue/category.service.js';
import { productService } from '../../catalogue/product.service.js';
import { variantService } from '../../catalogue/variant.service.js';
import { imageService } from '../../catalogue/image.service.js';

describe('Phase 5A: Shopping Cart Engine & Guest Cart Merging', () => {
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

  async function createTestProduct(params?: {
    name?: string;
    sku?: string;
    price?: number;
    initialStock?: number;
    reservedQuantity?: number;
    isActive?: boolean;
    status?: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
  }) {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const category = await categoryService.create({
      name: 'Electronics',
      slug: `elec-${uniqueSuffix}`,
    });

    const product = await productService.create({
      name: params?.name ?? `Test Keyboard ${uniqueSuffix}`,
      summary: 'Mechanical keyboard',
      description: 'Tactile switches',
      categoryId: category.id,
      initialVariant: {
        sku: params?.sku ?? `KB-${uniqueSuffix}`,
        price: params?.price ?? 500000, // ৳5,000
        initialStock: params?.initialStock ?? 10,
      },
    });

    await imageService.add(product.id, {
      url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      altText: 'Sample Image',
      isPrimary: true,
    });

    const variant = product.variants[0];

    if (params?.reservedQuantity && params.reservedQuantity > 0) {
      await prisma.inventoryItem.update({
        where: { variantId: variant.id },
        data: { reservedQuantity: params.reservedQuantity },
      });
    }

    if (params?.isActive === false) {
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { isActive: false },
      });
    }

    if (params?.status === 'PUBLISHED' || params?.status === undefined) {
      await productService.publish(product.id);
    }

    return { product, variant: await variantService.getById(variant.id) };
  }

  async function createRegisteredUser(email = 'customer@example.com', password = 'Password123!') {
    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:3000')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', csrfCookie)
      .send({
        email,
        password,
        firstName: 'John',
        lastName: 'Doe',
      });

    // Mark email verified for straightforward login
    await prisma.user.update({
      where: { email },
      data: { emailVerified: true },
    });

    return { email, password, userId: registerRes.body.data.userId };
  }

  describe('1. Guest Cart Persistence & Hashed Token Invariant', () => {
    it('generates an HttpOnly guest cart cookie and stores SHA-256 hash in database, not plaintext', async () => {
      const { variant } = await createTestProduct({ price: 100000, initialStock: 5 });

      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', 'http://localhost:3000')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 2 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.itemCount).toBe(1);
      expect(res.body.data.totalQuantity).toBe(2);
      expect(res.body.data.subtotal).toBe(200000);

      // Verify cookie
      const cookies = res.headers['set-cookie'] as unknown as string[];
      const cartCookie = cookies?.find((c) => c.startsWith(`${COOKIE_NAMES.GUEST_CART}=`));
      expect(cartCookie).toBeDefined();
      expect(cartCookie).toContain('HttpOnly');
      expect(cartCookie).toContain('SameSite=Lax');

      const rawToken = cartCookie!.split(';')[0].split('=')[1];
      expect(rawToken.length).toBeGreaterThan(20);

      // Verify PostgreSQL database stores the SHA-256 hash, NOT the raw token
      const expectedHash = hashToken(rawToken);
      const cartInDb = await prisma.cart.findUnique({
        where: { guestTokenHash: expectedHash },
      });
      expect(cartInDb).toBeDefined();
      expect(cartInDb?.guestTokenHash).toBe(expectedHash);
      expect(cartInDb?.guestTokenHash).not.toBe(rawToken);

      // Plaintext token must not exist in database
      const plaintextLookup = await prisma.cart.findFirst({
        where: { guestTokenHash: rawToken },
      });
      expect(plaintextLookup).toBeNull();

      // Subsequent read with the cookie returns the stored cart
      const getRes = await request(app)
        .get('/api/v1/cart')
        .set('Cookie', `${csrfCookie}; ${COOKIE_NAMES.GUEST_CART}=${rawToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.items).toHaveLength(1);
      expect(getRes.body.data.items[0].variantId).toBe(variant.id);
      expect(getRes.body.data.items[0].quantity).toBe(2);
    });

    it('returns empty cart structure when no cart exists or cookie is empty', async () => {
      const res = await request(app).get('/api/v1/cart');
      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.itemCount).toBe(0);
      expect(res.body.data.totalQuantity).toBe(0);
      expect(res.body.data.subtotal).toBe(0);
    });
  });

  describe('2. Available Stock Boundary Enforcement', () => {
    it('evaluates available stock as (quantity - reservedQuantity) and rejects quantities exceeding available stock', async () => {
      // Physical stock 10, reserved 6 -> available stock 4
      const { variant } = await createTestProduct({
        initialStock: 10,
        reservedQuantity: 6,
      });

      // Adding 4 should succeed
      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', 'http://localhost:3000')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 4 });

      expect(addRes.status).toBe(200);
      expect(addRes.body.data.items[0].availableStock).toBe(4);
      expect(addRes.body.data.items[0].quantity).toBe(4);

      const cartCookie = (addRes.headers['set-cookie'] as unknown as string[])
        ?.find((c) => c.startsWith(`${COOKIE_NAMES.GUEST_CART}=`))
        ?.split(';')[0];

      // Adding 1 more should fail because 4 + 1 > 4
      const failRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', 'http://localhost:3000')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${cartCookie}`)
        .send({ variantId: variant.id, quantity: 1 });

      expect(failRes.status).toBe(400);
      expect(failRes.body.error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('rejects adding out of stock variant', async () => {
      // Physical stock 5, reserved 5 -> available 0
      const { variant } = await createTestProduct({
        initialStock: 5,
        reservedQuantity: 5,
      });

      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', 'http://localhost:3000')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 1 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('OUT_OF_STOCK');
    });
  });

  describe('3. Authoritative Live Pricing & unitPriceAtAdd Informational Notices', () => {
    it('preserves unitPriceAtAdd snapshot while strictly computing totals and payable unitPrice from current database price', async () => {
      // 1. Add item at initial price ৳2,000 (200,000 poisha)
      const { variant } = await createTestProduct({ price: 200000, initialStock: 5 });

      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', 'http://localhost:3000')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 2 });

      expect(addRes.status).toBe(200);
      const cartCookie = (addRes.headers['set-cookie'] as unknown as string[])
        ?.find((c) => c.startsWith(`${COOKIE_NAMES.GUEST_CART}=`))
        ?.split(';')[0];

      // 2. Admin increases variant price to ৳2,500 (250,000 poisha)
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { price: 250000 },
      });

      // 3. Query cart: live unitPrice is 250,000, unitPriceAtAdd is 200,000, subtotal is 500,000
      const getRes = await request(app)
        .get('/api/v1/cart')
        .set('Cookie', `${csrfCookie}; ${cartCookie}`);

      expect(getRes.status).toBe(200);
      const item = getRes.body.data.items[0];
      expect(item.unitPrice).toBe(250000); // Live price
      expect(item.unitPriceAtAdd).toBe(200000); // Snapshot
      expect(item.hasPriceChanged).toBe(true);
      expect(item.priceDifference).toBe(50000); // Increased by ৳500
      expect(item.lineTotal).toBe(500000); // 2 * 250,000
      expect(getRes.body.data.subtotal).toBe(500000);
      expect(getRes.body.data.hasPriceChanges).toBe(true);
    });
  });

  describe('4. Cart Line Item Updates and Clear', () => {
    it('updates quantity, rejects update exceeding available stock, removes item, and clears cart', async () => {
      const { variant } = await createTestProduct({ initialStock: 10 });

      // Add 2 items
      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', 'http://localhost:3000')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: variant.id, quantity: 2 });

      const cartCookie = (addRes.headers['set-cookie'] as unknown as string[])
        ?.find((c) => c.startsWith(`${COOKIE_NAMES.GUEST_CART}=`))
        ?.split(';')[0];
      const itemId = addRes.body.data.items[0].id;

      // Update to 5
      const patchRes = await request(app)
        .patch(`/api/v1/cart/items/${itemId}`)
        .set('Origin', 'http://localhost:3000')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${cartCookie}`)
        .send({ quantity: 5 });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.items[0].quantity).toBe(5);

      // Attempt update to 11 (exceeds stock 10)
      const failPatch = await request(app)
        .patch(`/api/v1/cart/items/${itemId}`)
        .set('Origin', 'http://localhost:3000')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${cartCookie}`)
        .send({ quantity: 11 });

      expect(failPatch.status).toBe(400);
      expect(failPatch.body.error.code).toBe('INSUFFICIENT_STOCK');

      // Remove single item
      const deleteItemRes = await request(app)
        .delete(`/api/v1/cart/items/${itemId}`)
        .set('Origin', 'http://localhost:3000')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${cartCookie}`);

      expect(deleteItemRes.status).toBe(200);
      expect(deleteItemRes.body.data.items).toHaveLength(0);

      // Clear entire cart
      const clearRes = await request(app)
        .delete('/api/v1/cart')
        .set('Origin', 'http://localhost:3000')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${cartCookie}`);

      expect(clearRes.status).toBe(200);
      expect(clearRes.body.data.itemCount).toBe(0);
    });
  });

  describe('5. Transactional Guest Cart Merging on Authentication', () => {
    it('merges guest cart into customer cart upon successful password login and clears guest cookie', async () => {
      const user = await createRegisteredUser('shopper@example.com', 'SecurePass123!');

      // Create product A (available 10) and product B (available 5)
      const prodA = await createTestProduct({ sku: 'PROD-A', price: 100000, initialStock: 10 });
      const prodB = await createTestProduct({ sku: 'PROD-B', price: 200000, initialStock: 5 });

      // Guest adds Prod A (qty 2) and Prod B (qty 1)
      const addARes = await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', 'http://localhost:3000')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', csrfCookie)
        .send({ variantId: prodA.variant.id, quantity: 2 });

      const cartCookie = (addARes.headers['set-cookie'] as unknown as string[])
        ?.find((c) => c.startsWith(`${COOKIE_NAMES.GUEST_CART}=`))
        ?.split(';')[0];
      const rawGuestToken = cartCookie!.split('=')[1];

      await request(app)
        .post('/api/v1/cart/items')
        .set('Origin', 'http://localhost:3000')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${cartCookie}`)
        .send({ variantId: prodB.variant.id, quantity: 1 });

      // Customer logs in with guest cart cookie
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${cartCookie}`)
        .send({ email: user.email, password: user.password });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);

      // Verify guest cart cookie is cleared in response
      const loginCookies = loginRes.headers['set-cookie'] as unknown as string[];
      const clearedCartCookie = loginCookies?.find((c) =>
        c.startsWith(`${COOKIE_NAMES.GUEST_CART}=;`),
      );
      expect(clearedCartCookie).toBeDefined();

      // Verify guest cart record in DB was deleted
      const guestCartInDb = await prisma.cart.findUnique({
        where: { guestTokenHash: hashToken(rawGuestToken) },
      });
      expect(guestCartInDb).toBeNull();

      // Customer cart has both items
      const userCart = await prisma.cart.findUnique({
        where: { userId: user.userId },
        include: { items: true },
      });
      expect(userCart).toBeDefined();
      expect(userCart?.items).toHaveLength(2);
      const itemA = userCart?.items.find((i) => i.variantId === prodA.variant.id);
      const itemB = userCart?.items.find((i) => i.variantId === prodB.variant.id);
      expect(itemA?.quantity).toBe(2);
      expect(itemB?.quantity).toBe(1);
    });

    it('combines quantities for matching variants and clamps to current available stock during merge', async () => {
      const user = await createRegisteredUser('clamper@example.com', 'Pass123!Clamped');

      // Product with physical stock 5, reserved 2 -> available 3
      const prod = await createTestProduct({
        sku: 'CLAMP-01',
        initialStock: 5,
        reservedQuantity: 2,
      });

      // User already has 2 of this variant in their cart
      const userCart = await prisma.cart.create({
        data: { userId: user.userId },
      });
      await prisma.cartItem.create({
        data: {
          cartId: userCart.id,
          variantId: prod.variant.id,
          quantity: 2,
          unitPriceAtAdd: prod.variant.price,
        },
      });

      // Guest adds 2 of the same variant to a guest cart
      const rawGuestToken = 'test-guest-token-clamp-123';
      const guestCart = await prisma.cart.create({
        data: { guestTokenHash: hashToken(rawGuestToken) },
      });
      await prisma.cartItem.create({
        data: {
          cartId: guestCart.id,
          variantId: prod.variant.id,
          quantity: 2,
          unitPriceAtAdd: prod.variant.price,
        },
      });

      // Customer logs in with guest cart cookie
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${COOKIE_NAMES.GUEST_CART}=${rawGuestToken}`)
        .send({ email: user.email, password: user.password });

      expect(loginRes.status).toBe(200);

      // Available is 3; 2 + 2 = 4, so merged quantity must be clamped to 3!
      const updatedUserCart = await prisma.cart.findUnique({
        where: { userId: user.userId },
        include: { items: true },
      });
      expect(updatedUserCart?.items).toHaveLength(1);
      expect(updatedUserCart?.items[0].quantity).toBe(3);
    });

    it('registration alone does not merge or delete guest cart', async () => {
      const { variant } = await createTestProduct({ initialStock: 5 });

      // Create guest cart with 1 item
      const rawGuestToken = 'test-reg-guest-token-123';
      const guestCart = await prisma.cart.create({
        data: { guestTokenHash: hashToken(rawGuestToken) },
      });
      await prisma.cartItem.create({
        data: {
          cartId: guestCart.id,
          variantId: variant.id,
          quantity: 1,
          unitPriceAtAdd: variant.price,
        },
      });

      // Register new user with the guest cart cookie
      const regRes = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', 'http://localhost:3000')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${COOKIE_NAMES.GUEST_CART}=${rawGuestToken}`)
        .send({
          email: 'newuser@example.com',
          password: 'Password123!',
          firstName: 'New',
          lastName: 'User',
        });

      expect(regRes.status).toBe(201);

      // Guest cart must still exist!
      const guestCartInDb = await prisma.cart.findUnique({
        where: { guestTokenHash: hashToken(rawGuestToken) },
      });
      expect(guestCartInDb).not.toBeNull();
    });
  });
});
