import crypto from 'node:crypto';

import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { Category } from '@/app/modules/category/category.model';
import { Product } from '@/app/modules/product/product.model';
import {
  TProductColor,
  TProductPayload,
  TProductVariant,
} from '@/app/modules/product/product.types';
import { USER_ROLE } from '@/app/modules/user/user.constant';

export const calculateDiscountPrice = (price: number, discount = 0) =>
  Number((price - price * (discount / 100)).toFixed(2));

export const buildVariantSummary = (variants: TProductVariant[]) => {
  const sizeSet = new Set<string>();
  const colorMap = new Map<string, TProductColor>();
  const stock = variants.reduce((total, variant) => {
    sizeSet.add(variant.size);
    colorMap.set(`${variant.color.code}:${variant.color.name}`, variant.color);
    return total + variant.quantity;
  }, 0);

  return {
    sizes: [...sizeSet],
    colors: [...colorMap.values()],
    stock,
  };
};

export const buildProductWritePayload = (
  payload: Partial<TProductPayload>,
  existing?: { price: number; discount: number; variants: TProductVariant[] }
) => {
  const price = payload.price ?? existing?.price ?? 0;
  const discount = payload.discount ?? existing?.discount ?? 0;
  const variants = payload.variants ?? existing?.variants ?? [];
  const variantSummary = buildVariantSummary(variants);

  return {
    ...payload,
    discount,
    discountPrice: calculateDiscountPrice(price, discount),
    ...variantSummary,
  };
};

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

export const assertCategoryExists = async (traceId: string, categoryId: string) => {
  const exists = await Category.exists({ _id: categoryId });
  if (!exists) {
    throw new ApiError(HttpStatusCode.NotFound, 'Category not found', traceId);
  }
};

export const assertProductExists = (product: unknown, traceId: string) => {
  if (!product) {
    throw new ApiError(HttpStatusCode.NotFound, 'Product not found', traceId);
  }
};

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

export const getProductByIdOrThrow = async (traceId: string, productId: string) => {
  const product = await Product.findOne({ _id: productId, isDeleted: false });
  assertProductExists(product, traceId);
  return product!;
};

const createSkuCandidate = () => {
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `HDZ-${timestamp}-${random}`;
};

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
