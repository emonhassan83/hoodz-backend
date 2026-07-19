import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import {
  assertCategoryExists,
  assertProductAccess,
  assertProductExists,
  assertSkuAvailable,
  buildProductWritePayload,
  generateUniqueSku,
  getWishlistProductIdSet,
  getProductByIdOrThrow,
  invalidateProductCaches,
  notifyProductRestockedSubscribers,
  withWishlistFlag,
  withWishlistFlags,
} from '@/app/modules/product/product.helpers';
import {
  Product,
  ProductStockNotify,
} from '@/app/modules/product/product.model';
import {
  TProductFilterQuery,
  TProductListQuery,
  TProductPayload,
  TProductRequester,
} from '@/app/modules/product/product.types';
import {
  deleteProductFromTypesense,
  upsertProductToTypesense,
} from '@/app/modules/search/search.typesense';
import {
  deleteCache,
  getCache,
  setCache,
} from '@/app/redis/helpers';
import {
  addRecentlyViewedProduct,
  getRecentlyViewedProductIds,
} from '@/app/redis/helpers/recentlyViewedProducts';
import { REDIS_KEYS } from '@/app/redis/keys';
import { getGoogleDistanceMatrix } from '@/app/modules/user/user.helpers';
import { User } from '@/app/modules/user/user.model';

const productPopulate = [
  { path: 'vendorId', select: 'name email phone profileAvatar address location' },
  { path: 'category', select: 'title icon' },
];

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map(String).filter(Boolean)
    : typeof value === 'string' && value.trim()
      ? value.split(',').map((item) => item.trim()).filter(Boolean)
      : [];

const getUserOrigin = async (
  traceId: string,
  userId?: string,
  query?: TProductFilterQuery
) => {
  const queryLatitude = toNumber(query?.latitude);
  const queryLongitude = toNumber(query?.longitude);
  if (queryLatitude !== undefined && queryLongitude !== undefined) {
    return { latitude: queryLatitude, longitude: queryLongitude };
  }

  if (!userId) return null;

  const user = await User.findById(userId)
    .select('deliveryLocation location isDeleted')
    .lean();
  if (!user || user.isDeleted) {
    throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
  }

  const coordinates =
    user.deliveryLocation?.coordinates?.some((item) => item !== 0)
      ? user.deliveryLocation.coordinates
      : user.location?.coordinates;

  if (!coordinates || coordinates.every((item) => item === 0)) return null;

  return { longitude: coordinates[0], latitude: coordinates[1] };
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

const generateSku = async () => ({
  sku: await generateUniqueSku(),
});

const markProductViewed = async (
  traceId: string,
  userId: string,
  productId: string
) => {
  await getProductByIdOrThrow(traceId, productId);
  await addRecentlyViewedProduct(userId, productId);
  await deleteCache(REDIS_KEYS.PRODUCT_RECENTLY_VIEWED(userId));

  return { viewed: true };
};

const getRecentlyViewedProducts = async (userId: string) => {
  const cacheKey = REDIS_KEYS.PRODUCT_RECENTLY_VIEWED(userId);
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const productIds = await getRecentlyViewedProductIds(userId);
  if (productIds.length === 0) return [];

  const products = await Product.find({
    _id: { $in: productIds },
    isDeleted: false,
  })
    .select('title price discountPrice images stock')
    .lean();

  const productById = new Map(
    products.map((product) => [product._id.toString(), product])
  );

  const wishlistIds = await getWishlistProductIdSet(userId);
  const productsWithWishlist = productIds
    .map((productId) => productById.get(productId))
    .filter(Boolean)
    .map((product) => withWishlistFlag(product!, wishlistIds));

  await setCache(cacheKey, productsWithWishlist, 300);
  return productsWithWishlist;
};

const getTrendingProducts = async (userId?: string) => {
  const cacheKey = REDIS_KEYS.PRODUCT_LIST(
    `trending:${userId ?? 'anonymous'}`
  );
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const products = await Product.find({
    isDeleted: false,
    $or: [
      { avgRating: { $gt: 0 } },
      { ratingCount: { $gt: 0 } },
      { sold: { $gt: 0 } },
    ],
  })
    .populate(productPopulate)
    .sort({ avgRating: -1, ratingCount: -1, sold: -1, createdAt: -1 })
    .select('-__v')
    .lean();

  const wishlistIds = await getWishlistProductIdSet(userId);
  const result = withWishlistFlags(products, wishlistIds);

  await setCache(cacheKey, result, 300);
  return result;
};

const getAllProduct = async (
  traceId: string,
  query: TProductListQuery,
  userId?: string
) => {
  const productQuery = query as TProductFilterQuery;
  const cacheKey = REDIS_KEYS.PRODUCT_LIST(
    `all:${userId ?? 'anonymous'}:${JSON.stringify(query)}`
  );
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const filter: Record<string, unknown> = { isDeleted: false };
  const minPrice = toNumber(productQuery.minPrice ?? productQuery.minimumPrice);
  const maxPrice = toNumber(productQuery.maxPrice ?? productQuery.maximumPrice);
  const brands = toStringArray(productQuery.brand);
  const colors = toStringArray(productQuery.color);
  const sizes = toStringArray(productQuery.size);
  const gender = productQuery.gender || productQuery.collectionType;

  if (productQuery.category) filter.category = productQuery.category;
  if (gender && gender !== 'all') filter.collectionType = gender;
  if (brands.length > 0) filter.brand = { $in: brands };
  if (colors.length > 0) filter['colors.name'] = { $in: colors };
  if (sizes.length > 0) filter.sizes = { $in: sizes };
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.discountPrice = {
      ...(minPrice !== undefined ? { $gte: minPrice } : {}),
      ...(maxPrice !== undefined ? { $lte: maxPrice } : {}),
    };
  }

  let products = await Product.find(filter)
    .populate(productPopulate)
    .sort({ createdAt: -1 })
    .select('-__v')
    .lean();

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
  const result = withWishlistFlags(products, wishlistIds);

  await setCache(cacheKey, result, 300);
  return result;
};

const getMyProducts = async (vendorId: string) => {
  const cacheKey = REDIS_KEYS.PRODUCT_LIST(`my:${vendorId}`);
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const products = await Product.find({ vendorId, isDeleted: false })
    .populate(productPopulate)
    .sort({ createdAt: -1 })
    .select('-__v')
    .lean();

  const wishlistIds = await getWishlistProductIdSet(vendorId);
  const result = withWishlistFlags(products, wishlistIds);

  await setCache(cacheKey, result, 300);
  return result;
};

const getShopProducts = async (vendorId: string, userId?: string) => {
  const cacheKey = REDIS_KEYS.PRODUCT_LIST(
    `shop:${vendorId}:${userId ?? 'anonymous'}`
  );
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const products = await Product.find({ vendorId, isDeleted: false })
    .populate(productPopulate)
    .sort({ createdAt: -1 })
    .select('-__v')
    .lean();

  const wishlistIds = await getWishlistProductIdSet(userId);
  const result = withWishlistFlags(products, wishlistIds);

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
  createProduct,
  getAllProduct,
  getMyProducts,
  getShopProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  notifyMe,
};
