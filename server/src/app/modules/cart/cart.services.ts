import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import {
  assertVariantStock,
  buildCartItemMatch,
  buildCartItem,
  clearCart,
  findProductVariantOrThrow,
  getCartItemsOrEmpty,
  isSameCartItem,
  syncCartCacheFromMongo,
} from '@/app/modules/cart/cart.helpers';
import { Cart } from '@/app/modules/cart/cart.model';
import {
  TAddCartItemPayload,
  TEnrichedCartItem,
  TRemoveCartItemPayload,
  TUpdateCartItemPayload,
} from '@/app/modules/cart/cart.types';
import { Product } from '@/app/modules/product/product.model';
import { getCartItemsFromCache } from '@/app/redis/helpers/cart';

/** Adds a product variant to cart or increments quantity if it already exists. */
const add = async (
  traceId: string,
  userId: string,
  payload: TAddCartItemPayload
) => {
  const { product, variant } = await findProductVariantOrThrow(
    traceId,
    payload.productId,
    payload
  );

  const cart = await Cart.findOne({ userId }).lean();
  const existingItem = cart?.items.find(
    (item) => isSameCartItem(item, payload)
  );
  const nextQuantity = (existingItem?.quantity ?? 0) + payload.quantity;
  assertVariantStock(traceId, variant.quantity, nextQuantity);

  if (existingItem) {
    await Cart.updateOne(
      {
        userId,
        items: {
          $elemMatch: buildCartItemMatch(payload),
        },
      },
      { $inc: { 'items.$.quantity': payload.quantity } }
    );
  } else {
    await Cart.findOneAndUpdate(
      { userId },
      {
        $push: {
          items: buildCartItem(
            product._id.toString(),
            variant,
            payload.quantity
          ),
        },
      },
      { upsert: true, returnDocument: 'after' }
    );
  }

  await syncCartCacheFromMongo(userId);
  return getCart(userId);
};

/** Updates the quantity of an existing cart item. */
const update = async (
  traceId: string,
  userId: string,
  payload: TUpdateCartItemPayload
) => {
  const cart = await Cart.findOne({ userId });
  const item = cart?.items.find((cartItem) => isSameCartItem(cartItem, payload));
  if (!item) {
    throw new ApiError(HttpStatusCode.NotFound, 'Cart item not found', traceId);
  }

  const { variant } = await findProductVariantOrThrow(
    traceId,
    payload.productId,
    payload
  );
  assertVariantStock(traceId, variant.quantity, payload.quantity);

  await Cart.updateOne(
      {
        userId,
        items: {
          $elemMatch: buildCartItemMatch(payload),
        },
      },
    { $set: { 'items.$.quantity': payload.quantity } }
  );

  await syncCartCacheFromMongo(userId);
  return getCart(userId);
};

/** Removes a product variant from the user's cart. */
const remove = async (
  _traceId: string,
  userId: string,
  payload: TRemoveCartItemPayload
) => {
  await Cart.updateOne(
    { userId },
    {
      $pull: {
        items: buildCartItemMatch(payload),
      },
    }
  );

  await syncCartCacheFromMongo(userId);
  return getCart(userId);
};

/** Returns cart items enriched with latest product price and media details. */
const getCart = async (userId: string) => {
  let items = await getCartItemsFromCache(userId);
  if (items.length === 0) {
    items = await getCartItemsOrEmpty(userId);
  }

  if (items.length === 0) {
    return {
      items: [],
      totalItems: 0,
      subTotal: 0,
    };
  }

  const products = await Product.find({
    _id: { $in: items.map((item) => item.productId) },
    isDeleted: false,
  })
    .select('vendorId title images inventoryType price discountPrice variants')
    .lean();

  const productById = new Map(
    products.map((product) => [product._id.toString(), product])
  );

  const enrichedItems = items
    .map((item) => {
      const product = productById.get(item.productId.toString());
      if (!product) return null;

      const unitPrice = product.discountPrice || product.price;
      return {
        productId: item.productId,
        size: item.size ?? null,
        color: item.color ?? null,
        quantity: item.quantity,
        product: {
          _id: product._id,
          vendorId: product.vendorId,
          title: product.title,
          images: product.images,
          inventoryType: product.inventoryType,
          price: product.price,
          discountPrice: product.discountPrice,
        },
        unitPrice,
        totalPrice: Number((unitPrice * item.quantity).toFixed(2)),
      };
    })
    .filter(Boolean) as TEnrichedCartItem[];

  const subTotal = enrichedItems.reduce(
    (total, item) => total + item.totalPrice,
    0
  );

  return {
    items: enrichedItems,
    totalItems: enrichedItems.reduce((total, item) => total + item.quantity, 0),
    subTotal: Number(subTotal.toFixed(2)),
  };
};

/** Clears all items from the user's cart. */
const clear = async (userId: string) => {
  await clearCart(userId);
  return {
    items: [],
    totalItems: 0,
    subTotal: 0,
  };
};

export const CartService = {
  add,
  update,
  remove,
  getCart,
  clear,
};

