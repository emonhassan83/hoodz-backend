import { HttpStatusCode } from 'axios';
import { ClientSession, Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { PosOrder } from '@/app/modules/posOrder/posOrder.model';
import { TPosOrderItemPayload, TPosOrderRequester } from '@/app/modules/posOrder/posOrder.types';
import { PRODUCT_INVENTORY_TYPE } from '@/app/modules/product/product.constant';
import { Product } from '@/app/modules/product/product.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';

/** Checks whether a requester can access one POS order. */
export const assertPosOrderAccess = (
  traceId: string,
  posOrder: { shop: Types.ObjectId },
  requester: TPosOrderRequester
) => {
  if (
    requester.role === USER_ROLE.admin ||
    posOrder.shop.toString() === requester.userId
  ) {
    return;
  }

  throw new ApiError(
    HttpStatusCode.Forbidden,
    'You are not allowed to access this POS order',
    traceId
  );
};

/** Returns a POS order and throws when not found. */
export const getPosOrderOrThrow = async (traceId: string, posOrderId: string) => {
  const posOrder = await PosOrder.findById(posOrderId);
  if (!posOrder) {
    throw new ApiError(HttpStatusCode.NotFound, 'POS order not found', traceId);
  }

  return posOrder;
};

const normalizePosSize = (size?: string | null) => {
  const value = size?.trim();
  return value ? value.toLowerCase() : null;
};

const normalizePosColorCode = (code?: string | null) => {
  const value = code?.trim().toLowerCase().replace(/^#/, '');
  return value ? value : null;
};

/** Accepts a product id or a variant id. */
export const resolvePosProductId = async (productId: string) => {
  const product = await Product.findOne({
    _id: productId,
    isDeleted: false,
  }).select('_id');
  if (product) return product._id.toString();

  const productByVariant = await Product.findOne({
    'variants._id': productId,
    isDeleted: false,
  }).select('_id');

  return productByVariant?._id.toString() ?? productId;
};

const findPosVariant = (
  product: {
    inventoryType: string;
    variants: Array<{
      size?: string | null;
      color?: { code?: string | null } | null;
      quantity: number;
    }>;
  },
  item: TPosOrderItemPayload
) => {
  if (product.inventoryType === PRODUCT_INVENTORY_TYPE.single) return null;

  const size = normalizePosSize(item.variant?.size);
  const color = normalizePosColorCode(item.variant?.color?.code);

  return product.variants.find((variant) => {
    const variantColor = normalizePosColorCode(variant.color?.code);
    if (product.inventoryType === PRODUCT_INVENTORY_TYPE.colorOnly) {
      return variantColor === color;
    }

    return normalizePosSize(variant.size) === size && variantColor === color;
  });
};

const syncProductStockFromVariants = (product: {
  inventoryType: string;
  stock: number;
  variants: Array<{ quantity: number }>;
}) => {
  if (product.inventoryType === PRODUCT_INVENTORY_TYPE.single) return;
  product.stock = product.variants.reduce(
    (total, variant) => total + (variant.quantity ?? 0),
    0
  );
};

const applyPosItemToProduct = (
  traceId: string,
  product: {
    inventoryType: string;
    stock: number;
    sold: number;
    variants: Array<{
      size?: string | null;
      color?: { code?: string | null } | null;
      quantity: number;
    }>;
    markModified?: (path: string) => void;
  },
  item: TPosOrderItemPayload,
  mode: 'sell' | 'restore'
) => {
  const quantity = item.quantity;
  const soldDelta = mode === 'sell' ? quantity : -quantity;

  if (product.inventoryType === PRODUCT_INVENTORY_TYPE.single) {
    if (mode === 'sell' && product.stock < quantity) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'Product stock is not enough',
        traceId
      );
    }
    product.stock += mode === 'sell' ? -quantity : quantity;
    product.sold = Math.max(0, (product.sold ?? 0) + soldDelta);
    return;
  }

  const matchedVariant = findPosVariant(product, item);
  if (!matchedVariant) {
    throw new ApiError(HttpStatusCode.NotFound, 'Product variant not found', traceId);
  }

  if (mode === 'sell' && matchedVariant.quantity < quantity) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Product variant stock is not enough',
      traceId
    );
  }

  matchedVariant.quantity += mode === 'sell' ? -quantity : quantity;
  product.sold = Math.max(0, (product.sold ?? 0) + soldDelta);
  product.markModified?.('variants');
};

/** Updates product stock, sold, and variant quantity for POS create/remove. */
export const applyPosItemsInventoryOrThrow = async (
  traceId: string,
  shopId: string,
  items: TPosOrderItemPayload[],
  session: ClientSession,
  mode: 'sell' | 'restore'
) => {
  const resolvedItems: TPosOrderItemPayload[] = [];
  for (const item of items) {
    resolvedItems.push({
      ...item,
      product: await resolvePosProductId(item.product),
    });
  }

  const itemsByProduct = new Map<string, TPosOrderItemPayload[]>();
  for (const item of resolvedItems) {
    const group = itemsByProduct.get(item.product) ?? [];
    group.push(item);
    itemsByProduct.set(item.product, group);
  }

  for (const [productId, productItems] of itemsByProduct) {
    const product = await Product.findOne({
      _id: productId,
      vendor: shopId,
      isDeleted: false,
    }).session(session);
    if (!product) {
      throw new ApiError(
        HttpStatusCode.NotFound,
        'Product not found for this shop',
        traceId
      );
    }

    for (const item of productItems) {
      applyPosItemToProduct(traceId, product, item, mode);
    }

    syncProductStockFromVariants(product);
    await product.save({ session });
  }

  return resolvedItems;
};

const roundMoney = (value: number) => Number(value.toFixed(2));

const getPosItemUnitPrice = (product: { price: number; discountPrice?: number }) =>
  roundMoney(product.discountPrice || product.price || 0);

/** Applies discount and tax as percentages of subTotal (tax after discount). */
export const calculatePosOrderTotals = (
  subTotal: number,
  discountPercent = 0,
  taxPercent = 0
) => {
  const discountAmount = roundMoney(subTotal * (discountPercent / 100));
  const afterDiscount = roundMoney(subTotal - discountAmount);
  const taxAmount = roundMoney(afterDiscount * (taxPercent / 100));

  return {
    discount: discountPercent,
    tax: taxPercent,
    discountAmount,
    taxAmount,
    totalAmount: roundMoney(afterDiscount + taxAmount),
  };
};

/** Quotes POS lines from shop products: auto subTotal and totalAmount. */
export const buildPosOrderQuote = async (
  traceId: string,
  shopId: string,
  payload: {
    items: TPosOrderItemPayload[];
    discount?: number;
    tax?: number;
  }
) => {
  const discount = payload.discount ?? 0;
  const tax = payload.tax ?? 0;
  const items = [];

  for (const item of payload.items) {
    const productId = await resolvePosProductId(item.product);
    const product = await Product.findOne({
      _id: productId,
      vendor: shopId,
      isDeleted: false,
    }).select('title sku price discountPrice inventoryType stock variants');
    if (!product) {
      throw new ApiError(
        HttpStatusCode.NotFound,
        'Product not found for this shop',
        traceId
      );
    }

    if (product.stock < item.quantity) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'Product stock is not enough',
        traceId
      );
    }

    if (product.inventoryType !== PRODUCT_INVENTORY_TYPE.single) {
      const matchedVariant = findPosVariant(product, item);
      if (!matchedVariant) {
        throw new ApiError(
          HttpStatusCode.NotFound,
          'Product variant not found',
          traceId
        );
      }
      if (matchedVariant.quantity < item.quantity) {
        throw new ApiError(
          HttpStatusCode.BadRequest,
          'Product variant stock is not enough',
          traceId
        );
      }
    }

    const unitPrice = getPosItemUnitPrice(product);
    items.push({
      product: product._id,
      title: product.title,
      sku: product.sku,
      variant: item.variant ?? null,
      quantity: item.quantity,
      unitPrice,
      totalPrice: roundMoney(unitPrice * item.quantity),
    });
  }

  const subTotal = roundMoney(items.reduce((total, item) => total + item.totalPrice, 0));

  return {
    items,
    subTotal,
    ...calculatePosOrderTotals(subTotal, discount, tax),
  };
};

/** Formats a POS order for the shop list card. */
export const formatPosOrderListCard = (order: {
  _id: Types.ObjectId;
  items: Array<{
    product?: any;
    variant?: {
      size?: string | null;
      color?: { code?: string | null; name?: string | null } | null;
    } | null;
    quantity: number;
  }>;
  subTotal: number;
  discount: number;
  tax: number;
  totalAmount: number;
  createdAt: Date;
}) => ({
  _id: order._id,
  items: order.items.map((item) => {
    const populated = item.product && item.product._id ? item.product : null;

    return {
      product: populated
        ? {
            _id: populated._id,
            title: populated.title ?? '',
            banner: populated.banner ?? '',
          }
        : item.product
          ? { _id: item.product, title: '', banner: '' }
          : null,
      variant: item.variant ?? null,
      quantity: item.quantity,
    };
  }),
  subTotal: order.subTotal,
  discount: order.discount,
  tax: order.tax,
  totalAmount: order.totalAmount,
  createdAt: order.createdAt,
});
