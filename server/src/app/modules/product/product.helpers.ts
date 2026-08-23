import crypto from 'node:crypto';

import { HttpStatusCode } from 'axios';
import mongoose, { Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { Cart } from '@/app/modules/cart/cart.model';
import { Category } from '@/app/modules/category/category.model';
import { Items } from '@/app/modules/items/items.model';
import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';
import { ORDER_STATUS } from '@/app/modules/orders/orders.constant';
import { Orders } from '@/app/modules/orders/orders.model';
import { PRODUCT_INVENTORY_TYPE } from '@/app/modules/product/product.constant';
import {
  Product,
  ProductStockNotify,
} from '@/app/modules/product/product.model';
import {
  TProductActor,
  TProductColor,
  TProductDashboardStats,
  TProductFilterQuery,
  TProductInventoryType,
  TProductPayload,
  TProductVariant,
} from '@/app/modules/product/product.types';
import { REVIEW_MODEL_TYPE } from '@/app/modules/review/review.constant';
import { Review } from '@/app/modules/review/review.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import {
  calculateDistanceKm,
  getGoogleDistanceMatrix,
} from '@/app/modules/user/user.helpers';
import { User } from '@/app/modules/user/user.model';
import {
  VOUCHER_STATUS,
  VOUCHER_TYPE,
} from '@/app/modules/voucher/voucher.constant';
import { Voucher } from '@/app/modules/voucher/voucher.model';
import { getWishlistProductReferenceIds } from '@/app/modules/wishlist/wishlist.helpers';
import { deleteCachePattern } from '@/app/redis/helpers';
import {
  getWishlistProductIds,
  syncWishlistProductIds,
} from '@/app/redis/helpers/wishlist';
import { REDIS_KEYS } from '@/app/redis/keys';
import { sendNotificationViaQueue } from '@/app/utils/notification-queue.service';

export const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const toStringArray = (value: unknown): string[] => {
  if (value == null) return [];
  const items = Array.isArray(value) ? value : [value];
  return [
    ...new Set(
      items.flatMap((item) =>
        String(item)
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      )
    ),
  ];
};

export const isObjectIdString = (value: string) =>
  /^[0-9a-fA-F]{24}$/.test(value);

export const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const exactInsensitive = (value: string) => ({
  $regex: `^${escapeRegex(value)}$`,
  $options: 'i',
});

export const buildProductListFilter = async (
  productQuery: TProductFilterQuery
) => {
  const filter: Record<string, unknown> = { isDeleted: false };
  const andFilters: Record<string, unknown>[] = [];

  const minPrice = toNumber(productQuery.minPrice ?? productQuery.minimumPrice);
  const maxPrice = toNumber(productQuery.maxPrice ?? productQuery.maximumPrice);
  const brandTypes = toStringArray(productQuery.brandType);
  const colors = [
    ...new Set([
      ...toStringArray(productQuery.colors),
      ...toStringArray(productQuery.color),
    ]),
  ];
  const sizes = [
    ...new Set([
      ...toStringArray(productQuery.sizes),
      ...toStringArray(productQuery.size),
    ]),
  ];
  const collectionTypes = toStringArray(
    productQuery.gender ?? productQuery.collectionType
  ).filter((value) => value.toLowerCase() !== 'all');
  const categoryValues = toStringArray(
    productQuery.category ?? productQuery.categories ?? productQuery.categoryId
  );
  const brandValues = toStringArray(productQuery.brand);
  const vendorValues = toStringArray(
    productQuery.vendor ?? productQuery.vendorId
  );

  const categoryIds = categoryValues.filter(isObjectIdString);
  const categoryTitles = categoryValues.filter((value) => !isObjectIdString(value));
  if (categoryTitles.length > 0) {
    const categories = await Category.find({
      $or: categoryTitles.map((title) => ({ title: exactInsensitive(title) })),
    })
      .select('_id')
      .lean();
    categoryIds.push(...categories.map((category) => category._id.toString()));
  }
  if (categoryValues.length > 0) {
    filter.category = { $in: [...new Set(categoryIds)] };
  }

  if (collectionTypes.length === 1) {
    filter.collectionType = collectionTypes[0].toLowerCase();
  }
  if (collectionTypes.length > 1) {
    filter.collectionType = {
      $in: collectionTypes.map((value) => value.toLowerCase()),
    };
  }

  if (brandTypes.length > 0) {
    filter.brandType = { $in: brandTypes.map((value) => value.toLowerCase()) };
  }

  if (brandValues.length === 1) {
    filter.brand = exactInsensitive(brandValues[0]);
  }
  if (brandValues.length > 1) {
    andFilters.push({
      $or: brandValues.map((brand) => ({ brand: exactInsensitive(brand) })),
    });
  }

  const vendorIds = vendorValues.filter(isObjectIdString);
  const vendorNames = vendorValues.filter((value) => !isObjectIdString(value));
  if (vendorNames.length > 0) {
    const vendors = await User.find({
      role: USER_ROLE.vendor,
      isDeleted: false,
      $or: vendorNames.map((name) => ({ name: exactInsensitive(name) })),
    })
      .select('_id')
      .lean();
    vendorIds.push(...vendors.map((vendor) => vendor._id.toString()));
  }
  if (vendorValues.length > 0) {
    filter.vendor = { $in: [...new Set(vendorIds)] };
  }

  if (colors.length > 0) {
    andFilters.push({
      $or: colors.map((color) => ({ 'colors.name': exactInsensitive(color) })),
    });
  }
  if (sizes.length > 0) {
    andFilters.push({
      $or: sizes.map((size) => ({ sizes: exactInsensitive(size) })),
    });
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.discountPrice = {
      ...(minPrice !== undefined ? { $gte: minPrice } : {}),
      ...(maxPrice !== undefined ? { $lte: maxPrice } : {}),
    };
  }
  if (andFilters.length > 0) filter.$and = andFilters;

  return filter;
};

export const getUserOrigin = async (
  traceId: string,
  userId?: string,
  query?: TProductFilterQuery
) => {
  const queryLatitude = toNumber(query?.latitude ?? query?.lat);
  const queryLongitude = toNumber(
    query?.longitude ?? query?.lng ?? query?.lang
  );
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

export const calculateDiscountPrice = (price: number, discount = 0) =>
  Number((price - price * (discount / 100)).toFixed(2));

/** Builds product sizes, colors, and total stock from variants. */
export const buildVariantSummary = (variants: TProductVariant[]) => {
  const sizeSet = new Set<string>();
  const colorMap = new Map<string, TProductColor>();
  const stock = variants.reduce((total, variant) => {
    if (variant.size) sizeSet.add(variant.size);
    if (variant.color) {
      colorMap.set(`${variant.color.code}:${variant.color.name}`, variant.color);
    }
    return total + variant.quantity;
  }, 0);

  return {
    sizes: [...sizeSet],
    colors: [...colorMap.values()],
    stock,
  };
};

/** Normalizes stock, variants, sizes, and colors for the selected inventory mode. */
const buildInventoryFields = (
  payload: Partial<TProductPayload>,
  existing?: {
    inventoryType?: TProductInventoryType;
    stock?: number;
    variants?: TProductVariant[];
  }
) => {
  const inventoryType =
    payload.inventoryType ??
    existing?.inventoryType ??
    PRODUCT_INVENTORY_TYPE.sizeColor;

  if (inventoryType === PRODUCT_INVENTORY_TYPE.single) {
    return {
      inventoryType,
      variants: [],
      sizes: [],
      colors: [],
      stock: payload.stock ?? existing?.stock ?? 0,
    };
  }

  const variants = payload.variants ?? existing?.variants ?? [];
  const normalizedVariants = variants.map((variant) => ({
    ...variant,
    size:
      inventoryType === PRODUCT_INVENTORY_TYPE.colorOnly
        ? null
        : variant.size,
  }));
  const variantSummary = buildVariantSummary(normalizedVariants);

  return {
    inventoryType,
    variants: normalizedVariants,
    ...variantSummary,
  };
};

/** Throws when option payload does not match the selected inventory mode. */
export const assertInventoryOptionsValid = (
  traceId: string,
  payload: Partial<TProductPayload>,
  inventoryType: TProductInventoryType
) => {
  if (!payload.variants || inventoryType === PRODUCT_INVENTORY_TYPE.single) {
    return;
  }

  if (payload.variants.length === 0) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'At least one inventory option is required',
      traceId
    );
  }

  payload.variants.forEach((variant) => {
    if (
      inventoryType === PRODUCT_INVENTORY_TYPE.sizeColor &&
      !variant.size
    ) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'Size is required for size_color inventory products',
        traceId
      );
    }

    if (!variant.color?.code) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'Color is required for option based inventory products',
        traceId
      );
    }
  });
};

/** Builds normalized product write data and computed discount/stock fields. */
export const buildProductWritePayload = (
  payload: Partial<TProductPayload>,
  existing?: {
    price: number;
    discount?: number;
    inventoryType?: TProductInventoryType;
    stock?: number;
    variants?: TProductVariant[];
  }
) => {
  const price = payload.price ?? existing?.price ?? 0;
  const discount = payload.discount ?? existing?.discount ?? 0;
  const inventoryFields = buildInventoryFields(payload, existing);

  return {
    ...payload,
    discount,
    discountPrice: calculateDiscountPrice(price, discount),
    ...inventoryFields,
  };
};

/** Builds vendor product dashboard metrics from the loaded product list. */
export const buildVendorProductStats = (
  products: Array<{
    category?: unknown;
    price?: number;
    discountPrice?: number;
    stock?: number;
  }>
): TProductDashboardStats => {
  const categoryCount = new Map<string, number>();
  const priceDistribution = {
    under50: 0,
    from50To200: 0,
    over200: 0,
  };
  const stockInsights = {
    high: 0,
    medium: 0,
    low: 0,
  };

  const overview = products.reduce(
    (stats, product) => {
      const stock = product.stock ?? 0;
      const unitPrice = product.discountPrice ?? product.price ?? 0;
      const categoryTitle =
        product.category &&
        typeof product.category === 'object' &&
        'title' in product.category
          ? String(product.category.title)
          : undefined;

      if (categoryTitle) {
        categoryCount.set(
          categoryTitle,
          (categoryCount.get(categoryTitle) ?? 0) + 1
        );
      }

      if (unitPrice < 50) priceDistribution.under50 += 1;
      else if (unitPrice <= 200) priceDistribution.from50To200 += 1;
      else priceDistribution.over200 += 1;

      if (stock > 50) stockInsights.high += 1;
      else if (stock >= 10) stockInsights.medium += 1;
      else if (stock > 0) stockInsights.low += 1;

      return {
        allProducts: stats.allProducts + 1,
        totalValue: stats.totalValue + unitPrice * stock,
        lowStock: stats.lowStock + (stock > 0 && stock < 10 ? 1 : 0),
        outOfStock: stats.outOfStock + (stock === 0 ? 1 : 0),
      };
    },
    {
      allProducts: 0,
      totalValue: 0,
      lowStock: 0,
      outOfStock: 0,
    }
  );

  return {
    overview: {
      ...overview,
      totalValue: Number(overview.totalValue.toFixed(2)),
    },
    analytics: {
      topCategories: [...categoryCount.entries()]
        .map(([title, count]) => ({ title, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      priceDistribution: [
        { label: 'Under $50', count: priceDistribution.under50 },
        { label: '$50 - $200', count: priceDistribution.from50To200 },
        { label: 'Over $200', count: priceDistribution.over200 },
      ],
      stockInsights: [
        { label: 'High Stock (>50)', count: stockInsights.high },
        { label: 'Medium Stock (10-50)', count: stockInsights.medium },
        { label: 'Low Stock (<10)', count: stockInsights.low },
      ],
    },
  };
};

/** Throws when another product already owns the requested SKU. */
export const assertSkuAvailable = async (
  traceId: string,
  sku: string,
  excludeProductId?: string
) => {
  const exists = await Product.findOne({
    sku,
    ...(excludeProductId ? { _id: { $ne: excludeProductId } } : {}),
  });

  if (exists) {
    throw new ApiError(HttpStatusCode.Conflict, 'Product SKU already exists', traceId);
  }
};

/** Throws when the category does not exist. */
export const assertCategoryExists = async (traceId: string, categoryId: string) => {
  const exists = await Category.exists({ _id: categoryId });
  if (!exists) {
    throw new ApiError(HttpStatusCode.NotFound, 'Category not found', traceId);
  }
};

/** Throws when admin targets a missing or non-vendor user. */
export const assertVendorExists = async (traceId: string, vendorId: string) => {
  const exists = await User.exists({
    _id: vendorId,
    role: USER_ROLE.vendor,
    isDeleted: false,
  });

  if (!exists) {
    throw new ApiError(HttpStatusCode.NotFound, 'Vendor not found', traceId);
  }
};

/** Throws when a product lookup did not return a product. */
export const assertProductExists = (product: unknown, traceId: string) => {
  if (!product) {
    throw new ApiError(HttpStatusCode.NotFound, 'Product not found', traceId);
  }
};

/** Allows only admins or owning vendors to mutate a product. */
export const assertProductAccess = (
  traceId: string,
  product: { vendor: Types.ObjectId },
  requester: { userId: string; role: string }
) => {
  const isOwner = product.vendor.toString() === requester.userId;
  const isAdmin = requester.role === USER_ROLE.admin;

  if (!isOwner && !isAdmin) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You can only manage your own products', traceId);
  }
};

/** Returns a product document or throws a traceable API error. */
export const getProductByIdOrThrow = async (traceId: string, productId: string) => {
  const product = await Product.findOne({ _id: productId, isDeleted: false });
  assertProductExists(product, traceId);
  return product!;
};

/** Creates a readable SKU candidate with timestamp and random entropy. */
const createSkuCandidate = () => {
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `HDZ-${timestamp}-${random}`;
};

/** Generates a unique product SKU with bounded retries. */
export const generateUniqueSku = async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const sku = createSkuCandidate();
    const exists = await Product.exists({ sku });
    if (!exists) return sku;
  }

  throw new ApiError(
    HttpStatusCode.InternalServerError,
    'Failed to generate unique SKU'
  );
};

/** Clears product list/detail caches after product or wishlist writes. */
export const invalidateProductCaches = async () => {
  await Promise.all([
    deleteCachePattern('product:*'),
    deleteCachePattern(`${REDIS_KEYS.CATEGORY_LIST}*`),
  ]);
};

/** Loads a user's wishlist ids from Redis and hydrates from MongoDB on miss. */
export const getWishlistProductIdSet = async (userId?: string) => {
  if (!userId) return new Set<string>();

  const redisProductIds = await getWishlistProductIds(userId);
  if (redisProductIds.length > 0) return new Set(redisProductIds);

  const dbProductIds = await getWishlistProductReferenceIds(userId);

  await syncWishlistProductIds(userId, dbProductIds);
  return new Set(dbProductIds);
};

/** Adds an isWishlisted boolean to one product result. */
export const withWishlistFlag = <T extends { _id: unknown }>(
  product: T,
  wishlistIds: Set<string>
) => ({
  ...product,
  isWishlisted: wishlistIds.has(String(product._id)),
});

/** Adds isWishlisted boolean to a product list. */
export const withWishlistFlags = <T extends { _id: unknown }>(
  products: T[],
  wishlistIds: Set<string>
) => products.map((product) => withWishlistFlag(product, wishlistIds));

/** Shapes product list cards with only frontend list fields. */
export const formatProductListItem = (
  product: Record<string, any>,
  wishlistIds: Set<string>
) => {
  const category =
    product.category && typeof product.category === 'object'
      ? {
          _id: product.category._id,
          title: product.category.title,
        }
      : product.category;

  return {
    _id: product._id,
    category,
    title: product.title,
    inventoryType: product.inventoryType,
    collectionType: product.collectionType,
    brand: product.brand ?? null,
    brandType: product.brandType,
    banner: product.banner ?? null,
    price: product.price ?? 0,
    discount: product.discount ?? 0,
    discountPrice: product.discountPrice ?? product.price ?? 0,
    stock: product.stock ?? 0,
    avgRating: product.avgRating ?? 0,
    ratingCount: product.ratingCount ?? 0,
    inStock: Number(product.stock ?? 0) > 0,
    isWishlisted: wishlistIds.has(String(product._id)),
  };
};

/** Shapes multiple products for list/card API responses. */
export const formatProductListItems = (
  products: Record<string, any>[],
  wishlistIds: Set<string>
) => products.map((product) => formatProductListItem(product, wishlistIds));

/** Notifies stock subscribers when a previously unavailable product is restocked. */
export const notifyProductRestockedSubscribers = async (
  productId: string,
  productTitle: string
) => {
  const subscriptions = await ProductStockNotify.find({
    product: productId,
    notifiedAt: null,
  }).lean();

  if (subscriptions.length === 0) return 0;

  const users = await User.find({
    _id: { $in: subscriptions.map((item) => item.user) },
    isDeleted: false,
  })
    .select('_id fcmToken')
    .lean();

  await Promise.all(
    users.map((user) =>
      sendNotificationViaQueue({
        userId: user._id.toString(),
        fcmToken: user.fcmToken,
        channel: 'both',
        title: 'Product back in stock',
        message: `${productTitle} is available again.`,
        data: {
          modelType: NOTIFICATION_MODEL_TYPE.Product,
          reference: productId,
        },
      })
    )
  );

  await ProductStockNotify.updateMany(
    {
      product: productId,
      user: { $in: users.map((user) => user._id) },
      notifiedAt: null,
    },
    { notifiedAt: new Date() }
  );

  return users.length;
};

export const productPopulate = [
  { path: 'vendor', select: 'name email phone profileAvatar address location' },
  { path: 'category', select: 'title icon' },
];

export const productListSelect =
  '_id category vendor title inventoryType collectionType brand brandType banner price discount discountPrice stock avgRating ratingCount sold createdAt';

export const getProductActorKey = (actor: TProductActor) => {
  if (actor.userId) return `user:${actor.userId}`;
  if (actor.guestId) return `guest:${actor.guestId}`;
  return 'anonymous';
};

export const getPagination = (query: Record<string, unknown>) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const rawLimit = Number(query.limit ?? query.perPage) || 10;
  const limit = Math.min(Math.max(rawLimit, 1), 50);
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

export const getActorCartProductIds = async (actor: TProductActor) => {
  const cart = await Cart.findOne(
    actor.userId ? { userId: actor.userId } : { guestId: actor.guestId }
  )
    .select('items.productId')
    .lean();

  return (cart?.items ?? []).map((item: any) => item.productId.toString());
};

export const getActorOrderedProductCounts = async (userId?: string) => {
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

const GOOGLE_DESTINATION_LIMIT = 25;

export const getGoogleDistanceElements = async (
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

export const getRelationId = (relation: any) =>
  relation?._id?.toString?.() ?? relation?.toString?.() ?? null;

export const formatProductVendor = (vendor: any) => {
  if (!vendor || typeof vendor !== 'object') return null;

  return {
    _id: vendor._id,
    name: vendor.name ?? null,
    profileAvatar: vendor.profileAvatar ?? null,
  };
};

export const formatProductCategory = (category: any) => {
  if (!category || typeof category !== 'object') return null;

  return {
    _id: category._id,
    title: category.title ?? null,
  };
};

export const formatProductDetails = (product: any) => {
  const { vendor: _vendor, category: _category, __v: _version, ...details } =
    product;

  return details;
};

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

export const getSimilarProducts = async (
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

export const getProductVouchers = async (vendorId: string | null) => {
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

export const getLatestProductReviews = async (productId: string) =>
  Review.find({
    modelType: REVIEW_MODEL_TYPE.Product,
    reference: productId,
  })
    .populate([{ path: 'user', select: 'name profileAvatar' }])
    .select('_id user review files rating createdAt')
    .sort({ createdAt: -1 })
    .limit(3)
    .lean();

export const hasPurchasedProduct = async (
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

export const hasSubmittedProductReview = async (
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


