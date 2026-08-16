import { z } from 'zod';

import { WISHLIST_MODEL_TYPE } from '@/app/modules/wishlist/wishlist.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const toggleWishlistValidationSchema = z.object({
  params: z.object({
    productId: objectIdSchema,
  }),
  body: z
    .object({
      modelType: z
        .enum([WISHLIST_MODEL_TYPE.product, WISHLIST_MODEL_TYPE.shop])
        .optional(),
    })
    .optional(),
});

export const WishlistValidation = {
  toggleWishlistValidationSchema,
};
