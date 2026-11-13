import { z } from 'zod';

export const customerOrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z
    .enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
    .optional(),
});

export type CustomerOrderQuery = z.infer<typeof customerOrderQuerySchema>;

export const cancelCustomerOrderInputSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export type CancelCustomerOrderInput = z.infer<typeof cancelCustomerOrderInputSchema>;

export const adminOrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z
    .enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
    .optional(),
  paymentStatus: z.enum(['PENDING', 'PAID', 'FAILED', 'CANCELLED']).optional(),
  paymentMethod: z.enum(['COD', 'SSLCOMMERZ']).optional(),
  sortBy: z.enum(['newest', 'oldest', 'totalAsc', 'totalDesc']).default('newest'),
});

export type AdminOrderQuery = z.infer<typeof adminOrderQuerySchema>;

export const updateOrderStatusInputSchema = z.object({
  status: z.enum(['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED']),
  reason: z.string().trim().min(1, 'Reason is required').max(500),
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusInputSchema>;

export const cancelAdminOrderInputSchema = z.object({
  reason: z.string().trim().min(1, 'Cancellation reason is required').max(500),
});

export type CancelAdminOrderInput = z.infer<typeof cancelAdminOrderInputSchema>;

export const markCodPaidInputSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export type MarkCodPaidInput = z.infer<typeof markCodPaidInputSchema>;
