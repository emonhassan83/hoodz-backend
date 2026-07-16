import {
  assertCategoryExists,
  assertProductAccess,
  assertProductExists,
  assertSkuAvailable,
  buildProductWritePayload,
  generateUniqueSku,
  getProductByIdOrThrow,
  TProductPayload,
} from '@/app/modules/product/product.helpers';
import { Product } from '@/app/modules/product/product.model';

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

  return Product.create({
    ...buildProductWritePayload(payload),
    vendorId,
  });
};

const generateSku = async () => ({
  sku: await generateUniqueSku(),
});

const getAllProduct = async (query: Record<string, unknown>) => {
  const filter: Record<string, unknown> = { isDeleted: false };

  if (query.category) filter.category = query.category;
  if (query.collectionType) filter.collectionType = query.collectionType;

  return Product.find(filter)
    .populate(productPopulate)
    .sort({ createdAt: -1 })
    .select('-__v')
    .lean();
};

const getMyProducts = async (vendorId: string) =>
  Product.find({ vendorId, isDeleted: false })
    .populate(productPopulate)
    .sort({ createdAt: -1 })
    .select('-__v')
    .lean();

const getShopProducts = async (vendorId: string) =>
  Product.find({ vendorId, isDeleted: false })
    .populate(productPopulate)
    .sort({ createdAt: -1 })
    .select('-__v')
    .lean();

const getProductById = async (traceId: string, productId: string) => {
  const product = await Product.findOne({ _id: productId, isDeleted: false })
    .populate(productPopulate)
    .select('-__v')
    .lean();

  assertProductExists(product, traceId);
  return product;
};

const updateProduct = async (
  traceId: string,
  productId: string,
  requester: { userId: string; role: string },
  payload: Partial<TProductPayload>
) => {
  const product = await getProductByIdOrThrow(traceId, productId);
  assertProductAccess(traceId, product, requester);

  await Promise.all([
    payload.sku
      ? assertSkuAvailable(traceId, payload.sku, productId)
      : Promise.resolve(),
    payload.category
      ? assertCategoryExists(traceId, payload.category)
      : Promise.resolve(),
  ]);

  return Product.findByIdAndUpdate(
    productId,
    buildProductWritePayload(payload, product),
    { returnDocument: 'after' }
  )
    .populate(productPopulate)
    .select('-__v');
};

const deleteProduct = async (
  traceId: string,
  productId: string,
  requester: { userId: string; role: string }
) => {
  const product = await getProductByIdOrThrow(traceId, productId);
  assertProductAccess(traceId, product, requester);

  return Product.findByIdAndUpdate(
    productId,
    { isDeleted: true },
    { returnDocument: 'after' }
  ).select('-__v');
};

export const ProductService = {
  generateSku,
  createProduct,
  getAllProduct,
  getMyProducts,
  getShopProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};
