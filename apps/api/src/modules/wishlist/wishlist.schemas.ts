import { z } from 'zod';

export const addToWishlistSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
});

export type AddToWishlistInput = z.infer<typeof addToWishlistSchema>;
