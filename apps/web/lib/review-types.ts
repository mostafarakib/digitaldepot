export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

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
  createdAt: string;
  reviewerName: string;
}

export interface CurrentUserReview {
  id: string;
  rating: number;
  title: string | null;
  comment: string;
  status: ReviewStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
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

export interface CreateReviewInput {
  rating: number;
  title?: string | null;
  comment: string;
}

export interface ModerateReviewInput {
  status: 'APPROVED' | 'REJECTED';
  rejectionReason?: string | null;
}

export interface AdminReviewItem {
  id: string;
  rating: number;
  title: string | null;
  comment: string;
  status: ReviewStatus;
  isVerifiedPurchase: boolean;
  rejectionReason: string | null;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
  product: {
    id: string;
    name: string;
    slug: string;
    status: string;
    imageUrl: string | null;
  };
}

export interface AdminReviewsListResponse {
  reviews: AdminReviewItem[];
  pendingCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
