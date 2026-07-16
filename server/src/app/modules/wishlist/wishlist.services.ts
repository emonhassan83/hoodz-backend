import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Product } from '@/app/modules/product/product.model';
import {
  addWishlistProduct,
  getWishlistProductIds,
  isWishlistProduct,
  removeWishlistProduct,
} from '@/app/redis/helpers/wishlist';

const assertProductExists = async (traceId: string, productId: string) => {
  const exists = await Product.exists({ _id: productId, isDeleted: false });
  if (!exists) {
    throw new ApiError(HttpStatusCode.NotFound, 'Product not found', traceId);
  }
};

const toggle = async (
  traceId: string,
  userId: string,
  payload: { productId: string }
) => {
  await assertProductExists(traceId, payload.productId);

  const alreadyAdded = await isWishlistProduct(userId, payload.productId);
  if (alreadyAdded) {
    await removeWishlistProduct(userId, payload.productId);
    return { productId: payload.productId, added: false };
  }

  await addWishlistProduct(userId, payload.productId);
  return { productId: payload.productId, added: true };
};

const getAll = async (userId: string) => {
  const productIds = await getWishlistProductIds(userId);
  if (productIds.length === 0) return [];

  return Product.find({ _id: { $in: productIds }, isDeleted: false })
    .select('title price discountPrice images stock')
    .lean();
};

const check = async (userId: string, productId: string) => ({
  productId,
  added: await isWishlistProduct(userId, productId),
});

export const WishlistService = {
  toggle,
  getAll,
  check,
};
