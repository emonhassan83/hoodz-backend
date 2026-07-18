import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { Cart } from '@/app/modules/cart/cart.model';
import {
  TCartItem,
  TCartItemIdentity,
  TCartColor,
} from '@/app/modules/cart/cart.types';
import { Product } from '@/app/modules/product/product.model';
import { clearCartCache, syncCartItemsToCache } from '@/app/redis/helpers/cart';

/** Finds a product variant by size and color or throws a traceable API error. */
export const findProductVariantOrThrow = async (
  traceId: string,
  productId: string,
  payload: Pick<TCartItemIdentity, 'size' | 'color'>
) => {
  const product = await Product.findOne({ _id: productId, isDeleted: false });
  if (!product) {
    throw new ApiError(HttpStatusCode.NotFound, 'Product not found', traceId);
  }

  const variant = product.variants.find(
    (item) =>
      item.size === payload.size &&
      item.color.code === payload.color.code
  );
  if (!variant) {
    throw new ApiError(HttpStatusCode.NotFound, 'Product variant not found', traceId);
  }

  return { product, variant };
};

/** Ensures requested cart quantity does not exceed the variant stock. */
export const assertVariantStock = (
  traceId: string,
  availableQuantity: number,
  requestedQuantity: number
) => {
  if (requestedQuantity > availableQuantity) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Requested quantity exceeds available stock',
      traceId
    );
  }
};

/** Builds the MongoDB cart item payload from a resolved product variant. */
export const buildCartItem = (
  productId: string,
  variant: { size: string; color: TCartColor },
  quantity: number
): TCartItem => ({
  productId: new Types.ObjectId(productId),
  size: variant.size,
  color: variant.color,
  quantity,
});

/** Checks if a stored cart item matches the incoming product, size, and color. */
export const isSameCartItem = (
  item: Pick<TCartItem, 'productId' | 'size' | 'color'>,
  payload: TCartItemIdentity
) =>
  item.productId.toString() === payload.productId &&
  item.size === payload.size &&
  item.color.code === payload.color.code;

/** Returns existing cart items or an empty list for new carts. */
export const getCartItemsOrEmpty = async (userId: string) => {
  const cart = await Cart.findOne({ userId }).lean();
  return cart?.items ?? [];
};

/** Refreshes Redis cart cache from the current MongoDB cart document. */
export const syncCartCacheFromMongo = async (userId: string) => {
  const items = await getCartItemsOrEmpty(userId);
  await syncCartItemsToCache(userId, items);
};

/** Clears a user's cart from both MongoDB and Redis cache. */
export const clearCart = async (userId: string) => {
  await Cart.findOneAndUpdate({ userId }, { items: [] }, { upsert: true });
  await clearCartCache(userId);
};
