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
import { productService } from '../../catalogue/product.service.js';
import { imageService } from '../../catalogue/image.service.js';

describe('Phase 5D: Product Reviews & Admin Moderation API', () => {
  let csrfToken: string;
  let csrfCookie: string;
  let adminCookie: string;

  beforeEach(async () => {
    await cleanDatabase();
    csrfToken = generateCsrfToken();
    csrfCookie = `${COOKIE_NAMES.CSRF_TOKEN}=${csrfToken}`;

    // Create Admin User
    const passwordHash = await hashPassword('AdminPass123!');
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin-reviews@example.com',
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        profile: {
          create: {
            firstName: 'Admin',
            lastName: 'Moderator',
            phone: '+8801700000000',
          },
        },
      },
    });

    const now = new Date();
    const adminSession = await prisma.session.create({
      data: {
        userId: adminUser.id,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        reauthenticatedAt: now,
        lastUsedAt: now,
      },
    });

    const adminAccessToken = await signAccessToken({
      sub: adminUser.id,
      sid: adminSession.id,
    });
    adminCookie = `${COOKIE_NAMES.ACCESS_TOKEN}=${adminAccessToken}`;
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
            firstName: 'Rahim',
            lastName: 'Chowdhury',
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

  async function createPublishedProduct() {
    const suffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const category = await categoryService.create({
      name: `Category ${suffix}`,
      slug: `cat-${suffix}`,
      isActive: true,
    });

    const product = await productService.create({
      name: `Smart Phone ${suffix}`,
      summary: 'Flagship device',
      categoryId: category.id,
      initialVariant: {
        sku: `PHONE-${suffix}`,
        price: 8000000,
        initialStock: 15,
      },
    });

    await imageService.add(product.id, {
      url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      altText: 'Sample Image',
      isPrimary: true,
    });

    await productService.publish(product.id);
    return product;
  }

  describe('1. Public Approved-Only Reviews & Ratings Aggregate', () => {
    it('returns empty summary and reviews when no reviews exist', async () => {
      const product = await createPublishedProduct();

      const res = await request(app).get(`/api/v1/products/${product.slug}/reviews`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.averageRating).toBeNull();
      expect(res.body.data.summary.reviewCount).toBe(0);
      expect(res.body.data.reviews).toEqual([]);
      expect(res.body.data.currentUserReview).toBeNull();
    });

    it('calculates ratings and returns only APPROVED reviews in public listing', async () => {
      const product = await createPublishedProduct();
      const { user: user1 } = await createCustomer('user1@example.com');
      const { user: user2 } = await createCustomer('user2@example.com');
      const { user: user3 } = await createCustomer('user3@example.com');

      // Review 1: 5 stars, APPROVED
      await prisma.productReview.create({
        data: {
          userId: user1.id,
          productId: product.id,
          rating: 5,
          title: 'Amazing quality',
          comment: 'Exceeded my expectations entirely.',
          status: 'APPROVED',
        },
      });

      // Review 2: 4 stars, APPROVED
      await prisma.productReview.create({
        data: {
          userId: user2.id,
          productId: product.id,
          rating: 4,
          title: 'Good product',
          comment: 'Very solid build and battery life.',
          status: 'APPROVED',
        },
      });

      // Review 3: 1 star, PENDING (must NOT be visible publicly)
      await prisma.productReview.create({
        data: {
          userId: user3.id,
          productId: product.id,
          rating: 1,
          title: 'Unhappy',
          comment: 'Did not like it at all.',
          status: 'PENDING',
        },
      });

      const res = await request(app).get(`/api/v1/products/${product.slug}/reviews`);
      expect(res.status).toBe(200);

      // Aggregate: (5 + 4) / 2 = 4.5
      expect(res.body.data.summary.averageRating).toBe(4.5);
      expect(res.body.data.summary.reviewCount).toBe(2);
      expect(res.body.data.summary.distribution[5]).toBe(1);
      expect(res.body.data.summary.distribution[4]).toBe(1);
      expect(res.body.data.summary.distribution[1]).toBe(0); // pending excluded!

      // Public reviews array has only 2 approved reviews
      expect(res.body.data.reviews).toHaveLength(2);
      expect(res.body.data.reviews.map((r: { rating: number }) => r.rating)).toEqual([4, 5]);
      expect(res.body.data.reviews[0].reviewerName).toBe('Rahim C.'); // Profile privacy preserved
    });
  });

  describe('2. Review Submission, Editing & Moderation Flow', () => {
    it('creates new review in PENDING status requiring admin moderation', async () => {
      const product = await createPublishedProduct();
      const { customerCookie } = await createCustomer('submitter@example.com');

      const submitRes = await request(app)
        .post(`/api/v1/products/${product.slug}/reviews`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({
          rating: 5,
          title: 'Exceptional flagship',
          comment: 'Battery lasts two full days with heavy usage.',
        });

      expect(submitRes.status).toBe(201);
      expect(submitRes.body.data.status).toBe('PENDING');
      expect(submitRes.body.data.rating).toBe(5);

      // Not visible in public listing yet
      const publicRes = await request(app).get(`/api/v1/products/${product.slug}/reviews`);
      expect(publicRes.body.data.summary.reviewCount).toBe(0);
      expect(publicRes.body.data.reviews).toHaveLength(0);

      // But visible to author when authenticated
      const authorRes = await request(app)
        .get(`/api/v1/products/${product.slug}/reviews`)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`);

      expect(authorRes.body.data.currentUserReview).toBeDefined();
      expect(authorRes.body.data.currentUserReview.status).toBe('PENDING');
      expect(authorRes.body.data.currentUserReview.rating).toBe(5);
    });

    it('rejects unverified customers from submitting reviews with 403 EMAIL_NOT_VERIFIED', async () => {
      const product = await createPublishedProduct();
      const { customerCookie } = await createCustomer('unverified@example.com', false);

      const res = await request(app)
        .post(`/api/v1/products/${product.slug}/reviews`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({
          rating: 5,
          comment: 'Great product and service!',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('validates ratings (1-5) and comment length (min 5, max 2000)', async () => {
      const product = await createPublishedProduct();
      const { customerCookie } = await createCustomer('validator@example.com');

      // Invalid rating: 6
      const invalidRating = await request(app)
        .post(`/api/v1/products/${product.slug}/reviews`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ rating: 6, comment: 'Valid comment length here' });

      expect(invalidRating.status).toBe(400);

      // Invalid comment: < 5 chars
      const shortComment = await request(app)
        .post(`/api/v1/products/${product.slug}/reviews`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({ rating: 4, comment: 'bad' });

      expect(shortComment.status).toBe(400);
    });

    it('reverts status to PENDING when a customer edits an already-approved review', async () => {
      const product = await createPublishedProduct();
      const { customerCookie, user } = await createCustomer('editor@example.com');

      // Initial review approved
      await prisma.productReview.create({
        data: {
          userId: user.id,
          productId: product.id,
          rating: 5,
          title: 'Initial review',
          comment: 'Loved the fast delivery and package.',
          status: 'APPROVED',
        },
      });

      // Verify approved in public listing
      const initialPublic = await request(app).get(`/api/v1/products/${product.slug}/reviews`);
      expect(initialPublic.body.data.summary.reviewCount).toBe(1);

      // Customer edits review
      const editRes = await request(app)
        .post(`/api/v1/products/${product.slug}/reviews`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`)
        .send({
          rating: 3,
          title: 'Edited review after 1 month',
          comment: 'Battery degraded faster than expected.',
        });

      expect(editRes.status).toBe(201);
      expect(editRes.body.data.status).toBe('PENDING'); // Reverted to PENDING!
      expect(editRes.body.data.rating).toBe(3);

      // Public listing now has 0 approved reviews
      const updatedPublic = await request(app).get(`/api/v1/products/${product.slug}/reviews`);
      expect(updatedPublic.body.data.summary.reviewCount).toBe(0);
      expect(updatedPublic.body.data.reviews).toHaveLength(0);
    });

    it('allows a customer to delete their own review', async () => {
      const product = await createPublishedProduct();
      const { customerCookie, user } = await createCustomer('deleter@example.com');

      await prisma.productReview.create({
        data: {
          userId: user.id,
          productId: product.id,
          rating: 4,
          comment: 'Decent everyday performance.',
          status: 'APPROVED',
        },
      });

      const delRes = await request(app)
        .delete(`/api/v1/products/${product.slug}/reviews/my-review`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${customerCookie}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      const inDb = await prisma.productReview.findUnique({
        where: { userId_productId: { userId: user.id, productId: product.id } },
      });
      expect(inDb).toBeNull();
    });
  });

  describe('3. Admin Moderation & Security', () => {
    it('allows admin to list, approve, and reject reviews', async () => {
      const product = await createPublishedProduct();
      const { user } = await createCustomer('review-target@example.com');

      const review = await prisma.productReview.create({
        data: {
          userId: user.id,
          productId: product.id,
          rating: 5,
          comment: 'Fantastic phone and screen!',
          status: 'PENDING',
        },
      });

      // Admin lists reviews
      const listRes = await request(app)
        .get('/api/v1/admin/reviews?status=PENDING')
        .set('Cookie', `${csrfCookie}; ${adminCookie}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.pendingCount).toBe(1);
      expect(listRes.body.data.reviews).toHaveLength(1);

      // Admin approves review
      const approveRes = await request(app)
        .patch(`/api/v1/admin/reviews/${review.id}/status`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({ status: 'APPROVED' });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('APPROVED');

      // Now visible on public storefront
      const publicRes = await request(app).get(`/api/v1/products/${product.slug}/reviews`);
      expect(publicRes.body.data.summary.reviewCount).toBe(1);

      // Admin rejects review with reason
      const rejectRes = await request(app)
        .patch(`/api/v1/admin/reviews/${review.id}/status`)
        .set('Origin', env.FRONTEND_URL)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', `${csrfCookie}; ${adminCookie}`)
        .send({ status: 'REJECTED', rejectionReason: 'Inappropriate language detected' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.status).toBe('REJECTED');
      expect(rejectRes.body.data.rejectionReason).toBe('Inappropriate language detected');
    });

    it('rejects non-admin customers from moderation endpoints with 403 INSUFFICIENT_PERMISSIONS', async () => {
      const { customerCookie } = await createCustomer('regular@example.com');

      const res = await request(app)
        .get('/api/v1/admin/reviews')
        .set('Cookie', `${csrfCookie}; ${customerCookie}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  describe('4. Review History Preservation & Product Deletion Safeguards (Clarification #2)', () => {
    it('prevents hard deletion of a product that has reviews and suggests archiving', async () => {
      const product = await createPublishedProduct();
      const { user } = await createCustomer('reviewer-preserve@example.com');

      await prisma.productReview.create({
        data: {
          userId: user.id,
          productId: product.id,
          rating: 5,
          comment: 'Do not delete this review history.',
          status: 'APPROVED',
        },
      });

      // Attempting to delete product must throw ConflictError PRODUCT_HAS_REVIEWS
      await expect(productService.delete(product.id)).rejects.toThrow(
        'Cannot delete product because it has customer reviews. Archive the product instead to preserve review history.',
      );

      // Archiving succeeds cleanly
      const archived = await productService.archive(product.id);
      expect(archived.status).toBe('ARCHIVED');

      // Review remains intact in database
      const reviewInDb = await prisma.productReview.findUnique({
        where: { userId_productId: { userId: user.id, productId: product.id } },
      });
      expect(reviewInDb).not.toBeNull();
      expect(reviewInDb?.status).toBe('APPROVED');
    });
  });
});
