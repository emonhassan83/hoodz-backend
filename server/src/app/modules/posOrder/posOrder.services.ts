import mongoose from 'mongoose';
import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { POS_ORDER_STATUS } from '@/app/modules/posOrder/posOrder.constant';
import {
  assertPosOrderAccess,
  decrementPosItemStockOrThrow,
  getPosOrderOrThrow,
  restorePosItemStockOrThrow,
} from '@/app/modules/posOrder/posOrder.helpers';
import { PosOrder } from '@/app/modules/posOrder/posOrder.model';
import {
  TCreatePosOrderPayload,
  TPosOrderRequester,
  TUpdatePosOrderPayload,
} from '@/app/modules/posOrder/posOrder.types';
import { Product } from '@/app/modules/product/product.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { deleteCachePattern } from '@/app/redis/helpers';

const posOrderPopulate = [
  { path: 'soldBy', select: 'name email phone profileAvatar role' },
  { path: 'shop', select: 'name email phone profileAvatar coverPhoto' },
  { path: 'items.product', select: 'title images sku price discountPrice inventoryType stock variants vendor' },
];

/** Creates a POS order and decrements product inventory in one transaction. */
const create = async (
  traceId: string,
  requester: TPosOrderRequester,
  payload: TCreatePosOrderPayload
) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    await Promise.all(
      payload.items.map((item) =>
        decrementPosItemStockOrThrow(traceId, requester.userId, item, session)
      )
    );

    const [posOrder] = await PosOrder.create(
      [
        {
          ...payload,
          soldBy: requester.userId,
          shop: requester.userId,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    await deleteCachePattern('product:*');

    return PosOrder.findById(posOrder._id).populate(posOrderPopulate).select('-__v');
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

/** Returns shopwise POS orders; admin may pass shop query or see all. */
const getPosOrders = async (
  requester: TPosOrderRequester,
  query: Record<string, unknown>
) => {
  const shopId =
    requester.role === USER_ROLE.vendor
      ? requester.userId
      : typeof query.shop === 'string' && query.shop
        ? query.shop
        : undefined;
  const filter = shopId
    ? { shop: shopId, isDeleted: false }
    : { isDeleted: false };

  const posOrderQuery = new QueryBuilder(
    PosOrder.find(filter).populate(posOrderPopulate).select('-__v').lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const earningMatch = {
    ...filter,
    status: POS_ORDER_STATUS.completed,
  };

  const [posOrders, meta, allProducts, todayEarningAgg, totalEarningAgg, totalOrders] =
    await Promise.all([
      posOrderQuery.modelQuery,
      posOrderQuery.countTotal(),
      Product.countDocuments({
        ...(shopId ? { vendor: shopId } : {}),
        isDeleted: false,
        stock: { $gt: 0 },
      }),
      PosOrder.aggregate([
        { $match: { ...earningMatch, createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: '$totalCost' } } },
      ]),
      PosOrder.aggregate([
        { $match: earningMatch },
        { $group: { _id: null, total: { $sum: '$totalCost' } } },
      ]),
      PosOrder.countDocuments(filter),
    ]);

  return {
    meta,
    data: {
      allProducts,
      todayEarning: Number((todayEarningAgg[0]?.total ?? 0).toFixed(2)),
      totalEarning: Number((totalEarningAgg[0]?.total ?? 0).toFixed(2)),
      totalOrders,
      posOrders,
    },
  };
};

/** Returns one POS order after shopwise access verification. */
const getAPosOrder = async (
  traceId: string,
  posOrderId: string,
  requester: TPosOrderRequester
) => {
  const posOrder = await getPosOrderOrThrow(traceId, posOrderId);
  assertPosOrderAccess(traceId, posOrder, requester);

  return PosOrder.findById(posOrder._id).populate(posOrderPopulate).select('-__v');
};

/** Updates POS order summary/status without mutating sold items. */
const updateAPosOrder = async (
  traceId: string,
  posOrderId: string,
  requester: TPosOrderRequester,
  payload: TUpdatePosOrderPayload
) => {
  const posOrder = await getPosOrderOrThrow(traceId, posOrderId);
  assertPosOrderAccess(traceId, posOrder, requester);

  return PosOrder.findByIdAndUpdate(posOrderId, payload, {
    returnDocument: 'after',
  })
    .populate(posOrderPopulate)
    .select('-__v');
};

/** Soft-deletes a POS order and restores product stock/sold. */
const removeAPosOrder = async (
  traceId: string,
  posOrderId: string,
  requester: TPosOrderRequester
) => {
  const posOrder = await getPosOrderOrThrow(traceId, posOrderId);
  assertPosOrderAccess(traceId, posOrder, requester);

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const current = await PosOrder.findOne({
      _id: posOrderId,
      isDeleted: false,
    }).session(session);
    if (!current) {
      throw new ApiError(HttpStatusCode.NotFound, 'POS order not found', traceId);
    }

    for (const item of current.items) {
      await restorePosItemStockOrThrow(
        traceId,
        current.shop.toString(),
        {
          product: item.product.toString(),
          variant: item.variant,
          quantity: item.quantity,
        },
        session
      );
    }

    current.isDeleted = true;
    current.status = POS_ORDER_STATUS.cancelled;
    await current.save({ session });
    await session.commitTransaction();
    await deleteCachePattern('product:*');

    return PosOrder.findById(current._id).populate(posOrderPopulate).select('-__v');
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

export const PosOrderService = {
  create,
  getPosOrders,
  getAPosOrder,
  updateAPosOrder,
  removeAPosOrder,
};
