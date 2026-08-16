import { Product } from '@/app/modules/product/product.model';
import { WISHLIST_MODEL_TYPE } from '@/app/modules/wishlist/wishlist.constant';
import {
  assertWishlistReferenceExists,
  findWishlistItem,
  getWishlistProductReferenceIds,
  wishlistItemMatch,
} from '@/app/modules/wishlist/wishlist.helpers';
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
  removeWishlistProduct,
  syncWishlistProductIds,
} from '@/app/redis/helpers/wishlist';
import { REDIS_KEYS } from '@/app/redis/keys';

/** Invalidates wishlist and user-personalized product caches. */
const invalidateWishlistCaches = async (userId: string, productId?: string) => {
  await Promise.all([
    deleteCache(REDIS_KEYS.WISHLIST_PRODUCTS(userId)),
    productId ? deleteCache(REDIS_KEYS.PRODUCT_SINGLE(productId, userId)) : Promise.resolve(),
    deleteCachePattern('product:*'),
  ]);
};

/** Loads product wishlist ids from Redis and hydrates Redis from MongoDB on cache miss. */
const getWishlistIds = async (userId: string) => {
  const redisProductIds = await getWishlistProductIds(userId);
  if (redisProductIds.length > 0) return redisProductIds;

  const dbProductIds = await getWishlistProductReferenceIds(userId);
  await syncWishlistProductIds(userId, dbProductIds);
  return dbProductIds;
};

/** Toggles a shop or product inside the user's wishlist. */
const toggle = async (
  traceId: string,
  userId: string,
  payload: TWishlistTogglePayload
) => {
  const modelType = payload.modelType ?? WISHLIST_MODEL_TYPE.product;
  const referenceId = payload.referenceId;
  await assertWishlistReferenceExists(traceId, modelType, referenceId);

  const existing = await findWishlistItem(userId, modelType, referenceId);
  if (existing) {
    await Promise.all([
      Wishlist.deleteMany(wishlistItemMatch(userId, modelType, referenceId)),
      modelType === WISHLIST_MODEL_TYPE.product
        ? removeWishlistProduct(userId, referenceId)
        : Promise.resolve(),
      invalidateWishlistCaches(
        userId,
        modelType === WISHLIST_MODEL_TYPE.product ? referenceId : undefined
      ),
    ]);
    return { modelType, referenceId, added: false };
  }

  await Promise.all([
    Wishlist.updateOne(
      { user: userId, modelType, reference: referenceId },
      {
        user: userId,
        modelType,
        reference: referenceId,
      },
      { upsert: true }
    ),
    modelType === WISHLIST_MODEL_TYPE.product
      ? addWishlistProduct(userId, referenceId)
      : Promise.resolve(),
    invalidateWishlistCaches(
      userId,
      modelType === WISHLIST_MODEL_TYPE.product ? referenceId : undefined
    ),
  ]);
  return { modelType, referenceId, added: true };
};

/** Returns wishlist products with frontend-ready basic product details. */
const getAll = async (userId: string) => {
  const cacheKey = REDIS_KEYS.WISHLIST_PRODUCTS(userId);
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const productIds = await getWishlistIds(userId);
  if (productIds.length === 0) return [];

  const products = await Product.find({ _id: { $in: productIds }, isDeleted: false })
    .select('title price discountPrice images stock')
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
