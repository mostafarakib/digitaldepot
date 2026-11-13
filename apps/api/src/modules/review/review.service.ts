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
  isVerifiedPurchase: boolean;
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
          isVerifiedPurchase: userReview.isVerifiedPurchase,
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
   * Checks whether the customer has completed a delivered purchase for this product,
   * accounting for completed returns.
   *
   * Rules (Phase 7E):
   * 1. Only DELIVERED orders containing items matching productId qualify.
   * 2. Delivered quantity is reduced only by quantities in COMPLETED returns.
   * 3. REQUESTED, APPROVED, RECEIVED, REJECTED, and CANCELLED returns do not reduce eligibility.
   * 4. Partially returned items still qualify if net delivered quantity > 0.
   * 5. Fully returned items (net delivered quantity = 0) do not qualify.
   */
  async checkVerifiedPurchaseEligibility(
    userId: string,
    productId: string,
    tx: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<boolean> {
    const deliveredItems = await tx.orderItem.findMany({
      where: {
        productId,
        order: {
          userId,
          status: 'DELIVERED',
        },
      },
      select: {
        id: true,
        quantity: true,
        returnItems: {
          where: {
            returnRequest: {
              status: 'COMPLETED',
            },
          },
          select: {
            quantity: true,
          },
        },
      },
    });

    if (deliveredItems.length === 0) {
      return false;
    }

    let netDeliveredQuantity = 0;
    for (const item of deliveredItems) {
      const completedReturnedQty = item.returnItems.reduce((sum, r) => sum + r.quantity, 0);
      const remainingItemQty = Math.max(0, item.quantity - completedReturnedQty);
      netDeliveredQuantity += remainingItemQty;
    }

    return netDeliveredQuantity > 0;
  }

  /**
   * Submits a customer review for a published product.
   * If existing review exists, updates it and REVERTS status to PENDING for re-moderation.
   * Executes within a transaction to ensure eligibility verification concurrency.
   * Locks delivered Order rows (FOR SHARE OF o) ordered deterministically by o.id ASC.
   */
  async submitReview(userId: string, slug: string, input: CreateReviewInput) {
    const product = await validateStorefrontVisibility(slug);

    return await prisma.$transaction(async (tx) => {
      // Lock delivered Order rows for this user and product in deterministic order.
      // Use FOR SHARE OF o to lock only Order rows (Phase 7E).
      await tx.$queryRaw`
        SELECT o.id
        FROM "Order" o
        JOIN "OrderItem" oi ON oi."orderId" = o.id
        WHERE o."userId" = ${userId}
          AND o.status = 'DELIVERED'
          AND oi."productId" = ${product.id}
        ORDER BY o.id ASC
        FOR SHARE OF o
      `;

      const isVerifiedPurchase = await this.checkVerifiedPurchaseEligibility(
        userId,
        product.id,
        tx,
      );

      const existing = await tx.productReview.findUnique({
        where: {
          userId_productId: {
            userId,
            productId: product.id,
          },
        },
      });

      if (existing) {
        // Revert status to PENDING on edit to ensure moderation integrity
        return await tx.productReview.update({
          where: { id: existing.id },
          data: {
            rating: input.rating,
            title: input.title ?? null,
            comment: input.comment,
            status: 'PENDING',
            isVerifiedPurchase,
            moderatedAt: null,
            moderatorId: null,
            rejectionReason: null,
          },
        });
      } else {
        // Create new review in PENDING status
        return await tx.productReview.create({
          data: {
            userId,
            productId: product.id,
            rating: input.rating,
            title: input.title ?? null,
            comment: input.comment,
            status: 'PENDING',
            isVerifiedPurchase,
          },
        });
      }
    });
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
