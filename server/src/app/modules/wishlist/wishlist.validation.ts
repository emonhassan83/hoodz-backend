import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const toggleWishlistValidationSchema = z.object({
  body: z.object({
    productId: objectIdSchema,
  }),
});

export const WishlistValidation = {
  toggleWishlistValidationSchema,
};
