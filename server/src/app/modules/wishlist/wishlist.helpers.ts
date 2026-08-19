import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { Product } from '@/app/modules/product/product.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import { WISHLIST_MODEL_TYPE } from '@/app/modules/wishlist/wishlist.constant';
import { TWishlistModelType } from '@/app/modules/wishlist/wishlist.interface';
import { Wishlist } from '@/app/modules/wishlist/wishlist.model';

export const toObjectId = (id: string) => new Types.ObjectId(id);

export const productWishlistMatch = (userId: string) => ({
  user: toObjectId(userId),
  $or: [
    { modelType: WISHLIST_MODEL_TYPE.product },
    { modelType: { $exists: false } },
    { modelType: null },
  ],
});

export const getWishlistItemReferenceId = (item: {
  reference?: { toString(): string } | null;
}) => item.reference?.toString();

/** Ensures wishlist only stores active product or shop ids. */
export const assertWishlistReferenceExists = async (
  traceId: string,
  modelType: TWishlistModelType,
  referenceId: string
) => {
  if (modelType === WISHLIST_MODEL_TYPE.shop) {
    const shop = await User.exists({
      _id: referenceId,
      role: USER_ROLE.vendor,
      isDeleted: false,
    });
    if (!shop) {
      throw new ApiError(HttpStatusCode.NotFound, 'Shop not found', traceId);
    }
    return;
  }

  const product = await Product.exists({ _id: referenceId, isDeleted: false });
  if (!product) {
    throw new ApiError(HttpStatusCode.NotFound, 'Product not found', traceId);
  }
};

export const wishlistItemMatch = (
  userId: string,
  modelType: TWishlistModelType,
  referenceId: string
) => ({
  user: toObjectId(userId),
  modelType,
  reference: toObjectId(referenceId),
});

export const findWishlistItem = (
  userId: string,
  modelType: TWishlistModelType,
  referenceId: string
) =>
  Wishlist.findOne({
    user: toObjectId(userId),
    reference: toObjectId(referenceId),
    ...(modelType === WISHLIST_MODEL_TYPE.shop
      ? { modelType: WISHLIST_MODEL_TYPE.shop }
      : {
          $or: [
            { modelType: WISHLIST_MODEL_TYPE.product },
            { modelType: { $exists: false } },
            { modelType: null },
          ],
        }),
  });

export const getWishlistProductItems = async (userId: string) =>
  Wishlist.find(productWishlistMatch(userId))
    .select('_id reference')
    .sort({ createdAt: -1 })
    .lean();

export const getWishlistProductReferenceIds = async (userId: string) => {
  const items = await getWishlistProductItems(userId);
  return items
    .map((item) => getWishlistItemReferenceId(item))
    .filter((id): id is string => Boolean(id));
};

let wishlistIndexesReady = false;

/** Drops a leftover unique-on-user index so one user can wishlist many products. */
export const ensureWishlistIndexes = async () => {
  if (wishlistIndexesReady) return;

  const indexes = await Wishlist.collection.indexes();
  const uniqueUserOnly = indexes.find(
    (index) =>
      Boolean(index.unique) &&
      index.key?.user === 1 &&
      Object.keys(index.key).length === 1
  );
  if (uniqueUserOnly?.name) {
    await Wishlist.collection.dropIndex(uniqueUserOnly.name);
  }
  await Wishlist.syncIndexes();
  wishlistIndexesReady = true;
};

export const isShopWishlisted = async (userId: string | undefined, shopId: string) => {
  if (!userId || !Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(shopId)) {
    return false;
  }

  return Boolean(
    await Wishlist.exists({
      user: new Types.ObjectId(userId),
      modelType: WISHLIST_MODEL_TYPE.shop,
      reference: new Types.ObjectId(shopId),
    })
  );
};
