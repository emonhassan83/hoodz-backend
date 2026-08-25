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
  posOrder: { shop: Types.ObjectId; soldBy: Types.ObjectId },
  requester: TPosOrderRequester
) => {
  if (
    requester.role === USER_ROLE.admin ||
    posOrder.shop.toString() === requester.userId ||
    posOrder.soldBy.toString() === requester.userId
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
  const posOrder = await PosOrder.findOne({ _id: posOrderId, isDeleted: false });
  if (!posOrder) {
    throw new ApiError(HttpStatusCode.NotFound, 'POS order not found', traceId);
  }

  return posOrder;
};

/** Decrements product stock based on POS item inventory options. */
export const decrementPosItemStockOrThrow = async (
  traceId: string,
  shopId: string,
  item: TPosOrderItemPayload,
  session: ClientSession
) => {
  const product = await Product.findOne({
    _id: item.product,
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

  if (product.stock < item.quantity) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Product stock is not enough', traceId);
  }

  if (product.inventoryType === PRODUCT_INVENTORY_TYPE.single) {
    product.stock -= item.quantity;
    product.sold += item.quantity;
    await product.save({ session });
    return;
  }

  const matchedVariant = findPosVariant(product, item);

  if (!matchedVariant) {
    throw new ApiError(HttpStatusCode.NotFound, 'Product variant not found', traceId);
  }

  if (matchedVariant.quantity < item.quantity) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Product variant stock is not enough',
      traceId
    );
  }

  matchedVariant.quantity -= item.quantity;
  product.stock -= item.quantity;
  product.sold += item.quantity;
  await product.save({ session });
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

  return product.variants.find((variant) => {
    if (product.inventoryType === PRODUCT_INVENTORY_TYPE.colorOnly) {
      return variant.color?.code === item.variant?.color?.code;
    }

    return (
      variant.size === item.variant?.size &&
      variant.color?.code === item.variant?.color?.code
    );
  });
};

/** Restores product stock and sold count after a POS order is removed. */
export const restorePosItemStockOrThrow = async (
  traceId: string,
  shopId: string,
  item: TPosOrderItemPayload,
  session: ClientSession
) => {
  const product = await Product.findOne({
    _id: item.product,
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

  if (product.inventoryType === PRODUCT_INVENTORY_TYPE.single) {
    product.stock += item.quantity;
    product.sold = Math.max(0, (product.sold ?? 0) - item.quantity);
    await product.save({ session });
    return;
  }

  const matchedVariant = findPosVariant(product, item);
  if (!matchedVariant) {
    throw new ApiError(HttpStatusCode.NotFound, 'Product variant not found', traceId);
  }

  matchedVariant.quantity += item.quantity;
  product.stock += item.quantity;
  product.sold = Math.max(0, (product.sold ?? 0) - item.quantity);
  await product.save({ session });
};
