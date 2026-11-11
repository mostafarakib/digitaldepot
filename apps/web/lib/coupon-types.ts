export type CouponDiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';

export interface AdminCoupon {
  id: string;
  code: string;
  description: string | null;
  discountType: CouponDiscountType;
  discountValue: number;
  maxDiscountAmount: number | null;
  minOrderAmount: number | null;
  startDate: string;
  endDate: string;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    usages: number;
  };
}

export interface CreateCouponInput {
  code: string;
  description?: string | null;
  discountType: CouponDiscountType;
  discountValue: number;
  maxDiscountAmount?: number | null;
  minOrderAmount?: number | null;
  startDate: string;
  endDate: string;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  isActive?: boolean;
}

export interface UpdateCouponInput {
  code?: string;
  description?: string | null;
  discountType?: CouponDiscountType;
  discountValue?: number;
  maxDiscountAmount?: number | null;
  minOrderAmount?: number | null;
  startDate?: string;
  endDate?: string;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  isActive?: boolean;
}

export interface CouponListResponse {
  items: AdminCoupon[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
