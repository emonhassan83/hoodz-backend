import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { buildCartItemMatch } from '@/app/modules/cart/cart.helpers';
import { TEnrichedCartItem } from '@/app/modules/cart/cart.types';
import { Cart } from '@/app/modules/cart/cart.model';
import { COIN_REFERENCE_TYPE } from '@/app/modules/coin/coin.constant';
import { CoinService } from '@/app/modules/coin/coin.services';
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
import { PAYMENT_STATUS } from '@/app/modules/orders/orders.constant';
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

const getBasketSubtotal = (items: TEnrichedCartItem[]) =>
  Number(items.reduce((total, item) => total + item.totalPrice, 0).toFixed(2));

const getCoinEligibleSubtotal = (items: TEnrichedCartItem[]) =>
  Number(
    items
      .filter((item) => !item.product.isDiscounted)
      .reduce((total, item) => total + item.totalPrice, 0)
      .toFixed(2)
  );

const distributeCoinDiscount = (
  totalCoins: number,
  groupedItems: [string, TEnrichedCartItem[]][]
) => {
  if (totalCoins <= 0) return groupedItems.map(() => 0);

  const eligibleSubtotals = groupedItems.map(([, items]) =>
    getCoinEligibleSubtotal(items)
  );
  const totalEligibleSubtotal = eligibleSubtotals.reduce(
    (total, subtotal) => total + subtotal,
    0
  );

  if (totalEligibleSubtotal <= 0) return groupedItems.map(() => 0);

  const allocations = eligibleSubtotals.map((subtotal, index) => {
    const rawCoins = (subtotal / totalEligibleSubtotal) * totalCoins;
    return {
      index,
      coins: Math.floor(rawCoins),
      fraction: rawCoins - Math.floor(rawCoins),
    };
  });
  let remainingCoins =
    totalCoins - allocations.reduce((total, item) => total + item.coins, 0);

  allocations
    .sort((a, b) => b.fraction - a.fraction)
    .forEach((allocation) => {
      if (remainingCoins <= 0) return;
      allocation.coins += 1;
      remainingCoins -= 1;
    });

  return allocations
    .sort((a, b) => a.index - b.index)
    .map((allocation) => allocation.coins);
};

/** Returns checkout preview without creating orders or items. */
const getOrderSummary = async (
  traceId: string,
  userId: string,
  payload: TCreateOrderPayload
) => {
  const checkoutItems = await resolveCheckoutItemsOrThrow(traceId, payload.items);
  const groupedItems = [...groupCartItemsByAuthor(checkoutItems).entries()];
  const deliveryCharge = await getDeliveryChargeFromSettingsOrThrow(
    traceId,
    payload.orderData.billingDetails.city,
    payload.orderData.deliveryType
  );
  const deliveryCharges = distributeDeliveryCharge(
    deliveryCharge,
    groupedItems.length
  );
  const amount = getBasketSubtotal(checkoutItems);
  const redemption = await CoinService.getRedemptionPreview(
    traceId,
    userId,
    payload.orderData.redeemCoins ?? 0,
    amount,
    getCoinEligibleSubtotal(checkoutItems)
  );
  const coinDiscounts = distributeCoinDiscount(redemption.redeemCoins, groupedItems);

  const orders = groupedItems.map(([authorId, items], index) => {
    const amount = Number(
      items.reduce((total, item) => total + item.totalPrice, 0).toFixed(2)
    );
    const orderDeliveryCharge = deliveryCharges[index] ?? 0;
    const coinDiscount = coinDiscounts[index] ?? 0;

    return {
      author: authorId,
      amount,
      coinDiscount,
      deliveryCharge: orderDeliveryCharge,
      totalAmount: Number((amount - coinDiscount + orderDeliveryCharge).toFixed(2)),
      items,
    };
  });

  return {
    amount,
    redeemCoins: redemption.redeemCoins,
    coinDiscount: redemption.coinDiscount,
    deliveryCharge,
    totalAmount: Number((amount - redemption.coinDiscount + deliveryCharge).toFixed(2)),
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
  const groupedItems = [...groupCartItemsByAuthor(checkoutItems).entries()];
  const deliveryCharge = await getDeliveryChargeFromSettingsOrThrow(
    traceId,
    payload.orderData.billingDetails.city,
    payload.orderData.deliveryType
  );
  const deliveryCharges = distributeDeliveryCharge(
    deliveryCharge,
    groupedItems.length
  );
  const amount = getBasketSubtotal(checkoutItems);
  const redemption = await CoinService.getRedemptionPreview(
    traceId,
    userId,
    payload.orderData.redeemCoins ?? 0,
    amount,
    getCoinEligibleSubtotal(checkoutItems)
  );
  const coinDiscounts = distributeCoinDiscount(redemption.redeemCoins, groupedItems);
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const orders = [];

    for (const [index, [authorId, items]] of groupedItems.entries()) {
      const amount = Number(
        items.reduce((total, item) => total + item.totalPrice, 0).toFixed(2)
      );
      const deliveryCharge = deliveryCharges[index] ?? 0;
      const coinDiscount = coinDiscounts[index] ?? 0;

      const [order] = await Orders.create(
        [
          {
            user: userId,
            author: authorId,
            amount,
            coinDiscount,
            deliveryCharge,
            totalAmount: Number((amount - coinDiscount + deliveryCharge).toFixed(2)),
            transactionId: payload.orderData.transactionId ?? null,
            billingDetails: payload.orderData.billingDetails,
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

    await session.commitTransaction();
    if (redemption.redeemCoins > 0) {
      await CoinService.sendRedemptionNotification(
        userId,
        redemption.redeemCoins,
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

  const shouldAwardPurchaseCoins =
    payload.paymentStatus === PAYMENT_STATUS.paid &&
    order.paymentStatus !== PAYMENT_STATUS.paid;

  const updatedOrder = await Orders.findByIdAndUpdate(orderId, payload, {
    returnDocument: 'after',
  })
    .populate(orderPopulate)
    .select('-__v');

  if (shouldAwardPurchaseCoins) {
    await CoinService.processPaidOrderRewards([order._id]);
  }

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


