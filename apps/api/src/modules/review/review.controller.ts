import type { Request, Response } from 'express';
import { reviewService } from './review.service.js';
import {
  createReviewSchema,
  moderateReviewSchema,
  adminReviewQuerySchema,
  publicReviewQuerySchema,
} from './review.schemas.js';
import { rotateCsrfToken } from '../../middleware/csrf.js';
import { UnauthorizedError } from '../../lib/errors.js';

export class ReviewController {
  /**
   * Public: Retrieve approved reviews and ratings breakdown for a product.
   */
  async getProductReviews(req: Request, res: Response): Promise<void> {
    const slug = req.params.slug as string;
    const query = publicReviewQuerySchema.parse(req.query);
    const currentUserId = req.user?.id;

    const result = await reviewService.getProductReviews(slug, currentUserId, query);

    res.json({
      success: true,
      data: result,
    });
  }

  /**
   * Customer: Submit or edit product review.
   */
  async submitReview(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }
    const userId = req.user.id;
    const slug = req.params.slug as string;
    const input = createReviewSchema.parse(req.body);

    const review = await reviewService.submitReview(userId, slug, input);
    const csrfToken = rotateCsrfToken(res);

    res.status(201).json({
      success: true,
      data: {
        ...review,
        csrfToken,
      },
    });
  }

  /**
   * Customer: Delete their own review.
   */
  async deleteMyReview(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }
    const userId = req.user.id;
    const slug = req.params.slug as string;

    const result = await reviewService.deleteMyReview(userId, slug);
    const csrfToken = rotateCsrfToken(res);

    res.json({
      success: true,
      message: result.message,
      data: {
        success: true,
        message: result.message,
        csrfToken,
      },
      csrfToken,
    });
  }

  /**
   * Admin: List reviews for moderation.
   */
  async listAdminReviews(req: Request, res: Response): Promise<void> {
    const query = adminReviewQuerySchema.parse(req.query);
    const result = await reviewService.listAdminReviews(query);

    res.json({
      success: true,
      data: result,
    });
  }

  /**
   * Admin: Moderate review (Approve or Reject).
   */
  async moderateReview(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }
    const adminId = req.user.id;
    const reviewId = req.params.id as string;
    const input = moderateReviewSchema.parse(req.body);

    const review = await reviewService.moderateReview(adminId, reviewId, input);
    const csrfToken = rotateCsrfToken(res);

    res.json({
      success: true,
      data: {
        ...review,
        csrfToken,
      },
    });
  }

  /**
   * Admin: Hard-delete spam/abusive review.
   */
  async deleteAdminReview(req: Request, res: Response): Promise<void> {
    const reviewId = req.params.id as string;
    const result = await reviewService.deleteAdminReview(reviewId);
    const csrfToken = rotateCsrfToken(res);

    res.json({
      success: true,
      message: result.message,
      data: {
        success: true,
        message: result.message,
        csrfToken,
      },
      csrfToken,
    });
  }
}

export const reviewController = new ReviewController();
