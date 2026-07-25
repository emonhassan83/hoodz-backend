import crypto from 'node:crypto';

import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { Category } from '@/app/modules/category/category.model';
import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';
import { PRODUCT_INVENTORY_TYPE } from '@/app/modules/product/product.constant';
import {
  Product,
  ProductStockNotify,
} from '@/app/modules/product/product.model';
import {
  TProductColor,
  TProductDashboardStats,
  TProductFilterQuery,
  TProductInventoryType,
  TProductPayload,
  TProductVariant,
} from '@/app/modules/product/product.types';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import { Wishlist } from '@/app/modules/wishlist/wishlist.model';
import { deleteCachePattern } from '@/app/redis/helpers';
import {
  getWishlistProductIds,
  syncWishlistProductIds,
} from '@/app/redis/helpers/wishlist';
import { sendNotificationViaQueue } from '@/app/utils/notification-queue.service';

export const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const toStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map(String).filter(Boolean)
    : typeof value === 'string' && value.trim()
      ? value.split(',').map((item) => item.trim()).filter(Boolean)
      : [];

export const getUserOrigin = async (
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
  product: { vendorId: Types.ObjectId },
  requester: { userId: string; role: string }
) => {
  const isOwner = product.vendorId.toString() === requester.userId;
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
  await deleteCachePattern('product:*');
};

/** Loads a user's wishlist ids from Redis and hydrates from MongoDB on miss. */
export const getWishlistProductIdSet = async (userId?: string) => {
  if (!userId) return new Set<string>();

  const redisProductIds = await getWishlistProductIds(userId);
  if (redisProductIds.length > 0) return new Set(redisProductIds);

  const dbProductIds = (
    await Wishlist.find({ user: userId }).select('product -_id').lean()
  ).map((item) => item.product.toString());

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
  const categoryTitle =
    product.category && typeof product.category === 'object'
      ? product.category.title
      : undefined;

  return {
    _id: product._id,
    categoryTitle,
    title: product.title,
    inventoryType: product.inventoryType,
    collectionType: product.collectionType,
    images: product.images ?? [],
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

