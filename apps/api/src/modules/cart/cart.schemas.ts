import { z } from 'zod';

export const addToCartSchema = z.object({
  variantId: z.string().trim().min(1, 'Variant ID is required'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').default(1),
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
});

export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export const estimateShippingSchema = z
  .object({
    district: z.string().trim().min(1, 'District is required').optional(),
    addressId: z.string().trim().min(1, 'Address ID is required').optional(),
  })
  .refine((data) => Boolean(data.district || data.addressId), {
    message: 'Either district or addressId must be provided',
  });

export type EstimateShippingInput = z.infer<typeof estimateShippingSchema>;
