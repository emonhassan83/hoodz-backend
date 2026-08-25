import mongoose from 'mongoose';
import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import {
  assertPosOrderAccess,
  applyPosItemsInventoryOrThrow,
  buildPosOrderQuote,
  calculatePosOrderTotals,
  formatPosOrderListCard,
  getPosOrderOrThrow,
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
  { path: 'shop', select: 'name email phone profileAvatar coverPhoto' },
  {
    path: 'items.product',
    select: 'title images sku price discountPrice inventoryType stock variants vendor banner',
  },
];

const posOrderListPopulate = [{ path: 'items.product', select: 'title banner' }];

/** Quotes POS totals from shop items, discount, and tax without creating an order. */
const getPosOrderSummary = async (
  traceId: string,
  requester: TPosOrderRequester,
  payload: TCreatePosOrderPayload
) => buildPosOrderQuote(traceId, requester.userId, payload);

/** Creates a POS order and decrements product inventory in one transaction. */
const create = async (
  traceId: string,
  requester: TPosOrderRequester,
  payload: TCreatePosOrderPayload
) => {
  const quote = await buildPosOrderQuote(traceId, requester.userId, payload);
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const soldItems = await applyPosItemsInventoryOrThrow(
      traceId,
      requester.userId,
      payload.items,
      session,
      'sell'
    );

    const [posOrder] = await PosOrder.create(
      [
        {
          items: soldItems,
          subTotal: quote.subTotal,
          discount: quote.discount,
          tax: quote.tax,
          totalAmount: quote.totalAmount,
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
  const shopObjectId =
    shopId && mongoose.Types.ObjectId.isValid(shopId)
      ? new mongoose.Types.ObjectId(shopId)
      : undefined;
  const filter = shopObjectId ? { shop: shopObjectId } : {};
  const { shop: _shop, ...listQuery } = query;

  const posOrderQuery = new QueryBuilder(
    PosOrder.find(filter)
      .populate(posOrderListPopulate)
      .select('_id items subTotal discount tax totalAmount createdAt')
      .lean(),
    listQuery
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const earningValue = {
    $ifNull: ['$totalAmount', { $ifNull: ['$totalCost', 0] }],
  };

  const [posOrders, meta, allProducts, todayEarningAgg, totalEarningAgg, totalOrders] =
    await Promise.all([
      posOrderQuery.modelQuery,
      posOrderQuery.countTotal(),
      Product.countDocuments({
        ...(shopObjectId ? { vendor: shopObjectId } : {}),
        isDeleted: false,
        stock: { $gt: 0 },
      }),
      PosOrder.aggregate([
        { $match: { ...filter, createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: earningValue } } },
      ]),
      PosOrder.aggregate([
        { $match: filter },
        { $group: { _id: null, total: { $sum: earningValue } } },
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
      posOrders: posOrders.map(formatPosOrderListCard),
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

/** Updates POS discount/tax and recalculates totalAmount. */
const updateAPosOrder = async (
  traceId: string,
  posOrderId: string,
  requester: TPosOrderRequester,
  payload: TUpdatePosOrderPayload
) => {
  const posOrder = await getPosOrderOrThrow(traceId, posOrderId);
  assertPosOrderAccess(traceId, posOrder, requester);

  const totals = calculatePosOrderTotals(
    posOrder.subTotal,
    payload.discount,
    payload.tax
  );

  return PosOrder.findByIdAndUpdate(
    posOrderId,
    {
      discount: totals.discount,
      tax: totals.tax,
      totalAmount: totals.totalAmount,
    },
    { returnDocument: 'after' }
  )
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

    const current = await PosOrder.findById(posOrderId).session(session);
    if (!current) {
      throw new ApiError(HttpStatusCode.NotFound, 'POS order not found', traceId);
    }

    await applyPosItemsInventoryOrThrow(
      traceId,
      current.shop.toString(),
      current.items.map((item) => ({
        product: item.product.toString(),
        variant: item.variant,
        quantity: item.quantity,
      })),
      session,
      'restore'
    );

    await current.deleteOne({ session });
    await session.commitTransaction();
    await deleteCachePattern('product:*');

    return { _id: current._id };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

export const PosOrderService = {
  getPosOrderSummary,
  create,
  getPosOrders,
  getAPosOrder,
  updateAPosOrder,
  removeAPosOrder,
};
