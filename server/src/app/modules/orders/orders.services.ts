import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { COIN_REFERENCE_TYPE } from '@/app/modules/coin/coin.constant';
import { CoinService } from '@/app/modules/coin/coin.services';
import { hasOrderSupportChat } from '@/app/modules/chat/chat.helpers';
import { Items } from '@/app/modules/items/items.model';
import { JobService } from '@/app/modules/job/job.services';
import { stopJobMatchingForOrder } from '@/app/modules/job/job.helpers';
import {
  ORDER_STATUS,
  PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';
import {
  assertOrderAccess,
  buildCheckoutQuote,
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
} from '@/app/modules/orders/orders.helpers';
import { Orders } from '@/app/modules/orders/orders.model';
import {
  TChangeOrderStatusPayload,
  TCreateOrderPayload,
  TOrderRequester,
} from '@/app/modules/orders/orders.types';

const getOrderSummary = async (
  traceId: string,
  userId: string,
  payload: TCreateOrderPayload
) => {
  const checkout = await buildCheckoutQuote(traceId, userId, payload);

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
      await CoinService.redeemCoins(
        traceId,
        userId,
        coinDiscount,
        COIN_REFERENCE_TYPE.order,
        order._id,
        session
      );
      orders.push(order);
    }

    await consumeCheckoutVoucher(checkout.voucherQuote, session);
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

    return orders;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

const getAllOrders = async (query: Record<string, unknown>) => {
  const ordersQuery = new QueryBuilder(
    Orders.find({ isDeleted: false }).select(orderListCardSelect).lean(),
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

  return { meta, orders: await mapOrdersToListCards(orders) };
};

const getMyOrders = async (userId: string, query: Record<string, unknown>) => {
  const ordersQuery = new QueryBuilder(
    Orders.find({
      user: userId,
      isDeleted: false,
      $nor: [
        { paymentStatus: PAYMENT_STATUS.unpaid, status: ORDER_STATUS.pending },
        { paymentStatus: PAYMENT_STATUS.failed },
      ],
    })
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

  return { meta, orders: await mapOrdersToListCards(orders) };
};

const getAuthorOrders = async (
  authorId: string,
  query: Record<string, unknown>
) => {
  const ordersQuery = new QueryBuilder(
    Orders.find({ author: authorId, isDeleted: false })
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
  const order = await Orders.findOne({ _id: orderId, isDeleted: false })
    .populate(orderPopulate)
    .select('-__v')
    .lean();
  if (!order) {
    throw new ApiError(HttpStatusCode.NotFound, 'Order not found', traceId);
  }

  assertOrderAccess(traceId, order, requester);
  const [items, hasOrderSupports] = await Promise.all([
    Items.find({ order: orderId })
      .populate([{ path: 'product', select: 'title images price discountPrice' }])
      .select('-__v')
      .lean(),
    hasOrderSupportChat(orderId),
  ]);

  return { ...order, items, hasOrderSupports };
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

  if (payload.status === ORDER_STATUS.cancelled) {
    await stopJobMatchingForOrder(orderId);
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
      'Only pending orders can be confirmed',
      traceId
    );
  }

  order.status = ORDER_STATUS.confirmed;
  order.confirmedAt = new Date();
  await order.save();

  await notifyOrderUser(order, 'confirmed');
  await invalidateOrderCaches();

  const confirmedOrder = await Orders.findById(orderId)
    .populate(orderPopulate)
    .select('-__v')
    .lean();

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

  if (order.status !== ORDER_STATUS.confirmed) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Only confirmed orders can be moved to processing',
      traceId
    );
  }

  order.status = ORDER_STATUS.processing;
  order.processedAt = new Date();
  await order.save();

  const job = await JobService.startJobMatching(traceId, orderId);
  await notifyOrderUser(order, 'processing');
  await invalidateOrderCaches();

  const processedOrder = await Orders.findById(orderId)
    .populate(orderPopulate)
    .select('-__v')
    .lean();

  return { order: processedOrder, job };
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
  deleteOrder,
};
