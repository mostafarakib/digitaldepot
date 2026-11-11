import { Router } from 'express';
import { reviewController } from './review.controller.js';
import {
  authenticate,
  optionalAuthenticate,
  requireRole,
  requireVerifiedEmail,
} from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { Role } from '../../generated/client/client.js';

export const productReviewRouter = Router();
export const adminReviewRouter = Router();

// Storefront & Customer Review Routes (mounted under /products)
productReviewRouter.get(
  '/:slug/reviews',
  optionalAuthenticate,
  reviewController.getProductReviews.bind(reviewController),
);

productReviewRouter.post(
  '/:slug/reviews',
  authenticate,
  requireVerifiedEmail,
  csrfProtection,
  reviewController.submitReview.bind(reviewController),
);

productReviewRouter.delete(
  '/:slug/reviews/my-review',
  authenticate,
  csrfProtection,
  reviewController.deleteMyReview.bind(reviewController),
);

// Admin Moderation Routes (mounted under /admin/reviews)
adminReviewRouter.get(
  '/',
  authenticate,
  requireRole(Role.ADMIN),
  reviewController.listAdminReviews.bind(reviewController),
);

adminReviewRouter.patch(
  '/:id/status',
  authenticate,
  requireRole(Role.ADMIN),
  csrfProtection,
  reviewController.moderateReview.bind(reviewController),
);

adminReviewRouter.delete(
  '/:id',
  authenticate,
  requireRole(Role.ADMIN),
  csrfProtection,
  reviewController.deleteAdminReview.bind(reviewController),
);
