import { z } from 'zod';

export const createReviewSchema = z.object({
  rating: z
    .number()
    .int('Rating must be a whole number')
    .min(1, 'Rating must be at least 1 star')
    .max(5, 'Rating cannot exceed 5 stars'),
  title: z.string().trim().max(120, 'Title cannot exceed 120 characters').optional().nullable(),
  comment: z
    .string()
    .trim()
    .min(5, 'Review comment must be at least 5 characters')
    .max(2000, 'Review comment cannot exceed 2000 characters'),
});

export const updateReviewSchema = z.object({
  rating: z
    .number()
    .int('Rating must be a whole number')
    .min(1, 'Rating must be at least 1 star')
    .max(5, 'Rating cannot exceed 5 stars')
    .optional(),
  title: z.string().trim().max(120, 'Title cannot exceed 120 characters').optional().nullable(),
  comment: z
    .string()
    .trim()
    .min(5, 'Review comment must be at least 5 characters')
    .max(2000, 'Review comment cannot exceed 2000 characters')
    .optional(),
});

export const moderateReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z
    .string()
    .trim()
    .max(500, 'Rejection reason cannot exceed 500 characters')
    .optional()
    .nullable(),
});

export const adminReviewQuerySchema = z.object({
  status: z.enum(['ALL', 'PENDING', 'APPROVED', 'REJECTED']).optional().default('ALL'),
  productId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const publicReviewQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sortBy: z.enum(['newest', 'highestRating', 'lowestRating']).optional().default('newest'),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;
export type AdminReviewQuery = z.infer<typeof adminReviewQuerySchema>;
export type PublicReviewQuery = z.infer<typeof publicReviewQuerySchema>;
