import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { buildCartItemMatch } from '@/app/modules/cart/cart.helpers';
import { Cart } from '@/app/modules/cart/cart.model';
import { Items } from '@/app/modules/items/items.model';
import {
  assertOrderAccess,
  createOrderItems,
  distributeDeliveryCharge,
  getDeliveryChargeFromSettingsOrThrow,
  groupCartItemsByAuthor,
  resolveCheckoutItemsOrThrow,
} from '@/app/modules/orders/orders.helpers';
import { Orders } from '@/app/modules/orders/orders.model';
import {
  TChangeOrderStatusPayload,
  TCreateOrderPayload,
  TOrderRequester,
} from '@/app/modules/orders/orders.types';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { deleteCachePattern } from '@/app/redis/helpers';
import { clearCartCache } from '@/app/redis/helpers/cart';

const orderPopulate = [
  { path: 'user', select: 'name email phone profileAvatar' },
  { path: 'author', select: 'name email phone profileAvatar coverPhoto' },
];

const invalidateOrderCaches = async () => {
  await Promise.all([
    deleteCachePattern('order:*'),
    deleteCachePattern('product:*'),
    deleteCachePattern('cart:*'),
  ]);
};

/** Returns checkout preview without creating orders or items. */
const getOrderSummary = async (
  traceId: string,
  payload: TCreateOrderPayload
) => {
  const checkoutItems = await resolveCheckoutItemsOrThrow(traceId, payload.items);
  const groupedItems = groupCartItemsByAuthor(checkoutItems);
  const deliveryCharge = await getDeliveryChargeFromSettingsOrThrow(
    traceId,
    payload.orderData.billingDetails.city,
    payload.orderData.deliveryType
  );
  const deliveryCharges = distributeDeliveryCharge(
    deliveryCharge,
    groupedItems.size
  );

  const orders = [...groupedItems.entries()].map(([authorId, items], index) => {
    const amount = Number(
      items.reduce((total, item) => total + item.totalPrice, 0).toFixed(2)
    );
    const orderDeliveryCharge = deliveryCharges[index] ?? 0;

    return {
      author: authorId,
      amount,
      deliveryCharge: orderDeliveryCharge,
      totalAmount: Number((amount + orderDeliveryCharge).toFixed(2)),
      items,
    };
  });

  const amount = Number(
    orders.reduce((total, order) => total + order.amount, 0).toFixed(2)
  );

  return {
    amount,
    deliveryCharge,
    totalAmount: Number((amount + deliveryCharge).toFixed(2)),
    deliveryType: payload.orderData.deliveryType,
    city: payload.orderData.billingDetails.city,
    billingDetails: payload.orderData.billingDetails,
    orders,
  };
};

/** Removes checked-out items from cart if they were present there. */
const removeCheckedOutItemsFromCart = async (
  userId: string,
  items: TCreateOrderPayload['items']
) => {
  await Promise.all(
    items.map((item) =>
      Cart.updateOne(
        { userId },
        {
          $pull: {
            items: buildCartItemMatch({
              productId: item.product,
              size: item.size,
              color: item.color,
            }),
          },
        }
      )
    )
  );

  await clearCartCache(userId);
};

/** Creates one order per vendor from frontend checkout items. */
const createOrders = async (
  traceId: string,
  userId: string,
  payload: TCreateOrderPayload
) => {
  const checkoutItems = await resolveCheckoutItemsOrThrow(traceId, payload.items);
  const groupedItems = groupCartItemsByAuthor(checkoutItems);
  const deliveryCharge = await getDeliveryChargeFromSettingsOrThrow(
    traceId,
    payload.orderData.billingDetails.city,
    payload.orderData.deliveryType
  );
  const deliveryCharges = distributeDeliveryCharge(
    deliveryCharge,
    groupedItems.size
  );
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const orders = [];

    for (const [index, [authorId, items]] of [...groupedItems.entries()].entries()) {
      const amount = Number(
        items.reduce((total, item) => total + item.totalPrice, 0).toFixed(2)
      );
      const deliveryCharge = deliveryCharges[index] ?? 0;

      const [order] = await Orders.create(
        [
          {
            user: userId,
            author: authorId,
            amount,
            deliveryCharge,
            totalAmount: Number((amount + deliveryCharge).toFixed(2)),
            transactionId: payload.orderData.transactionId ?? null,
            billingDetails: payload.orderData.billingDetails,
            deliveryType: payload.orderData.deliveryType,
          },
        ],
        { session }
      );

      await createOrderItems(order._id, authorId, items, session);
      orders.push(order);
    }

    await session.commitTransaction();
    await removeCheckedOutItemsFromCart(userId, payload.items);
    await invalidateOrderCaches();

    return orders;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

/** Returns paginated orders for admins. */
const getAllOrders = async (query: Record<string, unknown>) => {
  const ordersQuery = new QueryBuilder(
    Orders.find({ isDeleted: false })
      .populate(orderPopulate)
      .select('-__v')
      .lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [orders, meta] = await Promise.all([
    ordersQuery.modelQuery,
    ordersQuery.countTotal(),
  ]);

  return { meta, orders };
};

/** Returns paginated orders created by the authenticated user. */
const getMyOrders = async (userId: string, query: Record<string, unknown>) => {
  const ordersQuery = new QueryBuilder(
    Orders.find({ user: userId, isDeleted: false })
      .populate(orderPopulate)
      .select('-__v')
      .lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [orders, meta] = await Promise.all([
    ordersQuery.modelQuery,
    ordersQuery.countTotal(),
  ]);

  return { meta, orders };
};

/** Returns paginated orders assigned to the authenticated vendor/author. */
const getAuthorOrders = async (
  authorId: string,
  query: Record<string, unknown>
) => {
  const ordersQuery = new QueryBuilder(
    Orders.find({ author: authorId, isDeleted: false })
      .populate(orderPopulate)
      .select('-__v')
      .lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [orders, meta] = await Promise.all([
    ordersQuery.modelQuery,
    ordersQuery.countTotal(),
  ]);

  return { meta, orders };
};

/** Returns one order with its item lines. */
const getOrdersById = async (
  traceId: string,
  orderId: string,
  requester: TOrderRequester
) => {
  const order = await Orders.findOne({ _id: orderId, isDeleted: false })
    .populate(orderPopulate)
    .select('-__v')
    .lean();
  if (!order) {
    throw new ApiError(HttpStatusCode.NotFound, 'Order not found', traceId);
  }

  assertOrderAccess(traceId, order, requester);
  const items = await Items.find({ order: orderId })
    .populate([{ path: 'product', select: 'title images price discountPrice' }])
    .select('-__v')
    .lean();

  return { ...order, items };
};

/** Updates order status/payment state. */
const changeOrderStatus = async (
  traceId: string,
  orderId: string,
  requester: TOrderRequester,
  payload: TChangeOrderStatusPayload
) => {
  const order = await Orders.findOne({ _id: orderId, isDeleted: false });
  if (!order) {
    throw new ApiError(HttpStatusCode.NotFound, 'Order not found', traceId);
  }

  assertOrderAccess(traceId, order, requester);

  const updatedOrder = await Orders.findByIdAndUpdate(orderId, payload, {
    returnDocument: 'after',
  })
    .populate(orderPopulate)
    .select('-__v');

  await invalidateOrderCaches();
  return updatedOrder;
};

/** Soft deletes an order. */
const deleteOrder = async (
  traceId: string,
  orderId: string,
  requester: TOrderRequester
) => {
  const order = await Orders.findOne({ _id: orderId, isDeleted: false });
  if (!order) {
    throw new ApiError(HttpStatusCode.NotFound, 'Order not found', traceId);
  }

  assertOrderAccess(traceId, order, requester, false);
  const deletedOrder = await Orders.findByIdAndUpdate(
    orderId,
    { isDeleted: true },
    { returnDocument: 'after' }
  ).select('-__v');

  await invalidateOrderCaches();
  return deletedOrder;
};

export const OrdersService = {
  getOrderSummary,
  createOrders,
  getAllOrders,
  getMyOrders,
  getAuthorOrders,
  getOrdersById,
  changeOrderStatus,
  deleteOrder,
};
