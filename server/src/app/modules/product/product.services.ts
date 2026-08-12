import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { Cart } from '@/app/modules/cart/cart.model';
import { getFollowedVendorIdSet } from '@/app/modules/follow/follow.helpers';
import { Items } from '@/app/modules/items/items.model';
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
  withWishlistFlag,
  toNumber,
  toStringArray,
  getUserOrigin,
} from '@/app/modules/product/product.helpers';
import {
  Product,
  ProductStockNotify,
} from '@/app/modules/product/product.model';
import { Wishlist } from '@/app/modules/wishlist/wishlist.model';
import {
  TAdminProductPayload,
  TProductFilterQuery,
  TProductListQuery,
  TProductPayload,
  TProductRequester,
} from '@/app/modules/product/product.types';
import {
  deleteProductFromTypesense,
  upsertProductToTypesense,
} from '@/app/modules/search/search.typesense';
import { getGoogleDistanceMatrix } from '@/app/modules/user/user.helpers';
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
  { path: 'vendorId', select: 'name email phone profileAvatar address location' },
  { path: 'category', select: 'title icon' },
];

const productListSelect =
  '_id category vendorId title inventoryType collectionType brand brandType images price discount discountPrice stock avgRating ratingCount sold createdAt';

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
  vendorId: string,
  payload: TProductPayload
) => {
  await Promise.all([
    assertSkuAvailable(traceId, payload.sku),
    assertCategoryExists(traceId, payload.category),
  ]);
  assertInventoryOptionsValid(traceId, payload, payload.inventoryType);

  const product = await Product.create({
    ...buildProductWritePayload(payload),
    vendorId,
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
  const { vendorId, ...productPayload } = payload;
  await assertVendorExists(traceId, vendorId);

  return createProduct(traceId, vendorId, productPayload);
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
    `trending:${userId ?? 'anonymous'}:cards:v3:${JSON.stringify(query)}`
  );
  const cached = await getCache<TProductListResponse>(cacheKey);
  if (cached) return cached;

  const trendingQuery = new QueryBuilder(
    Product.find({
      isDeleted: false,
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
    `ai-recommended:${actorKey}:cards:v1:${JSON.stringify(query)}`
  );
  const cached = await getCache<TProductListResponse>(cacheKey);
  if (cached) return cached;

  const { page, limit, skip } = getPagination(query);
  const [
    recentProductIds,
    wishlistSignals,
    cartProductIds,
    orderedProductCounts,
    followedVendorIds,
  ] = await Promise.all([
    getRecentlyViewedProductIds(actorKey),
    actor.userId
      ? Wishlist.find({ user: actor.userId }).select('product -_id').lean()
      : Promise.resolve([]),
    actor.userId || actor.guestId
      ? getActorCartProductIds(actor)
      : Promise.resolve([]),
    getActorOrderedProductCounts(actor.userId),
    getFollowedVendorIdSet(actor.userId),
  ]);

  const wishlistProductIds = wishlistSignals.map((item: any) =>
    item.product.toString()
  );
  const signalProductIds = [
    ...new Set([
      ...recentProductIds,
      ...wishlistProductIds,
      ...cartProductIds,
      ...orderedProductCounts.keys(),
    ]),
  ];

  const signalProducts = signalProductIds.length
    ? await Product.find({ _id: { $in: signalProductIds }, isDeleted: false })
        .select('_id category vendorId brand brandType')
        .lean()
    : [];

  const categoryIds = new Set(signalProducts.map((product: any) =>
    product.category?.toString()
  ).filter(Boolean));
  const brands = new Set(signalProducts.map((product: any) => product.brand).filter(Boolean));
  const brandTypes = new Set(
    signalProducts.map((product: any) => product.brandType).filter(Boolean)
  );
  const signalVendorIds = new Set(
    signalProducts.map((product: any) => product.vendorId?.toString()).filter(Boolean)
  );

  const recommendationFilter: Record<string, unknown> = { isDeleted: false };
  const orFilters: Record<string, unknown>[] = [];
  if (categoryIds.size > 0) orFilters.push({ category: { $in: [...categoryIds] } });
  if (brands.size > 0) orFilters.push({ brand: { $in: [...brands] } });
  if (brandTypes.size > 0) orFilters.push({ brandType: { $in: [...brandTypes] } });
  if (signalVendorIds.size > 0) orFilters.push({ vendorId: { $in: [...signalVendorIds] } });
  if (followedVendorIds.size > 0) {
    orFilters.push({ vendorId: { $in: [...followedVendorIds] } });
  }
  if (orFilters.length > 0) recommendationFilter.$or = orFilters;

  const candidates = await Product.find(recommendationFilter)
    .populate(productPopulate)
    .select(productListSelect)
    .sort({ avgRating: -1, ratingCount: -1, sold: -1, createdAt: -1 })
    .limit(200)
    .lean();

  const recentRank = new Map(
    recentProductIds.map((productId, index) => [productId, index])
  );
  const wishlistSet = new Set(wishlistProductIds);
  const cartSet = new Set(cartProductIds);
  const scoredProducts = candidates
    .map((product: any) => {
      const productId = product._id.toString();
      const categoryId = product.category?._id?.toString?.() ?? product.category?.toString?.();
      const vendorId = product.vendorId?._id?.toString?.() ?? product.vendorId?.toString?.();
      const recentIndex = recentRank.get(productId);
      const score =
        (wishlistSet.has(productId) ? 500 : 0) +
        (cartSet.has(productId) ? 450 : 0) +
        (recentIndex !== undefined ? 320 - recentIndex * 15 : 0) +
        ((orderedProductCounts.get(productId) ?? 0) * 300) +
        (categoryIds.has(categoryId) ? 260 : 0) +
        (brands.has(product.brand) ? 220 : 0) +
        (signalVendorIds.has(vendorId) ? 180 : 0) +
        (followedVendorIds.has(vendorId) ? 240 : 0) +
        (brandTypes.has(product.brandType) ? 100 : 0) +
        (product.avgRating ?? 0) * 30 +
        (product.ratingCount ?? 0) * 2 +
        (product.sold ?? 0);

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
    `all:${userId ?? 'anonymous'}:cards:v5:${JSON.stringify(query)}`
  );
  const cached = await getCache<TProductListResponse>(cacheKey);
  if (cached) return cached;

  const filter: Record<string, unknown> = { isDeleted: false };
  const minPrice = toNumber(productQuery.minPrice ?? productQuery.minimumPrice);
  const maxPrice = toNumber(productQuery.maxPrice ?? productQuery.maximumPrice);
  const brands = toStringArray(productQuery.brand);
  const brandTypes = toStringArray(productQuery.brandType);
  const colors = toStringArray(productQuery.color);
  const sizes = toStringArray(productQuery.size);
  const gender = productQuery.gender || productQuery.collectionType;

  if (productQuery.category) filter.category = productQuery.category;
  if (gender && gender !== 'all') filter.collectionType = gender;
  if (brands.length > 0) filter.brand = { $in: brands };
  if (brandTypes.length > 0) filter.brandType = { $in: brandTypes };
  if (colors.length > 0) filter['colors.name'] = { $in: colors };
  if (sizes.length > 0) filter.sizes = { $in: sizes };
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.discountPrice = {
      ...(minPrice !== undefined ? { $gte: minPrice } : {}),
      ...(maxPrice !== undefined ? { $lte: maxPrice } : {}),
    };
  }

  const productsQuery = new QueryBuilder(
    Product.find(filter)
      .populate(productPopulate)
      .select(productListSelect)
      .lean(),
    query
  )
    .search(['title', 'brand', 'sku'])
    .sort()
    .paginate();

  const [initialProducts, meta] = await Promise.all([
    productsQuery.modelQuery,
    productsQuery.countTotal(),
  ]);
  let products = initialProducts;

  const maxDistanceKm = toNumber(
    productQuery.maxDistanceKm ?? productQuery.maxDistance
  );
  const maxDeliveryTimeMinutes = toNumber(
    productQuery.maxDeliveryTimeMinutes ?? productQuery.maxDeliveryTime
  );
  if (maxDistanceKm !== undefined || maxDeliveryTimeMinutes !== undefined) {
    const origin = await getUserOrigin(traceId, userId, productQuery);
    if (!origin) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'Location is required for distance or delivery time filter',
        traceId
      );
    }

    const vendorCoordinateById = new Map<string, { latitude: number; longitude: number }>();
    products.forEach((product: any) => {
      const vendor = product.vendorId;
      const coordinates = vendor?.location?.coordinates;
      if (!vendor?._id || !coordinates || coordinates.every((item: number) => item === 0)) {
        return;
      }

      vendorCoordinateById.set(vendor._id.toString(), {
        longitude: coordinates[0],
        latitude: coordinates[1],
      });
    });

    const vendorIds = [...vendorCoordinateById.keys()];
    const googleElements = await getGoogleDistanceMatrix(
      origin,
      vendorIds.map((vendorId) => vendorCoordinateById.get(vendorId)!)
    );

    const distanceByVendorId = new Map(
      vendorIds.map((vendorId, index) => {
        const element = googleElements[index];
        const distanceKm =
          element?.status === 'OK' && element.distance?.value !== undefined
            ? element.distance.value / 1000
            : Number.POSITIVE_INFINITY;
        const deliveryMinutes =
          element?.status === 'OK' && element.duration?.value !== undefined
            ? Math.ceil(element.duration.value / 60)
            : Number.POSITIVE_INFINITY;

        return [vendorId, { distanceKm, deliveryMinutes }];
      })
    );

    products = products.filter((product: any) => {
      const vendorId = product.vendorId?._id?.toString();
      const delivery = vendorId ? distanceByVendorId.get(vendorId) : null;
      if (!delivery) return false;

      const distanceMatches =
        maxDistanceKm === undefined || delivery.distanceKm <= maxDistanceKm;
      const timeMatches =
        maxDeliveryTimeMinutes === undefined ||
        delivery.deliveryMinutes <= maxDeliveryTimeMinutes;

      if (!distanceMatches || !timeMatches) return false;

      product.distanceKm = Number(delivery.distanceKm.toFixed(2));
      product.deliveryTimeMinutes = delivery.deliveryMinutes;
      return true;
    });
  }

  const wishlistIds = await getWishlistProductIdSet(userId);
  const followedVendorIds = await getFollowedVendorIdSet(userId);
  const sortedProducts = followedVendorIds.size
    ? [...products].sort((a: any, b: any) => {
        const aFollowed = followedVendorIds.has(
          a.vendorId?._id?.toString() ?? a.vendorId?.toString()
        );
        const bFollowed = followedVendorIds.has(
          b.vendorId?._id?.toString() ?? b.vendorId?.toString()
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
    `shop:${vendorId}:${userId ?? 'anonymous'}:cards:v3:${JSON.stringify(query)}`
  );
  const cached = await getCache<{
    meta: TProductPaginationMeta;
    data: {
      recommends: ReturnType<typeof formatProductListItems>;
      allProducts: ReturnType<typeof formatProductListItems>;
    };
  }>(cacheKey);
  if (cached) return cached;

  const baseFilter = { vendorId, isDeleted: false };
  const allProductsQuery = new QueryBuilder(
    Product.find(baseFilter)
      .populate(productPopulate)
      .select(productListSelect)
      .lean(),
    query
  )
    .sort()
    .paginate();

  const [allProducts, meta, shopProducts, wishlistSignals, cart, orderSignals] = await Promise.all([
    allProductsQuery.modelQuery,
    allProductsQuery.countTotal(),
    Product.find(baseFilter)
      .populate(productPopulate)
      .select(productListSelect)
      .lean(),
    userId
      ? Wishlist.find({ user: userId }).select('product -_id').lean()
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
    wishlistSignals.map((item: any) => item.product.toString())
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
    Product.find({ vendorId, isDeleted: false })
      .populate(productPopulate)
      .select(productListSelect)
      .lean(),
    query
  )
    .search(['title', 'brand', 'sku'])
    .filter()
    .sort()
    .paginate();

  const [products, meta, statsProducts] = await Promise.all([
    productQuery.modelQuery,
    productQuery.countTotal(),
    Product.find({ vendorId, isDeleted: false })
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

const getProductById = async (
  traceId: string,
  productId: string,
  userId?: string
) => {
  const cacheKey = REDIS_KEYS.PRODUCT_SINGLE(productId, userId ?? 'anonymous');
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const product = await Product.findOne({ _id: productId, isDeleted: false })
    .populate(productPopulate)
    .select('-__v')
    .lean();

  assertProductExists(product, traceId);
  const wishlistIds = await getWishlistProductIdSet(userId);
  const result = withWishlistFlag(product!, wishlistIds);

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
  getMyProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  notifyMe,
  mergeGuestRecentlyViewed,
};


