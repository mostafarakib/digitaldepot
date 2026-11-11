import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import { validateStorefrontVisibility } from '../catalogue/product.service.js';
import type {
  CreateReviewInput,
  ModerateReviewInput,
  AdminReviewQuery,
  PublicReviewQuery,
} from './review.schemas.js';
import type { Prisma, ReviewStatus } from '../../generated/client/client.js';

export interface ProductReviewsSummary {
  averageRating: number | null;
  reviewCount: number;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export interface PublicReviewItem {
  id: string;
  rating: number;
  title: string | null;
  comment: string;
  isVerifiedPurchase: boolean;
  createdAt: Date;
  reviewerName: string;
}

export interface CurrentUserReview {
  id: string;
  rating: number;
  title: string | null;
  comment: string;
  status: ReviewStatus;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductReviewsResponse {
  product: {
    id: string;
    name: string;
    slug: string;
  };
  summary: ProductReviewsSummary;
  reviews: PublicReviewItem[];
  currentUserReview: CurrentUserReview | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class ReviewService {
  /**
   * Retrieves public approved reviews and aggregate summary for a product.
   * If caller is authenticated, also includes caller's own review regardless of status.
   */
  async getProductReviews(
    slug: string,
    currentUserId?: string,
    query: PublicReviewQuery = { page: 1, limit: 10, sortBy: 'newest' },
  ): Promise<ProductReviewsResponse> {
    const product = await validateStorefrontVisibility(slug);

    // 1. Calculate summary from APPROVED reviews only
    const approvedReviews = await prisma.productReview.findMany({
      where: {
        productId: product.id,
        status: 'APPROVED',
      },
      select: {
        rating: true,
      },
    });

    const reviewCount = approvedReviews.length;
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let ratingSum = 0;

    for (const r of approvedReviews) {
      ratingSum += r.rating;
      if (r.rating in distribution) {
        distribution[r.rating as 1 | 2 | 3 | 4 | 5]++;
      }
    }

    const averageRating = reviewCount > 0 ? Number((ratingSum / reviewCount).toFixed(1)) : null;

    const summary: ProductReviewsSummary = {
      averageRating,
      reviewCount,
      distribution,
    };

    // 2. Fetch paginated approved reviews
    const where: Prisma.ProductReviewWhereInput = {
      productId: product.id,
      status: 'APPROVED',
      ...(query.rating ? { rating: query.rating } : {}),
    };

    let orderBy: Prisma.ProductReviewOrderByWithRelationInput[] = [{ createdAt: 'desc' }];
    if (query.sortBy === 'highestRating') {
      orderBy = [{ rating: 'desc' }, { createdAt: 'desc' }];
    } else if (query.sortBy === 'lowestRating') {
      orderBy = [{ rating: 'asc' }, { createdAt: 'desc' }];
    }

    const total = await prisma.productReview.count({ where });
    const page = Math.max(1, query.page);
    const limit = Math.max(1, Math.min(50, query.limit));
    const skip = (page - 1) * limit;

    const rawReviews = await prisma.productReview.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        user: {
          select: {
            profile: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    const reviews: PublicReviewItem[] = rawReviews.map((r) => {
      const p = r.user.profile;
      let reviewerName = 'Customer';
      if (p?.firstName) {
        reviewerName = p.lastName ? `${p.firstName} ${p.lastName.charAt(0)}.` : p.firstName;
      }

      return {
        id: r.id,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        isVerifiedPurchase: r.isVerifiedPurchase,
        createdAt: r.createdAt,
        reviewerName,
      };
    });

    // 3. Resolve caller's own review if authenticated
    let currentUserReview: CurrentUserReview | null = null;
    if (currentUserId) {
      const userReview = await prisma.productReview.findUnique({
        where: {
          userId_productId: {
            userId: currentUserId,
            productId: product.id,
          },
        },
      });

      if (userReview) {
        currentUserReview = {
          id: userReview.id,
          rating: userReview.rating,
          title: userReview.title,
          comment: userReview.comment,
          status: userReview.status,
          rejectionReason: userReview.rejectionReason,
          createdAt: userReview.createdAt,
          updatedAt: userReview.updatedAt,
        };
      }
    }

    return {
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
      },
      summary,
      reviews,
      currentUserReview,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Submits a customer review for a published product.
   * If existing review exists, updates it and REVERTS status to PENDING for re-moderation.
   */
  async submitReview(userId: string, slug: string, input: CreateReviewInput) {
    const product = await validateStorefrontVisibility(slug);

    const existing = await prisma.productReview.findUnique({
      where: {
        userId_productId: {
          userId,
          productId: product.id,
        },
      },
    });

    let review;
    if (existing) {
      // Revert status to PENDING on edit to ensure moderation integrity
      review = await prisma.productReview.update({
        where: { id: existing.id },
        data: {
          rating: input.rating,
          title: input.title ?? null,
          comment: input.comment,
          status: 'PENDING',
          moderatedAt: null,
          moderatorId: null,
          rejectionReason: null,
        },
      });
    } else {
      // Create new review in PENDING status
      review = await prisma.productReview.create({
        data: {
          userId,
          productId: product.id,
          rating: input.rating,
          title: input.title ?? null,
          comment: input.comment,
          status: 'PENDING',
          isVerifiedPurchase: false, // Phase 6 order linkage
        },
      });
    }

    return review;
  }

  /**
   * Removes customer's own review.
   */
  async deleteMyReview(userId: string, slug: string) {
    const product = await prisma.product.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found');
    }

    const deleted = await prisma.productReview.deleteMany({
      where: {
        userId,
        productId: product.id,
      },
    });

    if (deleted.count === 0) {
      throw new NotFoundError(
        'REVIEW_NOT_FOUND',
        'You have not submitted a review for this product',
      );
    }

    return { success: true, message: 'Review deleted successfully' };
  }

  /**
   * Admin: List and filter reviews for moderation.
   */
  async listAdminReviews(query: AdminReviewQuery) {
    const where: Prisma.ProductReviewWhereInput = {};

    if (query.status && query.status !== 'ALL') {
      where.status = query.status as ReviewStatus;
    }

    if (query.productId) {
      where.productId = query.productId;
    }

    if (query.search && query.search.trim().length > 0) {
      const s = query.search.trim();
      where.OR = [
        { comment: { contains: s, mode: 'insensitive' } },
        { title: { contains: s, mode: 'insensitive' } },
        { user: { email: { contains: s, mode: 'insensitive' } } },
        { product: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const page = Math.max(1, query.page);
    const limit = Math.max(1, Math.min(100, query.limit));
    const skip = (page - 1) * limit;

    const [total, pendingCount, reviews] = await Promise.all([
      prisma.productReview.count({ where }),
      prisma.productReview.count({ where: { status: 'PENDING' } }),
      prisma.productReview.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              images: {
                where: { isPrimary: true },
                take: 1,
                select: { url: true, altText: true },
              },
            },
          },
        },
      }),
    ]);

    const formattedReviews = reviews.map((r) => {
      const p = r.user.profile;
      const userName = p
        ? `${p.firstName || ''} ${p.lastName || ''}`.trim() || r.user.email
        : r.user.email;
      const primaryImage = r.product.images[0] || null;

      return {
        id: r.id,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        status: r.status,
        isVerifiedPurchase: r.isVerifiedPurchase,
        rejectionReason: r.rejectionReason,
        moderatedAt: r.moderatedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        user: {
          id: r.user.id,
          email: r.user.email,
          name: userName,
        },
        product: {
          id: r.product.id,
          name: r.product.name,
          slug: r.product.slug,
          status: r.product.status,
          imageUrl: primaryImage?.url || null,
        },
      };
    });

    return {
      reviews: formattedReviews,
      pendingCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Admin: Moderate a customer review (APPROVED or REJECTED).
   */
  async moderateReview(adminId: string, reviewId: string, input: ModerateReviewInput) {
    const existing = await prisma.productReview.findUnique({
      where: { id: reviewId },
    });

    if (!existing) {
      throw new NotFoundError('REVIEW_NOT_FOUND', 'Review not found');
    }

    const updated = await prisma.productReview.update({
      where: { id: reviewId },
      data: {
        status: input.status,
        moderatorId: adminId,
        moderatedAt: new Date(),
        rejectionReason: input.status === 'REJECTED' ? (input.rejectionReason ?? null) : null,
      },
    });

    return updated;
  }

  /**
   * Admin: Hard-delete a spam/abusive review.
   */
  async deleteAdminReview(reviewId: string) {
    const existing = await prisma.productReview.findUnique({
      where: { id: reviewId },
    });

    if (!existing) {
      throw new NotFoundError('REVIEW_NOT_FOUND', 'Review not found');
    }

    await prisma.productReview.delete({
      where: { id: reviewId },
    });

    return { success: true, message: 'Review deleted successfully' };
  }
}

export const reviewService = new ReviewService();
