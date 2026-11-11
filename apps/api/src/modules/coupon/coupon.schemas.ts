import { z } from 'zod';

export const adminCreateCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, 'Coupon code must be at least 3 characters')
      .max(30, 'Coupon code cannot exceed 30 characters')
      .regex(
        /^[A-Za-z0-9_-]+$/,
        'Coupon code can only contain letters, numbers, hyphens, and underscores',
      )
      .transform((val) => val.toUpperCase()),
    description: z.string().trim().max(255).optional().nullable(),
    discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
    discountValue: z.number().int().positive('Discount value must be a positive integer'),
    maxDiscountAmount: z
      .number()
      .int()
      .positive('Max discount amount must be positive')
      .optional()
      .nullable(),
    minOrderAmount: z
      .number()
      .int()
      .nonnegative('Minimum order amount cannot be negative')
      .optional()
      .nullable(),
    startDate: z.string().datetime({ message: 'Invalid start date format' }),
    endDate: z.string().datetime({ message: 'Invalid end date format' }),
    usageLimit: z
      .number()
      .int()
      .positive('Usage limit must be a positive integer')
      .optional()
      .nullable(),
    perCustomerLimit: z
      .number()
      .int()
      .positive('Per-customer limit must be a positive integer')
      .optional()
      .nullable(),
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    // 1. Percentage discount must be 1-100
    if (
      data.discountType === 'PERCENTAGE' &&
      (data.discountValue < 1 || data.discountValue > 100)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Percentage discount must be between 1 and 100',
        path: ['discountValue'],
      });
    }

    // 2. maxDiscountAmount only applicable to PERCENTAGE
    if (
      data.discountType === 'FIXED_AMOUNT' &&
      data.maxDiscountAmount !== undefined &&
      data.maxDiscountAmount !== null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Maximum discount amount is applicable only to percentage coupons',
        path: ['maxDiscountAmount'],
      });
    }

    // 3. endDate must be later than startDate
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date must be later than start date',
        path: ['endDate'],
      });
    }
  });

export const adminUpdateCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'Coupon code must be at least 3 characters')
    .max(30, 'Coupon code cannot exceed 30 characters')
    .regex(
      /^[A-Za-z0-9_-]+$/,
      'Coupon code can only contain letters, numbers, hyphens, and underscores',
    )
    .transform((val) => val.toUpperCase())
    .optional(),
  description: z.string().trim().max(255).optional().nullable(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional(),
  discountValue: z.number().int().positive('Discount value must be a positive integer').optional(),
  maxDiscountAmount: z
    .number()
    .int()
    .positive('Max discount amount must be positive')
    .optional()
    .nullable(),
  minOrderAmount: z
    .number()
    .int()
    .nonnegative('Minimum order amount cannot be negative')
    .optional()
    .nullable(),
  startDate: z.string().datetime({ message: 'Invalid start date format' }).optional(),
  endDate: z.string().datetime({ message: 'Invalid end date format' }).optional(),
  usageLimit: z
    .number()
    .int()
    .positive('Usage limit must be a positive integer')
    .optional()
    .nullable(),
  perCustomerLimit: z
    .number()
    .int()
    .positive('Per-customer limit must be a positive integer')
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
});

export const adminCouponQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().trim().optional(),
  status: z.enum(['all', 'active', 'expired', 'upcoming', 'inactive']).default('all'),
  sortBy: z.enum(['createdAt', 'endDate', 'code', 'discountValue']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const applyCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Coupon code is required')
    .max(50, 'Coupon code is too long')
    .transform((val) => val.toUpperCase()),
});

export type AdminCreateCouponInput = z.infer<typeof adminCreateCouponSchema>;
export type AdminUpdateCouponInput = z.infer<typeof adminUpdateCouponSchema>;
export type AdminCouponQueryInput = z.infer<typeof adminCouponQuerySchema>;
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;
