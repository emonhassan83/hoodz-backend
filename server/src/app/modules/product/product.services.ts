import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { Cart } from '@/app/modules/cart/cart.model';
import { getFollowedVendorIdSet } from '@/app/modules/follow/follow.helpers';
import { Items } from '@/app/modules/items/items.model';
import { ORDER_STATUS } from '@/app/modules/orders/orders.constant';
import { Orders } from '@/app/modules/orders/orders.model';
import {
  assertCategoryExists,
  assertProductAccess,
  assertProductExists,
  assertSkuAvailable,
  assertVendorExists,
  assertInventoryOptionsValid,
  buildProductWritePayload,
  buildVendorProductStats,
  formatProductListItem,
  formatProductListItems,
  generateUniqueSku,
  getWishlistProductIdSet,
  getProductByIdOrThrow,
  invalidateProductCaches,
  notifyProductRestockedSubscribers,
  toNumber,
  getUserOrigin,
  buildProductListFilter,
} from '@/app/modules/product/product.helpers';
import {
  Product,
  ProductStockNotify,
} from '@/app/modules/product/product.model';
import {
  getWishlistItemReferenceId,
  productWishlistMatch,
} from '@/app/modules/wishlist/wishlist.helpers';
import { Wishlist } from '@/app/modules/wishlist/wishlist.model';
import {
  TAdminProductPayload,
  TProductFilterQuery,
  TProductListQuery,
  TProductPayload,
  TProductRequester,
} from '@/app/modules/product/product.types';
import { REVIEW_MODEL_TYPE } from '@/app/modules/review/review.constant';
import { Review } from '@/app/modules/review/review.model';
import {
  deleteProductFromTypesense,
  upsertProductToTypesense,
} from '@/app/modules/search/search.typesense';
import { SettingService } from '@/app/modules/settings/settings.services';
import {
  calculateDistanceKm,
  getGoogleDistanceMatrix,
} from '@/app/modules/user/user.helpers';
import {
  VOUCHER_STATUS,
  VOUCHER_TYPE,
} from '@/app/modules/voucher/voucher.constant';
import { Voucher } from '@/app/modules/voucher/voucher.model';
import {
  deleteCache,
  deleteCachePattern,
  getCache,
  setCache,
} from '@/app/redis/helpers';
import {
  addRecentlyViewedProduct,
  getRecentlyViewedProductIds,
  mergeRecentlyViewedProducts,
} from '@/app/redis/helpers/recentlyViewedProducts';
import { REDIS_KEYS } from '@/app/redis/keys';

const productPopulate = [
  { path: 'vendor', select: 'name email phone profileAvatar address location' },
  { path: 'category', select: 'title icon' },
];

const productListSelect =
  '_id category vendor title inventoryType collectionType brand brandType banner price discount discountPrice stock avgRating ratingCount sold createdAt';

type TProductPaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPage: number;
};

type TMyProductsResponse = {
  meta: TProductPaginationMeta;
  data: {
    stats: ReturnType<typeof buildVendorProductStats>;
    products: ReturnType<typeof formatProductListItems>;
  };
};

type TProductActor = {
  userId?: string;
  guestId?: string;
};

const getProductActorKey = (actor: TProductActor) => {
  if (actor.userId) return `user:${actor.userId}`;
  if (actor.guestId) return `guest:${actor.guestId}`;
  return 'anonymous';
};

const createProduct = async (
  traceId: string,
  vendor: string,
  payload: TProductPayload
) => {
  await Promise.all([
    assertSkuAvailable(traceId, payload.sku),
    assertCategoryExists(traceId, payload.category),
  ]);
  assertInventoryOptionsValid(traceId, payload, payload.inventoryType);

  const product = await Product.create({
    ...buildProductWritePayload(payload),
    vendor,
  });

  await invalidateProductCaches();
  await upsertProductToTypesense(product._id.toString()).catch((error) => {
    console.warn(
      '[Typesense] Product create sync failed:',
      error instanceof Error ? error.message : error
    );
  });
  return product;
};

const createProductByAdmin = async (
  traceId: string,
  payload: TAdminProductPayload
) => {
  const { vendor, ...productPayload } = payload;
  await assertVendorExists(traceId, vendor);

  return createProduct(traceId, vendor, productPayload);
};

const generateSku = async () => ({
  sku: await generateUniqueSku(),
});

const markProductViewed = async (
  traceId: string,
  actor: TProductActor,
  productId: string
) => {
  await getProductByIdOrThrow(traceId, productId);
  const actorKey = getProductActorKey(actor);
  await addRecentlyViewedProduct(actorKey, productId);
  await Promise.all([
    deleteCache(REDIS_KEYS.PRODUCT_RECENTLY_VIEWED(actorKey)),
    deleteCache(REDIS_KEYS.PRODUCT_LIST(`recently-viewed:${actorKey}:cards:v4`)),
    deleteCachePattern(`product:list:ai-recommended:${actorKey}:*`),
  ]);

  return { viewed: true };
};

const mergeGuestRecentlyViewed = async (
  guestId: string | undefined,
  userId: string
) => {
  if (!guestId?.trim() || !userId) return { merged: 0 };
  const guestKey = `guest:${guestId.trim()}`;
  const userKey = `user:${userId}`;
  const result = await mergeRecentlyViewedProducts(guestKey, userKey);
  await Promise.all([
    deleteCache(REDIS_KEYS.PRODUCT_RECENTLY_VIEWED(guestKey)),
    deleteCache(REDIS_KEYS.PRODUCT_RECENTLY_VIEWED(userKey)),
  ]);
  return result;
};

type TProductListResponse = {
  meta: TProductPaginationMeta;
  data: ReturnType<typeof formatProductListItems>;
};

const getRecentlyViewedProducts = async (
  actor: TProductActor,
  query: Record<string, unknown>
) => {
  const actorKey = getProductActorKey(actor);
  const cacheKey = REDIS_KEYS.PRODUCT_LIST(
    `recently-viewed:${actorKey}:cards:v4:${JSON.stringify(query)}`
  );
  const cached = await getCache<TProductListResponse>(cacheKey);
  if (cached) return cached;

  const productIds = await getRecentlyViewedProductIds(actorKey);
  if (productIds.length === 0) {
    return {
      meta: {
        page: Number(query.page) || 1,
        limit: Number(query.limit) || 10,
        total: 0,
        totalPage: 0,
      },
      data: [],
    };
  }

  const recentlyViewedQuery = new QueryBuilder(
    Product.find({
      _id: { $in: productIds },
      isDeleted: false,
    })
      .populate([{ path: 'category', select: 'title' }])
      .select(productListSelect)
      .lean(),
    query
  ).paginate();

  const [products, meta] = await Promise.all([
    recentlyViewedQuery.modelQuery,
    recentlyViewedQuery.countTotal(),
  ]);

  const productById = new Map(
    products.map((product) => [product._id.toString(), product])
  );

  const wishlistIds = await getWishlistProductIdSet(actor.userId);
  const productsWithWishlist = productIds
    .map((productId) => productById.get(productId))
    .filter(Boolean)
    .map((product) => formatProductListItem(product!, wishlistIds));
  const result = { meta, data: productsWithWishlist };

  await setCache(cacheKey, result, 300);
  return result;
};

const getTrendingProducts = async (
  query: Record<string, unknown>,
  userId?: string
) => {
  const cacheKey = REDIS_KEYS.PRODUCT_LIST(
    `trending:${userId ?? 'anonymous'}:cards:v4:${JSON.stringify(query)}`
  );
  const cached = await getCache<TProductListResponse>(cacheKey);
  if (cached) return cached;

  const listFilter = await buildProductListFilter(query as TProductFilterQuery);
  const trendingQuery = new QueryBuilder(
    Product.find({
      ...listFilter,
      $or: [
        { avgRating: { $gt: 0 } },
        { ratingCount: { $gt: 0 } },
        { sold: { $gt: 0 } },
      ],
    })
      .populate(productPopulate)
      .select(productListSelect)
      .lean(),
    {
      sort: '-avgRating,-ratingCount,-sold,-createdAt',
      ...query,
    }
  )
    .sort()
    .paginate();

  const [products, meta] = await Promise.all([
    trendingQuery.modelQuery,
    trendingQuery.countTotal(),
  ]);

  const wishlistIds = await getWishlistProductIdSet(userId);
  const result = { meta, data: formatProductListItems(products, wishlistIds) };

  await setCache(cacheKey, result, 300);
  return result;
};

const getPagination = (query: Record<string, unknown>) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const rawLimit = Number(query.limit ?? query.perPage) || 10;
  const limit = Math.min(Math.max(rawLimit, 1), 50);
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const getActorCartProductIds = async (actor: TProductActor) => {
  const cart = await Cart.findOne(
    actor.userId ? { userId: actor.userId } : { guestId: actor.guestId }
  )
    .select('items.productId')
    .lean();

  return (cart?.items ?? []).map((item: any) => item.productId.toString());
};

const getActorOrderedProductCounts = async (userId?: string) => {
  if (!userId) return new Map<string, number>();

  const orderedSignals = await Items.aggregate([
    {
      $lookup: {
        from: 'orders',
        localField: 'order',
        foreignField: '_id',
        as: 'order',
      },
    },
    { $unwind: '$order' },
    {
      $match: {
        'order.user': new mongoose.Types.ObjectId(userId),
        'order.isDeleted': false,
      },
    },
    { $group: { _id: '$product', count: { $sum: '$quantity' } } },
  ]);

  return new Map(
    orderedSignals.map((item: any) => [item._id.toString(), item.count])
  );
};

const getAiRecommendedProducts = async (
  actor: TProductActor,
  query: Record<string, unknown>
) => {
  const actorKey = getProductActorKey(actor);
  const cacheKey = REDIS_KEYS.PRODUCT_LIST(
    `ai-recommended:${actorKey}:cards:v3:${JSON.stringify(query)}`
  );
  const cached = await getCache<TProductListResponse>(cacheKey);
  if (cached) return cached;

  const { page, limit, skip } = getPagination(query);
  const listFilter = await buildProductListFilter(query as TProductFilterQuery);
  const [
    wishlistSignals,
    cartProductIds,
    orderedProductCounts,
    followedVendorIds,
  ] = await Promise.all([
    actor.userId
      ? Wishlist.find(productWishlistMatch(actor.userId))
          .select('reference -_id')
          .lean()
      : Promise.resolve([]),
    actor.userId || actor.guestId
      ? getActorCartProductIds(actor)
      : Promise.resolve([]),
    getActorOrderedProductCounts(actor.userId),
    getFollowedVendorIdSet(actor.userId),
  ]);

  const wishlistProductIds = wishlistSignals
    .map((item: any) => getWishlistItemReferenceId(item))
    .filter(Boolean);
  const signalProductIds = [
    ...new Set([
      ...wishlistProductIds,
      ...cartProductIds,
      ...orderedProductCounts.keys(),
    ]),
  ];

  const signalProducts = signalProductIds.length
    ? await Product.find({ _id: { $in: signalProductIds }, isDeleted: false })
        .select('_id category')
        .lean()
    : [];

  const categoryIds = new Set(
    signalProducts
      .map((product: any) => product.category?.toString())
      .filter(Boolean)
  );

  const recommendationFilter: Record<string, unknown> = { ...listFilter };
  const orFilters: Record<string, unknown>[] = [];
  if (categoryIds.size > 0) orFilters.push({ category: { $in: [...categoryIds] } });
  if (followedVendorIds.size > 0) {
    orFilters.push({ vendor: { $in: [...followedVendorIds] } });
  }
  if (orFilters.length > 0) recommendationFilter.$or = orFilters;

  const candidates = await Product.find(recommendationFilter)
    .populate(productPopulate)
    .select(productListSelect)
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const wishlistSet = new Set(wishlistProductIds);
  const cartSet = new Set(cartProductIds);
  const scoredProducts = candidates
    .map((product: any) => {
      const productId = product._id.toString();
      const categoryId =
        product.category?._id?.toString?.() ?? product.category?.toString?.();
      const vendorId =
        product.vendor?._id?.toString?.() ?? product.vendor?.toString?.();
      const score =
        (wishlistSet.has(productId) ? 500 : 0) +
        (cartSet.has(productId) ? 450 : 0) +
        (orderedProductCounts.get(productId) ?? 0) * 300 +
        (categoryIds.has(categoryId) ? 260 : 0) +
        (followedVendorIds.has(vendorId) ? 240 : 0);

      return { product, score };
    })
    .filter((item) => item.score > 0 || orFilters.length === 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        new Date(b.product.createdAt).getTime() -
        new Date(a.product.createdAt).getTime()
      );
    });

  const total = scoredProducts.length;
  const paginatedProducts = scoredProducts
    .slice(skip, skip + limit)
    .map((item) => item.product);
  const wishlistIds = await getWishlistProductIdSet(actor.userId);
  const result = {
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
    data: formatProductListItems(paginatedProducts, wishlistIds),
  };

  await setCache(cacheKey, result, 180);
  return result;
};

const GOOGLE_DESTINATION_LIMIT = 25;

const getGoogleDistanceElements = async (
  origin: { latitude: number; longitude: number },
  destinations: { latitude: number; longitude: number }[]
) => {
  const elements: Array<{
    status?: string;
    distance?: { value?: number };
    duration?: { value?: number };
  }> = [];

  try {
    for (let i = 0; i < destinations.length; i += GOOGLE_DESTINATION_LIMIT) {
      const chunk = destinations.slice(i, i + GOOGLE_DESTINATION_LIMIT);
      const chunkElements = await getGoogleDistanceMatrix(origin, chunk);
      elements.push(...chunkElements);
    }
  } catch (error) {
    console.warn(
      '[Products] Google Maps distance lookup failed:',
      error instanceof Error ? error.message : error
    );
  }

  return elements;
};

const getAllProduct = async (
  traceId: string,
  query: TProductListQuery,
  userId?: string
) => {
  const productQuery = query as TProductFilterQuery;
  const cacheKey = REDIS_KEYS.PRODUCT_LIST(
    `all:${userId ?? 'anonymous'}:cards:v7:${JSON.stringify(query)}`
  );
  const cached = await getCache<TProductListResponse>(cacheKey);
  if (cached) return cached;

  const filter = await buildProductListFilter(productQuery);
  const maxDistanceKm = toNumber(
    productQuery.maxDistanceKm ?? productQuery.maxDistance
  );
  const maxDeliveryTimeMinutes = toNumber(
    productQuery.maxDeliveryTimeMinutes ?? productQuery.maxDeliveryTime
  );
  const needsGeoFilter =
    maxDistanceKm !== undefined || maxDeliveryTimeMinutes !== undefined;

  const baseQuery = Product.find(filter)
    .populate(productPopulate)
    .select(productListSelect)
    .lean();

  let products: any[];
  let meta: TProductPaginationMeta;

  if (!needsGeoFilter) {
    const productsQuery = new QueryBuilder(baseQuery, query)
      .search(['title', 'sku'])
      .sort()
      .paginate();
    const [initialProducts, queryMeta] = await Promise.all([
      productsQuery.modelQuery,
      productsQuery.countTotal(),
    ]);
    products = initialProducts;
    meta = queryMeta;
  } else {
    const origin = await getUserOrigin(traceId, userId, productQuery);
    if (!origin) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'Location is required for distance or delivery time filter',
        traceId
      );
    }

    const productsQuery = new QueryBuilder(baseQuery, query)
      .search(['title', 'sku'])
      .sort();
    const candidates = await productsQuery.modelQuery;

    const vendorCoordinateById = new Map<
      string,
      { latitude: number; longitude: number }
    >();
    candidates.forEach((product: any) => {
      const vendor = product.vendor;
      const coordinates = vendor?.location?.coordinates;
      if (
        !vendor?._id ||
        !coordinates ||
        coordinates.every((item: number) => item === 0)
      ) {
        return;
      }

      vendorCoordinateById.set(vendor._id.toString(), {
        longitude: coordinates[0],
        latitude: coordinates[1],
      });
    });

    const vendorIds = [...vendorCoordinateById.keys()];
    const destinations = vendorIds.map(
      (vendorId) => vendorCoordinateById.get(vendorId)!
    );
    const googleElements = await getGoogleDistanceElements(origin, destinations);

    const distanceByVendorId = new Map(
      vendorIds.map((vendorId, index) => {
        const element = googleElements[index];
        const coordinate = vendorCoordinateById.get(vendorId)!;
        const fallbackKm = calculateDistanceKm(origin, coordinate);
        const distanceKm =
          element?.status === 'OK' && element.distance?.value !== undefined
            ? element.distance.value / 1000
            : fallbackKm;
        const deliveryMinutes =
          element?.status === 'OK' && element.duration?.value !== undefined
            ? Math.ceil(element.duration.value / 60)
            : Number.POSITIVE_INFINITY;

        return [vendorId, { distanceKm, deliveryMinutes }];
      })
    );

    const filteredProducts = candidates.filter((product: any) => {
      const vendorId = product.vendor?._id?.toString();
      const delivery = vendorId ? distanceByVendorId.get(vendorId) : null;
      if (!delivery) return false;

      const distanceMatches =
        maxDistanceKm === undefined || delivery.distanceKm <= maxDistanceKm;
      const timeMatches =
        maxDeliveryTimeMinutes === undefined ||
        delivery.deliveryMinutes <= maxDeliveryTimeMinutes;

      if (!distanceMatches || !timeMatches) return false;

      product.distanceKm = Number(delivery.distanceKm.toFixed(2));
      product.deliveryTimeMinutes = Number.isFinite(delivery.deliveryMinutes)
        ? delivery.deliveryMinutes
        : null;
      return true;
    });

    const { page, limit, skip } = getPagination(query);
    products = filteredProducts.slice(skip, skip + limit);
    meta = {
      page,
      limit,
      total: filteredProducts.length,
      totalPage: Math.ceil(filteredProducts.length / limit),
    };
  }

  const wishlistIds = await getWishlistProductIdSet(userId);
  const followedVendorIds = await getFollowedVendorIdSet(userId);
  const sortedProducts = followedVendorIds.size
    ? [...products].sort((a: any, b: any) => {
        const aFollowed = followedVendorIds.has(
          a.vendor?._id?.toString() ?? a.vendor?.toString()
        );
        const bFollowed = followedVendorIds.has(
          b.vendor?._id?.toString() ?? b.vendor?.toString()
        );

        return Number(bFollowed) - Number(aFollowed);
      })
    : products;
  const result = {
    meta,
    data: formatProductListItems(sortedProducts, wishlistIds),
  };

  await setCache(cacheKey, result, 300);
  return result;
};

const getShopProducts = async (
  traceId: string,
  vendorId: string,
  query: Record<string, unknown>,
  userId?: string
) => {
  await assertVendorExists(traceId, vendorId);
  const cacheKey = REDIS_KEYS.PRODUCT_LIST(
    `shop:${vendorId}:${userId ?? 'anonymous'}:cards:v4:${JSON.stringify(query)}`
  );
  const cached = await getCache<{
    meta: TProductPaginationMeta;
    data: {
      recommends: ReturnType<typeof formatProductListItems>;
      allProducts: ReturnType<typeof formatProductListItems>;
    };
  }>(cacheKey);
  if (cached) return cached;

  const listFilter = await buildProductListFilter(query as TProductFilterQuery);
  listFilter.vendor = vendorId;
  listFilter.isDeleted = false;

  const allProductsQuery = new QueryBuilder(
    Product.find(listFilter)
      .populate(productPopulate)
      .select(productListSelect)
      .lean(),
    query
  )
    .search(['title', 'sku', 'description'])
    .sort()
    .paginate();

  const recommendQuery = new QueryBuilder(
    Product.find(listFilter)
      .populate(productPopulate)
      .select(productListSelect)
      .lean(),
    query
  ).search(['title', 'sku', 'description']);

  const [allProducts, meta, shopProducts, wishlistSignals, cart, orderSignals] = await Promise.all([
    allProductsQuery.modelQuery,
    allProductsQuery.countTotal(),
    recommendQuery.modelQuery,
    userId
      ? Wishlist.find(productWishlistMatch(userId))
          .select('reference -_id')
          .lean()
      : Promise.resolve([]),
    userId
      ? Cart.findOne({ userId }).select('items.productId').lean()
      : Promise.resolve(null),
    userId
      ? Items.aggregate([
          {
            $match: {
              author: new mongoose.Types.ObjectId(vendorId),
            },
          },
          {
            $lookup: {
              from: 'orders',
              localField: 'order',
              foreignField: '_id',
              as: 'order',
            },
          },
          { $unwind: '$order' },
          {
            $match: {
              'order.user': new mongoose.Types.ObjectId(userId),
              'order.isDeleted': false,
            },
          },
          { $group: { _id: '$product', count: { $sum: '$quantity' } } },
        ])
      : Promise.resolve([]),
  ]);

  const wishlistIds = await getWishlistProductIdSet(userId);
  const wishlistSignalIds = new Set(
    wishlistSignals
      .map((item: any) => getWishlistItemReferenceId(item))
      .filter(Boolean)
  );
  const cartSignalIds = new Set(
    (cart?.items ?? []).map((item: any) => item.productId.toString())
  );
  const orderedSignalCount = new Map(
    orderSignals.map((item: any) => [item._id.toString(), item.count])
  );

  const recommends = [...shopProducts]
    .map((product: any) => {
      const productId = product._id.toString();
      const score =
        (wishlistSignalIds.has(productId) ? 1000 : 0) +
        (cartSignalIds.has(productId) ? 800 : 0) +
        ((orderedSignalCount.get(productId) as number | undefined) ?? 0) * 120 +
        (product.avgRating ?? 0) * 30 +
        (product.ratingCount ?? 0) * 2 +
        (product.sold ?? 0);

      return { product, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        new Date(b.product.createdAt).getTime() -
        new Date(a.product.createdAt).getTime()
      );
    })
    .slice(0, 12)
    .map((item) => item.product);

  const result = {
    meta,
    data: {
      recommends: formatProductListItems(recommends, wishlistIds),
      allProducts: formatProductListItems(allProducts, wishlistIds),
    },
  };

  await setCache(cacheKey, result, 300);
  return result;
};

/** Searches products inside one shop for the in-store search icon. */
const searchShopProducts = async (
  traceId: string,
  vendorId: string,
  query: Record<string, unknown>,
  userId?: string
) => {
  await assertVendorExists(traceId, vendorId);

  const searchTerm = String(query.searchTerm ?? '').trim();
  if (!searchTerm) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Search term is required',
      traceId
    );
  }

  const cacheKey = REDIS_KEYS.PRODUCT_LIST(
    `shop-search:${vendorId}:${userId ?? 'anonymous'}:v1:${JSON.stringify(query)}`
  );
  const cached = await getCache<TProductListResponse>(cacheKey);
  if (cached) return cached;

  const productsQuery = new QueryBuilder(
    Product.find({ vendor: vendorId, isDeleted: false })
      .populate(productPopulate)
      .select(productListSelect)
      .lean(),
    query
  )
    .search(['title', 'sku', 'description'])
    .sort()
    .paginate();

  const [products, meta] = await Promise.all([
    productsQuery.modelQuery,
    productsQuery.countTotal(),
  ]);
  const wishlistIds = await getWishlistProductIdSet(userId);
  const result = {
    meta,
    data: formatProductListItems(products, wishlistIds),
  };

  await setCache(cacheKey, result, 180);
  return result;
};

const getMyProducts = async (
  vendorId: string,
  query: Record<string, unknown>
) => {
  const cacheKey = REDIS_KEYS.PRODUCT_LIST(
    `my:${vendorId}:dashboard:v2:${JSON.stringify(query)}`
  );
  const cached = await getCache<TMyProductsResponse>(cacheKey);
  if (cached) return cached;

  const productQuery = new QueryBuilder(
    Product.find({ vendor: vendorId, isDeleted: false })
      .populate(productPopulate)
      .select(productListSelect)
      .lean(),
    query
  )
    .search(['title', 'sku'])
    .filter()
    .sort()
    .paginate();

  const [products, meta, statsProducts] = await Promise.all([
    productQuery.modelQuery,
    productQuery.countTotal(),
    Product.find({ vendor: vendorId, isDeleted: false })
      .populate([{ path: 'category', select: 'title' }])
      .select('category price discountPrice stock')
      .lean(),
  ]);

  const wishlistIds = await getWishlistProductIdSet(vendorId);
  const result = {
    meta,
    data: {
      stats: buildVendorProductStats(statsProducts),
      products: formatProductListItems(products, wishlistIds),
    },
  };

  await setCache(cacheKey, result, 300);
  return result;
};

// Safely reads ObjectId from populated or raw relation values.
const getRelationId = (relation: any) =>
  relation?._id?.toString?.() ?? relation?.toString?.() ?? null;

// Keeps vendor summary compact for product details header.
const formatProductVendor = (vendor: any) => {
  if (!vendor || typeof vendor !== 'object') return null;

  return {
    _id: vendor._id,
    name: vendor.name ?? null,
    profileAvatar: vendor.profileAvatar ?? null,
  };
};

// Keeps category summary compact for product details header.
const formatProductCategory = (category: any) => {
  if (!category || typeof category !== 'object') return null;

  return {
    _id: category._id,
    title: category.title ?? null,
  };
};

// Removes populated relation payloads from the product body.
const formatProductDetails = (product: any) => {
  const { vendor: _vendor, category: _category, __v: _version, ...details } =
    product;

  return details;
};

// Scores products for complete-look/similar recommendations.
const getSimilarProductScore = (
  product: any,
  currentProduct: any,
  currentVendorId: string | null,
  currentCategoryId: string | null
) => {
  const vendorScore =
    getRelationId(product.vendor) === currentVendorId ? 400 : 0;
  const categoryScore =
    getRelationId(product.category) === currentCategoryId ? 300 : 0;
  const collectionScore =
    product.collectionType === currentProduct.collectionType ? 150 : 0;
  const brandTypeScore =
    product.brandType === currentProduct.brandType ? 100 : 0;
  const qualityScore =
    Number(product.avgRating ?? 0) * 30 +
    Number(product.ratingCount ?? 0) * 2 +
    Number(product.sold ?? 0);

  return (
    vendorScore +
    categoryScore +
    collectionScore +
    brandTypeScore +
    qualityScore
  );
};

// Loads four strongest products related to the current product.
const getSimilarProducts = async (
  currentProduct: any,
  wishlistIds: Set<string>
) => {
  const currentVendorId = getRelationId(currentProduct.vendor);
  const currentCategoryId = getRelationId(currentProduct.category);
  const matchSignals: Record<string, unknown>[] = [];
  if (currentVendorId) matchSignals.push({ vendor: currentVendorId });
  if (currentCategoryId) matchSignals.push({ category: currentCategoryId });
  if (currentProduct.collectionType) {
    matchSignals.push({ collectionType: currentProduct.collectionType });
  }
  if (currentProduct.brandType) {
    matchSignals.push({ brandType: currentProduct.brandType });
  }

  if (matchSignals.length === 0) return [];

  const products = await Product.find({
    _id: { $ne: currentProduct._id },
    isDeleted: false,
    $or: matchSignals,
  })
    .populate([{ path: 'category', select: 'title' }])
    .select(productListSelect)
    .sort({ avgRating: -1, ratingCount: -1, sold: -1, createdAt: -1 })
    .limit(30)
    .lean();

  const sortedProducts = products.sort(
    (left, right) =>
      getSimilarProductScore(
        right,
        currentProduct,
        currentVendorId,
        currentCategoryId
      ) -
      getSimilarProductScore(
        left,
        currentProduct,
        currentVendorId,
        currentCategoryId
      )
  );

  return formatProductListItems(sortedProducts.slice(0, 4), wishlistIds);
};

// Loads active shop/global vouchers that are still valid.
const getProductVouchers = async (vendorId: string | null) => {
  const voucherScopes: Record<string, unknown>[] = [
    { voucherType: VOUCHER_TYPE.global },
  ];
  if (vendorId) {
    voucherScopes.push({ voucherType: VOUCHER_TYPE.shop, shop: vendorId });
  }

  return Voucher.find({
    isDeleted: false,
    status: VOUCHER_STATUS.active,
    expiryDate: { $gte: new Date() },
    $or: voucherScopes,
  })
    .select(
      '_id title code voucherType discountType discountValue maxDiscountAmount minSpend expiryDate'
    )
    .sort({ expiryDate: 1, createdAt: -1 })
    .limit(4)
    .lean();
};

// Loads newest product reviews for the detail page preview.
const getLatestProductReviews = async (productId: string) =>
  Review.find({
    modelType: REVIEW_MODEL_TYPE.Product,
    reference: productId,
  })
    .populate([{ path: 'user', select: 'name profileAvatar' }])
    .select('_id user review files rating createdAt')
    .sort({ createdAt: -1 })
    .limit(3)
    .lean();

// Checks if the requester has a delivered order containing this product.
const hasPurchasedProduct = async (
  userId: string | undefined,
  productId: string
) => {
  if (!userId) return false;

  const [purchase] = await Items.aggregate([
    {
      $match: {
        product: new mongoose.Types.ObjectId(productId),
      },
    },
    {
      $lookup: {
        from: Orders.collection.name,
        localField: 'order',
        foreignField: '_id',
        as: 'order',
      },
    },
    { $unwind: '$order' },
    {
      $match: {
        'order.user': new mongoose.Types.ObjectId(userId),
        'order.status': ORDER_STATUS.delivered,
        'order.isDeleted': false,
      },
    },
    { $limit: 1 },
    { $project: { _id: 1 } },
  ]);

  return Boolean(purchase);
};

// Checks if the requester already reviewed this product.
const hasSubmittedProductReview = async (
  userId: string | undefined,
  productId: string
) => {
  if (!userId) return false;

  const review = await Review.exists({
    user: userId,
    modelType: REVIEW_MODEL_TYPE.Product,
    reference: productId,
  });

  return Boolean(review);
};

const getProductById = async (
  traceId: string,
  productId: string,
  userId?: string
) => {
  const cacheKey = `${REDIS_KEYS.PRODUCT_SINGLE(
    productId,
    userId ?? 'anonymous'
  )}:v2`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const product = await Product.findOne({ _id: productId, isDeleted: false })
    .populate(productPopulate)
    .select('-__v')
    .lean();

  assertProductExists(product, traceId);
  const wishlistIds = await getWishlistProductIdSet(userId);
  const vendorId = getRelationId(product!.vendor);
  const isWishlisted = wishlistIds.has(product!._id.toString());

  const [
    shopRules,
    similarProducts,
    vouchers,
    reviews,
    hasPurchase,
    hasReviewSubmit,
  ] = await Promise.all([
    vendorId
      ? SettingService.getSettingGenerals(traceId, vendorId).catch(() => null)
      : Promise.resolve(null),
    getSimilarProducts(product, wishlistIds),
    getProductVouchers(vendorId),
    getLatestProductReviews(productId),
    hasPurchasedProduct(userId, productId),
    hasSubmittedProductReview(userId, productId),
  ]);

  const result = {
    product: formatProductDetails(product),
    vendor: formatProductVendor(product!.vendor),
    category: formatProductCategory(product!.category),
    shopRules,
    similarProducts,
    vouchers,
    reviews,
    hasPurchase,
    hasReviewSubmit,
    isWishlisted,
  };

  await setCache(cacheKey, result, 300);
  return result;
};

const updateProduct = async (
  traceId: string,
  productId: string,
  requester: TProductRequester,
  payload: Partial<TProductPayload>
) => {
  const product = await getProductByIdOrThrow(traceId, productId);
  const previousStock = product.stock;
  assertProductAccess(traceId, product, requester);
  assertInventoryOptionsValid(
    traceId,
    payload,
    payload.inventoryType ?? product.inventoryType
  );

  await Promise.all([
    payload.sku
      ? assertSkuAvailable(traceId, payload.sku, productId)
      : Promise.resolve(),
    payload.category
      ? assertCategoryExists(traceId, payload.category)
      : Promise.resolve(),
  ]);

  const updatedProduct = await Product.findByIdAndUpdate(
    productId,
    buildProductWritePayload(payload, product),
    { returnDocument: 'after' }
  )
    .populate(productPopulate)
    .select('-__v');

  await invalidateProductCaches();
  await upsertProductToTypesense(productId).catch((error) => {
    console.warn(
      '[Typesense] Product update sync failed:',
      error instanceof Error ? error.message : error
    );
  });
  if (previousStock <= 0 && updatedProduct && updatedProduct.stock > 0) {
    await notifyProductRestockedSubscribers(
      productId,
      updatedProduct.title
    );
  }

  return updatedProduct;
};

const deleteProduct = async (
  traceId: string,
  productId: string,
  requester: TProductRequester
) => {
  const product = await getProductByIdOrThrow(traceId, productId);
  assertProductAccess(traceId, product, requester);

  const deletedProduct = await Product.findByIdAndUpdate(
    productId,
    { isDeleted: true },
    { returnDocument: 'after' }
  ).select('-__v');

  await invalidateProductCaches();
  await deleteProductFromTypesense(productId).catch((error) => {
    console.warn(
      '[Typesense] Product delete sync failed:',
      error instanceof Error ? error.message : error
    );
  });
  return deletedProduct;
};

const notifyMe = async (traceId: string, userId: string, productId: string) => {
  const product = await getProductByIdOrThrow(traceId, productId);
  if (product.stock > 0) {
    return { productId, subscribed: false, alreadyInStock: true };
  }

  await ProductStockNotify.updateOne(
    { user: userId, product: productId },
    { user: userId, product: productId, notifiedAt: null },
    { upsert: true }
  );

  return { productId, subscribed: true };
};

export const ProductService = {
  generateSku,
  markProductViewed,
  getRecentlyViewedProducts,
  getTrendingProducts,
  getAiRecommendedProducts,
  createProduct,
  createProductByAdmin,
  getAllProduct,
  getShopProducts,
  searchShopProducts,
  getMyProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  notifyMe,
  mergeGuestRecentlyViewed,
};


