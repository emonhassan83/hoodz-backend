import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { TCartItem } from '@/app/modules/cart/cart.interface';
import { Cart } from '@/app/modules/cart/cart.model';
import { Product } from '@/app/modules/product/product.model';
import { clearCartCache, syncCartItemsToCache } from '@/app/redis/helpers/cart';

export const findProductVariantOrThrow = async (
  traceId: string,
  productId: string,
  payload: { size: string; color: { code: string; name: string } }
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

export const buildCartItem = (
  productId: string,
  variant: { size: string; color: { code: string; name: string } },
  quantity: number
): TCartItem => ({
  productId: new Types.ObjectId(productId),
  size: variant.size,
  color: variant.color,
  quantity,
});

export const isSameCartItem = (
  item: { productId: any; size: string; color: { code: string } },
  payload: { productId: string; size: string; color: { code: string } }
) =>
  item.productId.toString() === payload.productId &&
  item.size === payload.size &&
  item.color.code === payload.color.code;

export const getCartItemsOrEmpty = async (userId: string) => {
  const cart = await Cart.findOne({ userId }).lean();
  return cart?.items ?? [];
};

export const syncCartCacheFromMongo = async (userId: string) => {
  const items = await getCartItemsOrEmpty(userId);
  await syncCartItemsToCache(userId, items);
};

export const clearCart = async (userId: string) => {
  await Cart.findOneAndUpdate({ userId }, { items: [] }, { upsert: true });
  await clearCartCache(userId);
};
