import mongoose from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import {
  assertPosOrderAccess,
  decrementPosItemStockOrThrow,
  getPosOrderOrThrow,
} from '@/app/modules/posOrder/posOrder.helpers';
import { PosOrder } from '@/app/modules/posOrder/posOrder.model';
import {
  TCreatePosOrderPayload,
  TPosOrderRequester,
  TUpdatePosOrderPayload,
} from '@/app/modules/posOrder/posOrder.types';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { deleteCachePattern } from '@/app/redis/helpers';

const posOrderPopulate = [
  { path: 'soldBy', select: 'name email phone profileAvatar role' },
  { path: 'shop', select: 'name email phone profileAvatar coverPhoto' },
  { path: 'items.product', select: 'title images sku price discountPrice inventoryType stock variants vendorId' },
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
  const filter =
    requester.role === USER_ROLE.admin
      ? { isDeleted: false }
      : { shop: requester.userId, isDeleted: false };

  const posOrderQuery = new QueryBuilder(
    PosOrder.find(filter).populate(posOrderPopulate).select('-__v').lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [data, meta] = await Promise.all([
    posOrderQuery.modelQuery,
    posOrderQuery.countTotal(),
  ]);

  return { meta, data };
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

export const PosOrderService = {
  create,
  getPosOrders,
  getAPosOrder,
  updateAPosOrder,
};
