import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { Cart } from '@/app/modules/cart/cart.model';
import { getFollowedVendorIdSet } from '@/app/modules/follow/follow.helpers';
import { Items } from '@/app/modules/items/items.model';
import {
  assertCategoryExists,
  assertInventoryOptionsValid,
  assertProductAccess,
  assertProductExists,
  assertSkuAvailable,
  assertVendorExists,
  applyExcludeStockOutFilter,
  buildProductListFilter,
  buildProductWritePayload,
  buildVendorProductStats,
  formatProductCategory,
  formatProductDetails,
  formatProductListItem,
  formatProductListItems,
  formatMyProductListItems,
  formatProductVendor,
  generateUniqueSku,
  getActorCartProductIds,
  getActorOrderedProductCounts,
  getGoogleDistanceElements,
  getLatestProductReviews,
  getPagination,
  getProductActorKey,
  getProductByIdOrThrow,
  getProductVouchers,
  getRelationId,
  getSimilarProducts,
  getUserOrigin,
  getWishlistProductIdSet,
  hasPurchasedProduct,
  hasSubmittedProductReview,
  invalidateProductCaches,
  notifyProductRestockedSubscribers,
  productListSelect,
  productMyListSelect,
  productPopulate,
  toNumber,
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
  TMyProductsResponse,
  TProductActor,
  TProductFilterQuery,
  TProductListQuery,
  TProductListResponse,
  TProductPaginationMeta,
  TProductPayload,
  TProductRequester,
} from '@/app/modules/product/product.types';
import {
  deleteProductFromTypesense,
  upsertProductToTypesense,
} from '@/app/modules/search/search.typesense';
import { SettingService } from '@/app/modules/settings/settings.services';
import { calculateDistanceKm } from '@/app/modules/user/user.helpers';
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

const getAllProduct = async (
  traceId: string,
  query: TProductListQuery,
  userId?: string
) => {
  const productQuery = query as TProductFilterQuery;
  const cacheKey = REDIS_KEYS.PRODUCT_LIST(
    `all:${userId ?? 'anonymous'}:cards:v8:${JSON.stringify(query)}`
  );
  const cached = await getCache<TProductListResponse>(cacheKey);
  if (cached) return cached;

  const filter = await buildProductListFilter(productQuery);
  applyExcludeStockOutFilter(filter, query, true);
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
    `shop:${vendorId}:${userId ?? 'anonymous'}:cards:v5:${JSON.stringify(query)}`
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
  applyExcludeStockOutFilter(listFilter, query, true);

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
    `my:${vendorId}:dashboard:v4:${JSON.stringify(query)}`
  );
  const cached = await getCache<TMyProductsResponse>(cacheKey);
  if (cached) return cached;

  const baseFilter: Record<string, unknown> = {
    vendor: vendorId,
    isDeleted: false,
  };
  applyExcludeStockOutFilter(baseFilter, query, false);

  const productQuery = new QueryBuilder(
    Product.find(baseFilter)
      .populate(productPopulate)
      .select(productMyListSelect)
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
      products: formatMyProductListItems(products, wishlistIds),
    },
  };

  await setCache(cacheKey, result, 300);
  return result;
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
    getProductVouchers(vendorId, userId),
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
