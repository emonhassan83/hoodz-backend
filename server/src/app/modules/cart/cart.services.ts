import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import {
  assertVariantStock,
  buildCartItem,
  clearCart,
  findProductVariantOrThrow,
  getCartItemsOrEmpty,
  isSameCartItem,
  syncCartCacheFromMongo,
} from '@/app/modules/cart/cart.helpers';
import { Cart } from '@/app/modules/cart/cart.model';
import { Product } from '@/app/modules/product/product.model';
import { getCartItemsFromCache } from '@/app/redis/helpers/cart';

const add = async (
  traceId: string,
  userId: string,
  payload: {
    productId: string;
    size: string;
    color: { code: string; name: string };
    quantity: number;
  }
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
          $elemMatch: {
            productId: payload.productId,
            size: payload.size,
            'color.code': payload.color.code,
          },
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

const update = async (
  traceId: string,
  userId: string,
  payload: {
    productId: string;
    size: string;
    color: { code: string; name: string };
    quantity: number;
  }
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
        $elemMatch: {
          productId: payload.productId,
          size: payload.size,
          'color.code': payload.color.code,
        },
      },
    },
    { $set: { 'items.$.quantity': payload.quantity } }
  );

  await syncCartCacheFromMongo(userId);
  return getCart(userId);
};

const remove = async (
  _traceId: string,
  userId: string,
  payload: {
    productId: string;
    size: string;
    color: { code: string; name: string };
  }
) => {
  await Cart.updateOne(
    { userId },
    {
      $pull: {
        items: {
          productId: payload.productId,
          size: payload.size,
          'color.code': payload.color.code,
        },
      },
    }
  );

  await syncCartCacheFromMongo(userId);
  return getCart(userId);
};

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
    .select('vendorId title images price discountPrice variants')
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
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        product: {
          _id: product._id,
          vendorId: product.vendorId,
          title: product.title,
          images: product.images,
          price: product.price,
          discountPrice: product.discountPrice,
        },
        unitPrice,
        totalPrice: Number((unitPrice * item.quantity).toFixed(2)),
      };
    })
    .filter(Boolean);

  const subTotal = enrichedItems.reduce(
    (total, item: any) => total + item.totalPrice,
    0
  );

  return {
    items: enrichedItems,
    totalItems: enrichedItems.reduce((total, item: any) => total + item.quantity, 0),
    subTotal: Number(subTotal.toFixed(2)),
  };
};

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
