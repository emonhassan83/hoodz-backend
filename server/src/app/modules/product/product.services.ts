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
  TProductListQuery,
  TProductPayload,
  TProductRequester,
} from '@/app/modules/product/product.types';
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

const productPopulate = [
  { path: 'vendorId', select: 'name email phone profileAvatar' },
  { path: 'category', select: 'title icon' },
];

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

const getAllProduct = async (
  query: TProductListQuery,
  userId?: string
) => {
  const cacheKey = REDIS_KEYS.PRODUCT_LIST(
    `all:${userId ?? 'anonymous'}:${JSON.stringify(query)}`
  );
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const filter: Record<string, unknown> = { isDeleted: false };

  if (query.category) filter.category = query.category;
  if (query.collectionType) filter.collectionType = query.collectionType;

  const products = await Product.find(filter)
    .populate(productPopulate)
    .sort({ createdAt: -1 })
    .select('-__v')
    .lean();

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
  createProduct,
  getAllProduct,
  getMyProducts,
  getShopProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  notifyMe,
};
