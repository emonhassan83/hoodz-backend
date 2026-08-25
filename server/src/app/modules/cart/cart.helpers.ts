import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { CART_RECOMMENDED_LIMIT } from '@/app/constant';
import { Cart } from '@/app/modules/cart/cart.model';
import {
  TCartItem,
  TCartItemIdentity,
  TCartColor,
  TCartActor,
  TCartRecommendedProduct,
} from '@/app/modules/cart/cart.types';
import { PRODUCT_INVENTORY_TYPE } from '@/app/modules/product/product.constant';
import { Product } from '@/app/modules/product/product.model';
import { TProductVariant } from '@/app/modules/product/product.types';
import { clearCartCache, syncCartItemsToCache } from '@/app/redis/helpers/cart';

/** Resolves cart owner where authenticated user takes priority over guest id. */
export const resolveCartActor = (
  userId?: string,
  guestId?: string | string[]
): TCartActor => {
  if (userId) return { userId };
  const rawGuestId = Array.isArray(guestId) ? guestId[0] : guestId;
  return rawGuestId?.trim() ? { guestId: rawGuestId.trim() } : {};
};

/** Throws when cart operation has neither authenticated user nor guest id. */
export const assertCartActorExists = (
  traceId: string,
  actor: TCartActor
) => {
  if (!actor.userId && !actor.guestId) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'x-guest-id header or authentication is required for cart',
      traceId
    );
  }
};

/** Builds Mongo cart ownership filter for user or guest cart. */
export const buildCartActorFilter = (actor: TCartActor) =>
  actor.userId ? { userId: actor.userId } : { guestId: actor.guestId };

/** Returns stable cache key scope for user or guest cart. */
export const getCartActorCacheKey = (actor: TCartActor) => {
  if (actor.userId) return `user:${actor.userId}`;
  if (actor.guestId) return `guest:${actor.guestId}`;
  return 'anonymous';
};

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

  if (product.inventoryType === PRODUCT_INVENTORY_TYPE.single) {
    return {
      product,
      variant: {
        size: null,
        color: null,
        quantity: product.stock,
      } as TProductVariant,
    };
  }

  if (
    product.inventoryType === PRODUCT_INVENTORY_TYPE.colorOnly &&
    !payload.color?.code
  ) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Color is required', traceId);
  }

  if (
    product.inventoryType === PRODUCT_INVENTORY_TYPE.sizeColor &&
    (!payload.size || !payload.color?.code)
  ) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Size and color are required',
      traceId
    );
  }

  const variant = product.variants.find((item) => {
    if (product.inventoryType === PRODUCT_INVENTORY_TYPE.colorOnly) {
      return item.color?.code === payload.color?.code;
    }

    return item.size === payload.size && item.color?.code === payload.color?.code;
  });
  if (!variant) {
    throw new ApiError(HttpStatusCode.NotFound, 'Product option not found', traceId);
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

const normalizeCartSize = (size?: string | null) => {
  const value = size?.trim();
  return value ? value.toLowerCase() : null;
};

const normalizeCartColorCode = (code?: string | null) => {
  const value = code?.trim().toLowerCase().replace(/^#/, '');
  return value ? value : null;
};

const getCartItemProductId = (productId: TCartItem['productId'] | string) =>
  productId?.toString?.() ?? String(productId);

/** Builds the MongoDB cart item payload from a resolved product variant. */
export const buildCartItem = (
  productId: string,
  variant: { size?: string | null; color?: TCartColor | null },
  quantity: number
): TCartItem => ({
  productId: new Types.ObjectId(productId),
  size: variant.size?.trim() || null,
  color: variant.color
    ? {
        code: variant.color.code.trim(),
        name: variant.color.name.trim(),
      }
    : null,
  quantity,
});

/** Builds Mongo identity from a stored cart line so update/pull match BSON types. */
export const buildCartItemMatchFromItem = (
  item: Pick<TCartItem, 'productId' | 'size' | 'color'>
) => {
  const match: Record<string, unknown> = {
    productId: item.productId,
    size: item.size ?? null,
  };

  if (item.color?.code) {
    match['color.code'] = item.color.code;
  } else {
    match.color = null;
  }

  return match;
};

/** Builds the cart item identity used by MongoDB pull operations. */
export const buildCartItemMatch = (payload: TCartItemIdentity) =>
  buildCartItemMatchFromItem({
    productId: new Types.ObjectId(payload.productId),
    size: payload.size ?? null,
    color: payload.color ?? null,
  });

/** Checks if a stored cart item matches the incoming product and variant. */
export const isSameCartItem = (
  item: Pick<TCartItem, 'productId' | 'size' | 'color'>,
  payload: TCartItemIdentity
) => {
  if (getCartItemProductId(item.productId) !== String(payload.productId)) {
    return false;
  }

  const storedSize = normalizeCartSize(item.size);
  const storedColor = normalizeCartColorCode(item.color?.code);
  const payloadSize = normalizeCartSize(payload.size);
  const payloadColor = normalizeCartColorCode(payload.color?.code);

  // Single-stock lines ignore extra size/color from the client.
  if (storedSize === null && storedColor === null) return true;

  // Color-only lines ignore extra size from the client.
  if (storedSize === null) {
    return storedColor === payloadColor;
  }

  return storedSize === payloadSize && storedColor === payloadColor;
};

/** Finds a cart line by product/variant id, then size and color. */
export const findCartItem = <T extends Pick<TCartItem, 'productId' | 'size' | 'color'>>(
  items: T[],
  payload: TCartItemIdentity
) => {
  const payloadId = String(payload.productId);
  const payloadSize = normalizeCartSize(payload.size);
  const payloadColor = normalizeCartColorCode(payload.color?.code);
  const payloadColorName = payload.color?.name?.trim().toLowerCase() || null;

  const sameId = items.filter(
    (item) => getCartItemProductId(item.productId) === payloadId
  );
  const variantMatch = sameId.find((item) => isSameCartItem(item, payload));
  if (variantMatch) return variantMatch;
  if (sameId.length === 1) return sameId[0];

  const sameOption = items.filter((item) => {
    const sameSize = normalizeCartSize(item.size) === payloadSize;
    const sameColor =
      normalizeCartColorCode(item.color?.code) === payloadColor ||
      (!!payloadColorName &&
        (item.color?.name?.trim().toLowerCase() || null) === payloadColorName);
    return sameSize && sameColor;
  });

  return sameOption.length === 1 ? sameOption[0] : undefined;
};

/** Accepts either a product id or a product variant id. */
export const resolveCartProductId = async (productId: string) => {
  const product = await Product.findOne({
    _id: productId,
    isDeleted: false,
  }).select('_id');
  if (product) return product._id.toString();

  const productByVariant = await Product.findOne({
    'variants._id': productId,
    isDeleted: false,
  }).select('_id');

  return productByVariant?._id.toString() ?? productId;
};

/** Returns existing cart items or an empty list for new carts. */
export const getCartItemsOrEmpty = async (actor: TCartActor) => {
  const cart = await Cart.findOne(buildCartActorFilter(actor)).lean();
  return cart?.items ?? [];
};

/** Refreshes Redis cart cache from the current MongoDB cart document. */
export const syncCartCacheFromMongo = async (actor: TCartActor) => {
  const items = await getCartItemsOrEmpty(actor);
  await syncCartItemsToCache(getCartActorCacheKey(actor), items);
};

/** Clears a user's cart from both MongoDB and Redis cache. */
export const clearCart = async (actor: TCartActor) => {
  await Cart.findOneAndUpdate(
    buildCartActorFilter(actor),
    { $setOnInsert: actor, $set: { items: [] } },
    { upsert: true }
  );
  await clearCartCache(getCartActorCacheKey(actor));
};

/** Safely reads ObjectId from populated or raw relation values. */
const getRelationId = (relation: any) =>
  relation?._id?.toString?.() ?? relation?.toString?.() ?? null;

/** Formats recommendation cards for the cart screen. */
const formatCartRecommendedProduct = (product: any): TCartRecommendedProduct => ({
  _id: product._id,
  category:
    product.category && typeof product.category === 'object'
      ? {
          _id: product.category._id,
          title: product.category.title,
        }
      : null,
  title: product.title,
  collectionType: product.collectionType,
  banner: product.banner ?? null,
  price: product.price,
  discount: product.discount,
  discountPrice: product.discountPrice,
  avgRating: product.avgRating ?? 0,
  ratingCount: product.ratingCount ?? 0,
  inStock: (product.stock ?? 0) > 0,
});

/** Picks recommendations by collectionType, then category, then brandType. */
const pickRecommendedByPriority = (
  products: any[],
  signals: {
    categoryIds: Set<string>;
    collectionTypes: Set<string>;
    brandTypes: Set<string>;
  }
) => {
  const picked = new Set<string>();
  const selected: any[] = [];

  const takeMatching = (matches: (product: any) => boolean) => {
    for (const product of products) {
      if (selected.length >= CART_RECOMMENDED_LIMIT) break;

      const id = product._id.toString();
      if (picked.has(id) || !matches(product)) continue;

      picked.add(id);
      selected.push(product);
    }
  };

  takeMatching((product) =>
    signals.collectionTypes.has(product.collectionType)
  );
  takeMatching((product) =>
    signals.categoryIds.has(getRelationId(product.category))
  );
  takeMatching((product) => signals.brandTypes.has(product.brandType));

  return selected;
};

/** Finds up to six products related to the current cart contents. */
export const getCartRecommendedProducts = async (
  cartProducts: any[],
  excludedProductIds: Set<string>
) => {
  if (!cartProducts.length) return [];

  const signals = {
    categoryIds: new Set<string>(),
    collectionTypes: new Set<string>(),
    brandTypes: new Set<string>(),
  };

  cartProducts.forEach((product) => {
    const categoryId = getRelationId(product.category);
    if (categoryId) signals.categoryIds.add(categoryId);
    if (product.collectionType) {
      signals.collectionTypes.add(product.collectionType);
    }
    if (product.brandType) signals.brandTypes.add(product.brandType);
  });

  const matchSignals: Record<string, unknown>[] = [];
  if (signals.collectionTypes.size) {
    matchSignals.push({
      collectionType: { $in: [...signals.collectionTypes] },
    });
  }
  if (signals.categoryIds.size) {
    matchSignals.push({ category: { $in: [...signals.categoryIds] } });
  }
  if (signals.brandTypes.size) {
    matchSignals.push({ brandType: { $in: [...signals.brandTypes] } });
  }

  if (!matchSignals.length) return [];

  const products = await Product.find({
    _id: { $nin: [...excludedProductIds] },
    isDeleted: false,
    $or: matchSignals,
  })
    .populate([{ path: 'category', select: 'title' }])
    .select(
      '_id category title collectionType brandType banner price discount discountPrice avgRating ratingCount stock sold createdAt'
    )
    .sort({ avgRating: -1, ratingCount: -1, sold: -1, createdAt: -1 })
    .limit(40)
    .lean();

  return pickRecommendedByPriority(products, signals).map(
    formatCartRecommendedProduct
  );
};


