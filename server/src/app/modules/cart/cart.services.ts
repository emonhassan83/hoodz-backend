import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import {
  assertCartActorExists,
  assertVariantStock,
  buildCartActorFilter,
  buildCartItemMatch,
  buildCartItem,
  clearCart,
  findProductVariantOrThrow,
  getCartActorCacheKey,
  getCartItemsOrEmpty,
  getCartRecommendedProducts,
  isSameCartItem,
  syncCartCacheFromMongo,
} from '@/app/modules/cart/cart.helpers';
import { Cart } from '@/app/modules/cart/cart.model';
import {
  TAddCartItemPayload,
  TCartActor,
  TEnrichedCartItem,
  TRemoveCartItemPayload,
  TUpdateCartItemPayload,
} from '@/app/modules/cart/cart.types';
import { Product } from '@/app/modules/product/product.model';
import {
  clearCartCache,
  getCartItemsFromCache,
} from '@/app/redis/helpers/cart';

/** Adds a product variant to cart or increments quantity if it already exists. */
const add = async (
  traceId: string,
  actor: TCartActor,
  payload: TAddCartItemPayload
) => {
  assertCartActorExists(traceId, actor);
  const { product, variant } = await findProductVariantOrThrow(
    traceId,
    payload.productId,
    payload
  );

  const ownerFilter = buildCartActorFilter(actor);
  const cart = await Cart.findOne(ownerFilter).lean();
  const existingItem = cart?.items.find(
    (item) => isSameCartItem(item, payload)
  );
  const nextQuantity = (existingItem?.quantity ?? 0) + payload.quantity;
  assertVariantStock(traceId, variant.quantity, nextQuantity);

  if (existingItem) {
    await Cart.updateOne(
      {
        ...ownerFilter,
        items: {
          $elemMatch: buildCartItemMatch(payload),
        },
      },
      { $inc: { 'items.$.quantity': payload.quantity } }
    );
  } else {
    await Cart.findOneAndUpdate(
      ownerFilter,
      {
        $setOnInsert: actor,
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

  await syncCartCacheFromMongo(actor);
  return getCart(actor);
};

/** Updates the quantity of an existing cart item. */
const update = async (
  traceId: string,
  actor: TCartActor,
  payload: TUpdateCartItemPayload
) => {
  assertCartActorExists(traceId, actor);
  const ownerFilter = buildCartActorFilter(actor);
  const cart = await Cart.findOne(ownerFilter);
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
        ...ownerFilter,
        items: {
          $elemMatch: buildCartItemMatch(payload),
        },
      },
    { $set: { 'items.$.quantity': payload.quantity } }
  );

  await syncCartCacheFromMongo(actor);
  return getCart(actor);
};

/** Removes a product variant from the user's cart. */
const remove = async (
  traceId: string,
  actor: TCartActor,
  payload: TRemoveCartItemPayload
) => {
  assertCartActorExists(traceId, actor);
  await Cart.updateOne(
    buildCartActorFilter(actor),
    {
      $pull: {
        items: buildCartItemMatch(payload),
      },
    }
  );

  await syncCartCacheFromMongo(actor);
  return getCart(actor);
};

/** Returns cart items enriched with latest product price and media details. */
const getCart = async (actor: TCartActor) => {
  const cacheKey = getCartActorCacheKey(actor);
  let items = await getCartItemsFromCache(cacheKey);
  if (items.length === 0) {
    items = await getCartItemsOrEmpty(actor);
  }

  if (items.length === 0) {
    return {
      items: [],
      totalItems: 0,
      subTotal: 0,
      recommendedProducts: [],
    };
  }

  const products = await Product.find({
    _id: { $in: items.map((item) => item.productId) },
    isDeleted: false,
  })
    .populate([{ path: 'category', select: 'title' }])
    .select(
      'vendor category title images inventoryType collectionType brandType banner price discount discountPrice avgRating ratingCount stock sold variants createdAt'
    )
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
          vendor: product.vendor,
          title: product.title,
          banner: product.banner ?? null,
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
  const recommendedProducts = await getCartRecommendedProducts(
    products,
    new Set(items.map((item) => item.productId.toString()))
  );

  return {
    items: enrichedItems,
    totalItems: enrichedItems.reduce((total, item) => total + item.quantity, 0),
    subTotal: Number(subTotal.toFixed(2)),
    recommendedProducts,
  };
};

/** Clears all items from the current user or guest cart. */
const clear = async (traceId: string, actor: TCartActor) => {
  assertCartActorExists(traceId, actor);
  await clearCart(actor);
  return {
    items: [],
    totalItems: 0,
    subTotal: 0,
    recommendedProducts: [],
  };
};

/** Merges anonymous guest cart into the authenticated user's cart. */
const mergeGuestCart = async (guestId: string | undefined, userId: string) => {
  if (!guestId?.trim() || !userId) return { merged: 0 };

  const guestActor = { guestId: guestId.trim() };
  const userActor = { userId };
  const guestItems = await getCartItemsOrEmpty(guestActor);
  if (!guestItems.length) return { merged: 0 };

  const userItems = await getCartItemsOrEmpty(userActor);
  for (const guestItem of guestItems) {
    const existing = userItems.find((item) =>
      isSameCartItem(item, {
        productId: guestItem.productId.toString(),
        size: guestItem.size,
        color: guestItem.color,
      })
    );

    if (existing) {
      existing.quantity += guestItem.quantity;
    } else {
      userItems.push(guestItem);
    }
  }

  await Cart.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId }, $set: { items: userItems } },
    { upsert: true }
  );
  await Cart.deleteOne({ guestId: guestId.trim() });
  await Promise.all([
    syncCartCacheFromMongo(userActor),
    clearCartCache(getCartActorCacheKey(guestActor)),
  ]);

  return { merged: guestItems.length };
};

export const CartService = {
  add,
  update,
  remove,
  getCart,
  clear,
  mergeGuestCart,
};


