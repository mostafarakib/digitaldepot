import { z } from 'zod';

export const updateStoreSettingsSchema = z
  .object({
    insideDhakaShippingFee: z
      .number()
      .int()
      .min(0, 'Inside Dhaka shipping fee must be non-negative'),
    outsideDhakaShippingFee: z
      .number()
      .int()
      .min(0, 'Outside Dhaka shipping fee must be non-negative'),
    freeShippingThreshold: z.number().int().min(0, 'Free shipping threshold must be non-negative'),
    estimatedDaysInsideDhakaMin: z
      .number()
      .int()
      .min(1, 'Minimum days must be at least 1')
      .max(30, 'Days cannot exceed 30'),
    estimatedDaysInsideDhakaMax: z
      .number()
      .int()
      .min(1, 'Maximum days must be at least 1')
      .max(30, 'Days cannot exceed 30'),
    estimatedDaysOutsideDhakaMin: z
      .number()
      .int()
      .min(1, 'Minimum days must be at least 1')
      .max(30, 'Days cannot exceed 30'),
    estimatedDaysOutsideDhakaMax: z
      .number()
      .int()
      .min(1, 'Maximum days must be at least 1')
      .max(30, 'Days cannot exceed 30'),
    storeName: z
      .string()
      .trim()
      .min(1, 'Store name is required')
      .max(100, 'Store name cannot exceed 100 characters'),
    supportEmail: z.string().trim().email('Invalid support email address'),
    supportPhone: z
      .string()
      .trim()
      .max(25, 'Support phone cannot exceed 25 characters')
      .nullable()
      .optional(),
    supportHours: z
      .string()
      .trim()
      .max(100, 'Support hours cannot exceed 100 characters')
      .nullable()
      .optional(),
    storeAddress: z
      .string()
      .trim()
      .max(255, 'Store address cannot exceed 255 characters')
      .nullable()
      .optional(),
  })
  .refine((data) => data.estimatedDaysInsideDhakaMax >= data.estimatedDaysInsideDhakaMin, {
    message: 'Inside Dhaka maximum days must be greater than or equal to minimum days',
    path: ['estimatedDaysInsideDhakaMax'],
  })
  .refine((data) => data.estimatedDaysOutsideDhakaMax >= data.estimatedDaysOutsideDhakaMin, {
    message: 'Outside Dhaka maximum days must be greater than or equal to minimum days',
    path: ['estimatedDaysOutsideDhakaMax'],
  });

export type UpdateStoreSettingsInput = z.infer<typeof updateStoreSettingsSchema>;

export interface PublicStoreSettings {
  storeName: string;
  supportEmail: string;
  supportPhone: string | null;
  supportHours: string | null;
  storeAddress: string | null;
  insideDhakaShippingFee: number;
  outsideDhakaShippingFee: number;
  freeShippingThreshold: number;
  estimatedDaysInsideDhakaMin: number;
  estimatedDaysInsideDhakaMax: number;
  estimatedDaysOutsideDhakaMin: number;
  estimatedDaysOutsideDhakaMax: number;
}

export interface AdminStoreSettings extends PublicStoreSettings {
  id: string;
  updatedByUserId: string | null;
  updatedByUser: {
    id: string;
    email: string;
    name: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}
