import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { CART_RECOMMENDED_LIMIT } from '@/app/modules/cart/cart.constant';
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

/** Builds the MongoDB cart item payload from a resolved product variant. */
export const buildCartItem = (
  productId: string,
  variant: { size?: string | null; color?: TCartColor | null },
  quantity: number
): TCartItem => ({
  productId: new Types.ObjectId(productId),
  size: variant.size ?? null,
  color: variant.color ?? null,
  quantity,
});

/** Builds the cart item identity used by MongoDB update and pull operations. */
export const buildCartItemMatch = (payload: TCartItemIdentity) => {
  const match: Record<string, unknown> = {
    productId: payload.productId,
    size: payload.size ?? null,
  };

  if (payload.color?.code) {
    match['color.code'] = payload.color.code;
  } else {
    match.color = null;
  }

  return match;
};

/** Checks if a stored cart item matches the incoming product, size, and color. */
export const isSameCartItem = (
  item: Pick<TCartItem, 'productId' | 'size' | 'color'>,
  payload: TCartItemIdentity
) =>
  item.productId.toString() === payload.productId &&
  (item.size ?? null) === (payload.size ?? null) &&
  (item.color?.code ?? null) === (payload.color?.code ?? null);

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


