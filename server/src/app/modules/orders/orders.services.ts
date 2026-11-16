import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { COIN_REFERENCE_TYPE } from '@/app/modules/coin/coin.constant';
import { CoinService } from '@/app/modules/coin/coin.services';
import { Items } from '@/app/modules/items/items.model';
import { JobService } from '@/app/modules/job/job.services';
import {
  cancelOpenJobsForOrder,
  stopJobMatchingForOrder,
} from '@/app/modules/job/job.helpers';
import {
  ORDER_STATUS,
  ORDER_VENDOR_ACCEPTED_STATUSES,
  PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';
import {
  assertOrderAccess,
  assertOrderStatusTransition,
  applyHasRiderAssignedFilter,
  applyAdminOrderListFilters,
  applyMyOrdersListFilter,
  attachHasGrievance,
  buildCheckoutQuote,
  buildOrderDetailById,
  buildVisibleOrdersFilter,
  consumeCheckoutVoucher,
  createOrderItems,
  getOrderStatusTimestampUpdate,
  invalidateOrderCaches,
  mapOrdersToListCards,
  normalizeBillingDeliveryLocation,
  notifyOrderUser,
  orderListCardSelect,
  orderPopulate,
  removeCheckedOutItemsFromCart,
  stripAdminOrderListQueryParams,
  stripOrderListQueryParams,
} from '@/app/modules/orders/orders.helpers';
import { Orders } from '@/app/modules/orders/orders.model';
import { User } from '@/app/modules/user/user.model';
import {
  TChangeOrderStatusPayload,
  TCreateOrderPayload,
  TOrderRequester,
} from '@/app/modules/orders/orders.types';
import {
  emitOrderUpdated,
  resolveOrderSocketNotice,
} from '@/app/modules/orders/orders.socket';

const getOrderSummary = async (
  traceId: string,
  userId: string,
  payload: TCreateOrderPayload
) => {
  const [checkout, user, coinSummary] = await Promise.all([
    buildCheckoutQuote(traceId, userId, payload),
    User.findById(userId).select('walletBalance').lean(),
    CoinService.getSummary(userId),
  ]);

  return {
    amount: checkout.amount,
    voucherCode: checkout.voucherQuote.code,
    voucherDiscount: checkout.voucherQuote.voucherDiscount,
    giftDetails: checkout.voucherQuote.giftDetails,
    redeemCoins: checkout.redemption.redeemCoins,
    coinDiscount: checkout.redemption.coinDiscount,
    deliveryCharge: checkout.deliveryCharge,
    totalAmount: Number(
      (
        checkout.amount -
        checkout.voucherQuote.voucherDiscount -
        checkout.redemption.coinDiscount +
        checkout.deliveryCharge
      ).toFixed(2)
    ),
    walletBalance: Number((user?.walletBalance ?? 0).toFixed(2)),
    pointBalance: coinSummary.balance,
    deliveryType: payload.orderData.deliveryType,
    city: payload.orderData.billingDetails.city,
    billingDetails: normalizeBillingDeliveryLocation(
      payload.orderData.billingDetails
    ),
    orders: checkout.orders,
  };
};

const createOrders = async (
  traceId: string,
  userId: string,
  payload: TCreateOrderPayload
) => {
  const checkout = await buildCheckoutQuote(traceId, userId, payload);
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const orders = [];

    for (const [index, [authorId, items]] of checkout.groupedItems.entries()) {
      const amount = Number(
        items.reduce((total, item) => total + item.totalPrice, 0).toFixed(2)
      );
      const deliveryCharge = checkout.deliveryCharges[index] ?? 0;
      const coinDiscount = checkout.coinDiscounts[index] ?? 0;
      const redeemedCoins = checkout.redeemedCoinsPerOrder[index] ?? 0;
      const voucherDiscount = checkout.voucherQuote.perOrderDiscounts[index] ?? 0;
      const giftDetails = checkout.voucherQuote.perOrderGifts[index];
      const hasVoucherBenefit = voucherDiscount > 0 || Boolean(giftDetails);

      const [order] = await Orders.create(
        [
          {
            user: userId,
            author: authorId,
            amount,
            coinDiscount,
            voucher: hasVoucherBenefit ? checkout.voucherQuote.voucherId : null,
            voucherCode: hasVoucherBenefit ? checkout.voucherQuote.code : null,
            voucherDiscount,
            giftDetails: giftDetails ?? null,
            deliveryCharge,
            totalAmount: Number(
              (amount - voucherDiscount - coinDiscount + deliveryCharge).toFixed(2)
            ),
            transactionId: payload.orderData.transactionId ?? null,
            billingDetails: normalizeBillingDeliveryLocation(
              payload.orderData.billingDetails
            ),
            deliveryType: payload.orderData.deliveryType,
          },
        ],
        { session }
      );

      await createOrderItems(order._id, authorId, items, session);
      if (redeemedCoins > 0) {
        await CoinService.redeemCoins(
          traceId,
          userId,
          redeemedCoins,
          COIN_REFERENCE_TYPE.order,
          order._id,
          session
        );
      }
      orders.push(order);
    }

    await consumeCheckoutVoucher(checkout.voucherQuote, userId, session);
    await session.commitTransaction();
    if (checkout.redemption.redeemCoins > 0) {
      await CoinService.sendRedemptionNotification(
        userId,
        checkout.redemption.redeemCoins,
        orders[0]?._id
      );
    }
    await removeCheckedOutItemsFromCart(userId, payload.items);
    await invalidateOrderCaches();

    await Promise.all(
      orders.map((order) => emitOrderUpdated(order._id, 'created'))
    );

    return orders.map((order, index) => ({
      ...order.toObject(),
      shopLocation: checkout.orders[index]?.shopLocation ?? null,
    }));
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

const getAllOrders = async (query: Record<string, unknown>) => {
  const filter = await applyHasRiderAssignedFilter(
    applyAdminOrderListFilters(await buildVisibleOrdersFilter(), query),
    query
  );
  const ordersQuery = new QueryBuilder(
    Orders.find(filter).select(orderListCardSelect).lean(),
    stripAdminOrderListQueryParams(query)
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [orders, meta] = await Promise.all([
    ordersQuery.modelQuery,
    ordersQuery.countTotal(),
  ]);

  return { meta, orders: await mapOrdersToListCards(orders, undefined, { includeHasRiderAssigned: true }) };
};

const getMyOrders = async (userId: string, query: Record<string, unknown>) => {
  const filter = applyMyOrdersListFilter(
    await buildVisibleOrdersFilter({ user: userId }),
    query
  );
  const ordersQuery = new QueryBuilder(
    Orders.find(filter)
      .select(orderListCardSelect)
      .lean(),
    stripOrderListQueryParams(query)
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [orders, meta] = await Promise.all([
    ordersQuery.modelQuery,
    ordersQuery.countTotal(),
  ]);

  return {
    meta,
    orders: await attachHasGrievance(
      userId,
      await mapOrdersToListCards(orders)
    ),
  };
};

const getAuthorOrders = async (
  authorId: string,
  query: Record<string, unknown>
) => {
  const filter = await buildVisibleOrdersFilter({ author: authorId });
  const ordersQuery = new QueryBuilder(
    Orders.find(filter)
      .select(orderListCardSelect)
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

  return { meta, orders: await mapOrdersToListCards(orders, authorId) };
};

const getOrdersById = async (
  traceId: string,
  orderId: string,
  requester: TOrderRequester
) => {
  const order = await buildOrderDetailById(orderId);
  if (!order) {
    throw new ApiError(HttpStatusCode.NotFound, 'Order not found', traceId);
  }

  assertOrderAccess(traceId, order, requester);

  return order;
};

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

  const previousStatus = order.status;
  // This service backs the staff-only REST status route (admin/agent).
  // Rider steps are set by the assigned rider over the job socket flow only.
  const RIDER_ONLY_STATUSES: string[] = [
    ORDER_STATUS.collected,
    ORDER_STATUS.picked_up,
    ORDER_STATUS.on_the_way,
    ORDER_STATUS.delivered,
  ];
  if (payload.status && RIDER_ONLY_STATUSES.includes(payload.status)) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'Rider steps can only be set by the assigned rider',
      traceId
    );
  }
  if (payload.status) {
    assertOrderStatusTransition(traceId, previousStatus, payload.status);
  }
  const shouldAwardPurchaseCoins =
    payload.paymentStatus === PAYMENT_STATUS.paid &&
    order.paymentStatus !== PAYMENT_STATUS.paid;

  const updatedOrder = await Orders.findByIdAndUpdate(
    orderId,
    {
      ...payload,
      ...getOrderStatusTimestampUpdate(payload.status),
    },
    {
    returnDocument: 'after',
    }
  )
    .populate(orderPopulate)
    .select('-__v');

  if (shouldAwardPurchaseCoins) {
    await CoinService.processPaidOrderRewards([order._id]);
  }

  await invalidateOrderCaches();

  if (
    payload.status === ORDER_STATUS.cancelled ||
    payload.status === ORDER_STATUS.rejected
  ) {
    await stopJobMatchingForOrder(orderId);
    await cancelOpenJobsForOrder(orderId);
  }

  if (
    payload.status &&
    payload.status !== previousStatus &&
    (payload.status === ORDER_STATUS.preparing ||
      payload.status === ORDER_STATUS.processing)
  ) {
    await JobService.startJobMatching(traceId, orderId);
  }

  if (payload.status && payload.status !== previousStatus) {
    await emitOrderUpdated(orderId, resolveOrderSocketNotice(payload.status), {
      previousStatus,
    });
  } else if (
    payload.paymentStatus === PAYMENT_STATUS.paid &&
    order.paymentStatus !== PAYMENT_STATUS.paid
  ) {
    await emitOrderUpdated(orderId, 'paid', { previousStatus });
  }

  return updatedOrder;
};

const confirmOrder = async (
  traceId: string,
  orderId: string,
  requester: TOrderRequester
) => {
  const order = await Orders.findOne({ _id: orderId, isDeleted: false });
  if (!order) {
    throw new ApiError(HttpStatusCode.NotFound, 'Order not found', traceId);
  }

  assertOrderAccess(traceId, order, requester);

  if (order.status === ORDER_STATUS.cancelled) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Cancelled orders cannot be confirmed',
      traceId
    );
  }

  if (order.status !== ORDER_STATUS.pending) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Only pending orders can be accepted',
      traceId
    );
  }

  order.status = ORDER_STATUS.accepted;
  order.confirmedAt = new Date();
  await order.save();

  await notifyOrderUser(order, 'accepted');
  await invalidateOrderCaches();

  const confirmedOrder = await Orders.findById(orderId)
    .populate(orderPopulate)
    .select('-__v')
    .lean();

  await emitOrderUpdated(orderId, 'accepted', {
    previousStatus: ORDER_STATUS.pending,
  });

  return confirmedOrder;
};

const processOrder = async (
  traceId: string,
  orderId: string,
  requester: TOrderRequester
) => {
  const order = await Orders.findOne({ _id: orderId, isDeleted: false });
  if (!order) {
    throw new ApiError(HttpStatusCode.NotFound, 'Order not found', traceId);
  }

  assertOrderAccess(traceId, order, requester);

  if (
    !(ORDER_VENDOR_ACCEPTED_STATUSES as readonly string[]).includes(order.status)
  ) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Only accepted orders can be moved to preparing',
      traceId
    );
  }

  const previousStatus = order.status;
  order.status = ORDER_STATUS.preparing;
  order.processedAt = new Date();
  await order.save();

  const job = await JobService.startJobMatching(traceId, orderId);
  await notifyOrderUser(order, 'preparing');
  await invalidateOrderCaches();

  const processedOrder = await Orders.findById(orderId)
    .populate(orderPopulate)
    .select('-__v')
    .lean();

  await emitOrderUpdated(orderId, 'preparing', {
    previousStatus,
  });

  return { order: processedOrder, job };
};

/** Vendor marks the order ready for the rider to leave the brand. */
const markOutForDelivery = async (
  traceId: string,
  orderId: string,
  requester: TOrderRequester
) => {
  const order = await Orders.findOne({ _id: orderId, isDeleted: false });
  if (!order) {
    throw new ApiError(HttpStatusCode.NotFound, 'Order not found', traceId);
  }

  assertOrderAccess(traceId, order, requester);
  assertOrderStatusTransition(traceId, order.status, ORDER_STATUS.out_for_delivery);

  const previousStatus = order.status;
  order.status = ORDER_STATUS.out_for_delivery;
  order.outForDeliveryAt = new Date();
  await order.save();
  await notifyOrderUser(order, 'out_for_delivery');
  await invalidateOrderCaches();
  await emitOrderUpdated(orderId, 'out_for_delivery', { previousStatus });

  return Orders.findById(orderId).populate(orderPopulate).select('-__v').lean();
};

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

  await stopJobMatchingForOrder(orderId);
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
  confirmOrder,
  processOrder,
  markOutForDelivery,
  deleteOrder,
};
