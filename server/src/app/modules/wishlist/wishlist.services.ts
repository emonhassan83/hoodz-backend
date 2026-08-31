import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Product } from '@/app/modules/product/product.model';
import { WISHLIST_MODEL_TYPE } from '@/app/modules/wishlist/wishlist.constant';
import {
  assertWishlistReferenceExists,
  ensureWishlistIndexes,
  findWishlistItem,
  getWishlistItemReferenceId,
  getWishlistProductItems,
  wishlistItemMatch,
} from '@/app/modules/wishlist/wishlist.helpers';
import { Wishlist } from '@/app/modules/wishlist/wishlist.model';
import { TWishlistTogglePayload } from '@/app/modules/wishlist/wishlist.types';
import { deleteCache, deleteCachePattern } from '@/app/redis/helpers';
import {
  addWishlistProduct,
  removeWishlistProduct,
} from '@/app/redis/helpers/wishlist';
import { REDIS_KEYS } from '@/app/redis/keys';

/** Invalidates wishlist and user-personalized product caches. */
const invalidateWishlistCaches = async (userId: string, productId?: string) => {
  await Promise.all([
    deleteCache(REDIS_KEYS.WISHLIST(userId)),
    deleteCache(REDIS_KEYS.WISHLIST_PRODUCTS(userId)),
    productId
      ? deleteCache(REDIS_KEYS.PRODUCT_SINGLE(productId, userId))
      : Promise.resolve(),
    deleteCachePattern('product:*'),
  ]);
};

const formatWishlistProduct = (product: {
  _id: unknown;
  title: string;
  banner?: string | null;
  inventoryType: string;
  price: number;
  discount: number;
  discountPrice: number;
  stock: number;
  variants?: Array<{
    _id?: unknown;
    size?: string | null;
    color?: { code: string; name: string } | null;
    quantity: number;
  }>;
}) => ({
  _id: product._id,
  title: product.title,
  banner: product.banner ?? null,
  inventoryType: product.inventoryType,
  price: product.price,
  discount: product.discount,
  discountPrice: product.discountPrice,
  stock: product.stock,
  variants: product.variants ?? [],
});

/** Toggles a shop or product inside the user's wishlist. */
const toggle = async (
  traceId: string,
  userId: string,
  payload: TWishlistTogglePayload
) => {
  await ensureWishlistIndexes();
  const modelType = payload.modelType ?? WISHLIST_MODEL_TYPE.product;
  const referenceId = payload.referenceId;
  await assertWishlistReferenceExists(traceId, modelType, referenceId);

  const existing = await findWishlistItem(userId, modelType, referenceId);
  if (existing) {
    await existing.deleteOne();
    await Promise.all([
      modelType === WISHLIST_MODEL_TYPE.shop
        ? Promise.resolve()
        : removeWishlistProduct(userId, referenceId),
      invalidateWishlistCaches(
        userId,
        modelType === WISHLIST_MODEL_TYPE.product ? referenceId : undefined
      ),
    ]);
    return {
      _id: existing._id,
      modelType,
      referenceId,
      added: false,
    };
  }

  try {
    const created = await Wishlist.create(
      wishlistItemMatch(userId, modelType, referenceId)
    );
    await Promise.all([
      modelType === WISHLIST_MODEL_TYPE.shop
        ? Promise.resolve()
        : addWishlistProduct(userId, referenceId),
      invalidateWishlistCaches(
        userId,
        modelType === WISHLIST_MODEL_TYPE.product ? referenceId : undefined
      ),
    ]);
    return {
      _id: created._id,
      modelType,
      referenceId,
      added: true,
    };
  } catch (error) {
    const duplicate = (error as { code?: number }).code === 11000;
    if (!duplicate) throw error;

    const duplicateItem = await findWishlistItem(userId, modelType, referenceId);
    if (duplicateItem) {
      return {
        _id: duplicateItem._id,
        modelType,
        referenceId,
        added: true,
      };
    }

    throw new ApiError(
      HttpStatusCode.Conflict,
      'Unable to add this item to wishlist',
      traceId
    );
  }
};

/** Returns only product wishlist items for the current user. */
const getAll = async (userId: string) => {
  await ensureWishlistIndexes();
  const items = await getWishlistProductItems(userId);
  if (items.length === 0) return [];

  const productIds = items
    .map((item) => getWishlistItemReferenceId(item))
    .filter((id): id is string => Boolean(id));

  const products = await Product.find({
    _id: { $in: productIds },
    isDeleted: false,
  })
    .select('title banner inventoryType price discount discountPrice stock variants')
    .lean();

  const productById = new Map(
    products.map((product) => [product._id.toString(), product])
  );

  return items
    .map((item) => {
      const productId = getWishlistItemReferenceId(item);
      const product = productId ? productById.get(productId) : null;
      if (!product) return null;
      return {
        _id: item._id,
        modelType: WISHLIST_MODEL_TYPE.product,
        product: formatWishlistProduct(product),
      };
    })
    .filter(Boolean);
};

/** Removes one wishlist row by its document id. */
const remove = async (traceId: string, userId: string, wishlistId: string) => {
  const item = await Wishlist.findOne({
    _id: wishlistId,
    user: userId,
  });
  if (!item) {
    throw new ApiError(HttpStatusCode.NotFound, 'Wishlist item not found', traceId);
  }

  await item.deleteOne();
  const referenceId = item.reference.toString();
  await Promise.all([
    item.modelType === WISHLIST_MODEL_TYPE.shop
      ? Promise.resolve()
      : removeWishlistProduct(userId, referenceId),
    invalidateWishlistCaches(
      userId,
      item.modelType === WISHLIST_MODEL_TYPE.shop ? undefined : referenceId
    ),
  ]);

  return {
    _id: item._id,
    modelType: item.modelType,
    referenceId,
    removed: true,
  };
};

export const WishlistService = {
  toggle,
  getAll,
  remove,
};
