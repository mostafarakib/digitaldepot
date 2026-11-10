import { z } from 'zod';

export const inventoryAdjustmentTypeSchema = z.enum([
  'RECEIVE',
  'CORRECTION',
  'DAMAGE',
  'THEFT_LOSS',
  'RETURN_RESTOCK',
]);

export const adjustStockSchema = z
  .object({
    variantId: z.string().min(1, 'Variant ID is required'),
    type: inventoryAdjustmentTypeSchema,
    quantityDelta: z.number().int('Quantity delta must be an integer'),
    reason: z
      .string()
      .trim()
      .min(3, 'Reason must be at least 3 characters')
      .max(500, 'Reason must not exceed 500 characters'),
  })
  .superRefine((data, ctx) => {
    if (data.quantityDelta === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantityDelta'],
        message: 'Adjustment delta cannot be zero',
      });
      return;
    }

    if (data.type === 'RECEIVE' && data.quantityDelta <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantityDelta'],
        message: 'RECEIVE adjustments require a positive quantity delta',
      });
    }

    if (data.type === 'RETURN_RESTOCK' && data.quantityDelta <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantityDelta'],
        message: 'RETURN_RESTOCK adjustments require a positive quantity delta',
      });
    }

    if (data.type === 'DAMAGE' && data.quantityDelta >= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantityDelta'],
        message: 'DAMAGE adjustments require a negative quantity delta',
      });
    }

    if (data.type === 'THEFT_LOSS' && data.quantityDelta >= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantityDelta'],
        message: 'THEFT_LOSS adjustments require a negative quantity delta',
      });
    }
  });

export const updateThresholdSchema = z.object({
  lowStockThreshold: z
    .number()
    .int('Low stock threshold must be an integer')
    .min(0, 'Threshold must be non-negative')
    .nullable(),
});

export const inventoryFilterSchema = z.object({
  search: z.string().trim().optional(),
  categoryId: z.string().trim().optional(),
  stockStatus: z.enum(['all', 'in_stock', 'low_stock', 'out_of_stock']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z
    .enum(['stock_asc', 'stock_desc', 'name_asc', 'sku_asc', 'updated_at_desc'])
    .default('updated_at_desc'),
});

export const inventoryHistoryFilterSchema = z.object({
  type: inventoryAdjustmentTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;
export type InventoryFilterInput = z.infer<typeof inventoryFilterSchema>;
export type InventoryHistoryFilterInput = z.infer<typeof inventoryHistoryFilterSchema>;
