import { z } from 'zod';
import { ReturnRequestStatus, ReturnItemCondition } from '../../generated/client/client.js';

export const returnItemInputSchema = z.object({
  orderItemId: z.string().min(1, 'Order item ID is required'),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  reason: z.string().min(1).max(255).optional(),
});

export const createReturnSchema = z.object({
  customerReason: z
    .string()
    .min(1, 'Customer reason is required')
    .max(120, 'Customer reason cannot exceed 120 characters'),
  customerNotes: z.string().max(1000, 'Customer notes cannot exceed 1000 characters').optional(),
  items: z
    .array(returnItemInputSchema)
    .min(1, 'At least one item must be specified for return')
    .max(50, 'Cannot return more than 50 distinct items in a single request'),
});

export const cancelReturnSchema = z
  .object({
    reason: z.string().max(255, 'Cancellation reason cannot exceed 255 characters').optional(),
  })
  .default({});

export const customerReturnListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.nativeEnum(ReturnRequestStatus).optional(),
});

export const adminReturnListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.nativeEnum(ReturnRequestStatus).optional(),
  orderNumber: z.string().trim().max(50).optional(),
  returnNumber: z.string().trim().max(50).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.enum(['createdAt:desc', 'createdAt:asc']).default('createdAt:desc'),
});

export const adminApproveReturnSchema = z
  .object({
    notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional(),
  })
  .default({});

export const adminRejectReturnSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Rejection reason is required')
    .max(255, 'Rejection reason cannot exceed 255 characters'),
  notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional(),
});

export const adminInspectReturnItemSchema = z.object({
  returnItemId: z.string().min(1, 'Return item ID is required'),
  condition: z.nativeEnum(ReturnItemCondition),
  inspectedQuantity: z
    .number()
    .int()
    .positive('Inspected quantity must be a positive integer')
    .optional(),
  notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional(),
});

export const adminInspectReturnSchema = z.object({
  items: z.array(adminInspectReturnItemSchema).min(1, 'At least one item must be inspected'),
  notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional(),
});

export const adminProcessRefundSchema = z
  .object({
    paymentId: z.string().min(1, 'Target payment ID is required').optional(),
    shippingAmount: z
      .number()
      .int()
      .min(0, 'Shipping amount must be a non-negative integer')
      .optional(),
    shippingRefundReason: z
      .string()
      .max(500, 'Shipping refund reason cannot exceed 500 characters')
      .optional(),
    // COD payout specific fields
    payoutChannel: z.enum(['BKASH', 'NAGAD', 'BANK_TRANSFER', 'CASH']).optional(),
    payoutReference: z
      .string()
      .max(100, 'Payout reference cannot exceed 100 characters')
      .optional(),
    notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional(),
  })
  .refine(
    (data) => {
      if (data.shippingAmount && data.shippingAmount > 0) {
        return !!data.shippingRefundReason && data.shippingRefundReason.trim().length > 0;
      }
      return true;
    },
    {
      message: 'An explicit reason is required when refunding shipping fees',
      path: ['shippingRefundReason'],
    },
  )
  .refine(
    (data) => {
      if (data.payoutChannel && data.payoutChannel !== 'CASH') {
        return !!data.payoutReference && data.payoutReference.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Payout reference is mandatory for non-cash payout channels',
      path: ['payoutReference'],
    },
  );

export type CreateReturnInput = z.infer<typeof createReturnSchema>;
export type CancelReturnInput = z.infer<typeof cancelReturnSchema>;
export type CustomerReturnListQuery = z.infer<typeof customerReturnListQuerySchema>;
export type AdminReturnListQuery = z.infer<typeof adminReturnListQuerySchema>;
export type AdminApproveReturnInput = z.infer<typeof adminApproveReturnSchema>;
export type AdminRejectReturnInput = z.infer<typeof adminRejectReturnSchema>;
export type AdminInspectReturnItemInput = z.infer<typeof adminInspectReturnItemSchema>;
export type AdminInspectReturnInput = z.infer<typeof adminInspectReturnSchema>;
export type AdminProcessRefundInput = z.infer<typeof adminProcessRefundSchema>;
