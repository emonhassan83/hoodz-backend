import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Product } from '@/app/modules/product/product.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import { WISHLIST_MODEL_TYPE } from '@/app/modules/wishlist/wishlist.constant';
import { TWishlistModelType } from '@/app/modules/wishlist/wishlist.interface';
import { Wishlist } from '@/app/modules/wishlist/wishlist.model';

export const productWishlistMatch = (userId: string) => ({
  user: userId,
  modelType: WISHLIST_MODEL_TYPE.product,
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
  user: userId,
  modelType,
  reference: referenceId,
});

export const findWishlistItem = (
  userId: string,
  modelType: TWishlistModelType,
  referenceId: string
) => Wishlist.findOne(wishlistItemMatch(userId, modelType, referenceId));

export const getWishlistProductReferenceIds = async (userId: string) => {
  const items = await Wishlist.find(productWishlistMatch(userId))
    .select('reference -_id')
    .lean();

  return items
    .map((item) => getWishlistItemReferenceId(item))
    .filter((id): id is string => Boolean(id));
};

export const isShopWishlisted = async (userId: string | undefined, shopId: string) => {
  if (!userId) return false;

  return Boolean(
    await Wishlist.exists({
      user: userId,
      modelType: WISHLIST_MODEL_TYPE.shop,
      reference: shopId,
    })
  );
};
