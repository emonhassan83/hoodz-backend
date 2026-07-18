import { Product } from '@/app/modules/product/product.model';
import { assertWishlistProductExists } from '@/app/modules/wishlist/wishlist.helpers';
import { TWishlistTogglePayload } from '@/app/modules/wishlist/wishlist.types';
import {
  addWishlistProduct,
  getWishlistProductIds,
  isWishlistProduct,
  removeWishlistProduct,
} from '@/app/redis/helpers/wishlist';

/** Toggles a product id inside the user's Redis wishlist set. */
const toggle = async (
  traceId: string,
  userId: string,
  payload: TWishlistTogglePayload
) => {
  await assertWishlistProductExists(traceId, payload.productId);

  const alreadyAdded = await isWishlistProduct(userId, payload.productId);
  if (alreadyAdded) {
    await removeWishlistProduct(userId, payload.productId);
    return { productId: payload.productId, added: false };
  }

  await addWishlistProduct(userId, payload.productId);
  return { productId: payload.productId, added: true };
};

/** Returns wishlist products with frontend-ready basic product details. */
const getAll = async (userId: string) => {
  const productIds = await getWishlistProductIds(userId);
  if (productIds.length === 0) return [];

  return Product.find({ _id: { $in: productIds }, isDeleted: false })
    .select('title price discountPrice images stock')
    .lean();
};

/** Checks if a product is already saved in the user's wishlist set. */
const check = async (userId: string, productId: string) => ({
  productId,
  added: await isWishlistProduct(userId, productId),
});

export const WishlistService = {
  toggle,
  getAll,
  check,
};
