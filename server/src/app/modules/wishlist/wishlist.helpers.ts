import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Product } from '@/app/modules/product/product.model';

/** Ensures wishlist only stores active product ids. */
export const assertWishlistProductExists = async (
  traceId: string,
  productId: string
) => {
  const exists = await Product.exists({ _id: productId, isDeleted: false });
  if (!exists) {
    throw new ApiError(HttpStatusCode.NotFound, 'Product not found', traceId);
  }
};

