import { Product } from '@/app/modules/product/product.model';
import { assertWishlistProductExists } from '@/app/modules/wishlist/wishlist.helpers';
import { Wishlist } from '@/app/modules/wishlist/wishlist.model';
import { TWishlistTogglePayload } from '@/app/modules/wishlist/wishlist.types';
import {
  deleteCache,
  deleteCachePattern,
  getCache,
  setCache,
} from '@/app/redis/helpers';
import {
  addWishlistProduct,
  getWishlistProductIds,
  isWishlistProduct,
  removeWishlistProduct,
  syncWishlistProductIds,
} from '@/app/redis/helpers/wishlist';
import { REDIS_KEYS } from '@/app/redis/keys';

/** Invalidates wishlist and user-personalized product caches. */
const invalidateWishlistCaches = async (userId: string, productId: string) => {
  await Promise.all([
    deleteCache(REDIS_KEYS.WISHLIST_PRODUCTS(userId)),
    deleteCache(REDIS_KEYS.PRODUCT_SINGLE(productId, userId)),
    deleteCachePattern('product:*'),
  ]);
};

/** Loads wishlist ids from Redis and hydrates Redis from MongoDB on cache miss. */
const getWishlistIds = async (userId: string) => {
  const redisProductIds = await getWishlistProductIds(userId);
  if (redisProductIds.length > 0) return redisProductIds;

  const dbProductIds = (
    await Wishlist.find({ user: userId }).select('product -_id').lean()
  ).map((item) => item.product.toString());

  await syncWishlistProductIds(userId, dbProductIds);
  return dbProductIds;
};

/** Toggles a product id inside the user's Redis wishlist set. */
const toggle = async (
  traceId: string,
  userId: string,
  payload: TWishlistTogglePayload
) => {
  await assertWishlistProductExists(traceId, payload.productId);

  const alreadyAdded = await isWishlistProduct(userId, payload.productId);
  if (alreadyAdded) {
    await Promise.all([
      Wishlist.deleteOne({ user: userId, product: payload.productId }),
      removeWishlistProduct(userId, payload.productId),
      invalidateWishlistCaches(userId, payload.productId),
    ]);
    return { productId: payload.productId, added: false };
  }

  await Promise.all([
    Wishlist.updateOne(
      { user: userId, product: payload.productId },
      { user: userId, product: payload.productId },
      { upsert: true }
    ),
    addWishlistProduct(userId, payload.productId),
    invalidateWishlistCaches(userId, payload.productId),
  ]);
  return { productId: payload.productId, added: true };
};

/** Returns wishlist products with frontend-ready basic product details. */
const getAll = async (userId: string) => {
  const cacheKey = REDIS_KEYS.WISHLIST_PRODUCTS(userId);
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const productIds = await getWishlistIds(userId);
  if (productIds.length === 0) return [];

  const products = await Product.find({ _id: { $in: productIds }, isDeleted: false })
    .select('title price discountPrice images stock brand')
    .lean();

  const productById = new Map(
    products.map((product) => [product._id.toString(), product])
  );
  const orderedProducts = productIds
    .map((productId) => productById.get(productId))
    .filter(Boolean);

  await setCache(cacheKey, orderedProducts, 300);
  return orderedProducts;
};

export const WishlistService = {
  toggle,
  getAll,
};

