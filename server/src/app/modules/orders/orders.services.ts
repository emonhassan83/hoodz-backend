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
import { JobService } from '@/app/modules/job/job.services';
import {
  ORDER_STATUS,
  PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';
import {
  applyCheckoutVoucherOrThrow,
  assertOrderAccess,
  consumeCheckoutVoucher,
  createOrderItems,
  distributeDeliveryCharge,
  getDeliveryChargeFromSettingsOrThrow,
  groupCartItemsByAuthor,
  notifyOrderUser,
  resolveCheckoutItemsOrThrow,
} from '@/app/modules/orders/orders.helpers';
import { Orders } from '@/app/modules/orders/orders.model';
import {
  TChangeOrderStatusPayload,
  TCreateOrderPayload,
  TOrderRequester,
} from '@/app/modules/orders/orders.types';
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

const buildCheckoutQuote = async (
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
  const voucherQuote = await applyCheckoutVoucherOrThrow(
    traceId,
    userId,
    payload.orderData.voucherCode,
    groupedItems,
    amount
  );
  const remainingAfterVoucher = Math.max(
    0,
    Number((amount - voucherQuote.voucherDiscount).toFixed(2))
  );
  const redemption = await CoinService.getRedemptionPreview(
    traceId,
    userId,
    payload.orderData.redeemCoins ?? 0,
    amount,
    Math.min(getCoinEligibleSubtotal(checkoutItems), remainingAfterVoucher)
  );
  const coinDiscounts = distributeCoinDiscount(
    redemption.redeemCoins,
    groupedItems
  ).map((coinDiscount, index) => {
    const orderAmount = Number(
      groupedItems[index][1].reduce((total, item) => total + item.totalPrice, 0).toFixed(2)
    );
    const voucherDiscount = voucherQuote.perOrderDiscounts[index] ?? 0;
    return Math.min(
      coinDiscount,
      Math.max(0, Number((orderAmount - voucherDiscount).toFixed(2)))
    );
  });
  const coinDiscount = Number(
    coinDiscounts.reduce((total, value) => total + value, 0).toFixed(2)
  );

  const orders = groupedItems.map(([authorId, items], index) => {
    const amount = Number(
      items.reduce((total, item) => total + item.totalPrice, 0).toFixed(2)
    );
    const orderDeliveryCharge = deliveryCharges[index] ?? 0;
    const coinDiscount = coinDiscounts[index] ?? 0;
    const voucherDiscount = voucherQuote.perOrderDiscounts[index] ?? 0;

    return {
      author: authorId,
      amount,
      voucherDiscount,
      giftDetails: voucherQuote.perOrderGifts[index],
      coinDiscount,
      deliveryCharge: orderDeliveryCharge,
      totalAmount: Number(
        (
          amount - voucherDiscount - coinDiscount + orderDeliveryCharge
        ).toFixed(2)
      ),
      items,
    };
  });

  return {
    groupedItems,
    deliveryCharge,
    deliveryCharges,
    amount,
    voucherQuote,
    redemption: {
      redeemCoins: coinDiscount,
      coinDiscount,
    },
    coinDiscounts,
    orders,
  };
};

/** Returns checkout preview without creating orders or items. */
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
    billingDetails: payload.orderData.billingDetails,
    orders: checkout.orders,
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
/** Returns paginated orders for the authenticated buyer, excluding unpaid/failed checkouts. */
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

/** Confirms an order and starts nearby rider job matching. */
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
  await order.save();

  const job = await JobService.startJobMatching(traceId, orderId);
  await notifyOrderUser(order, 'confirmed');
  await invalidateOrderCaches();

  const confirmedOrder = await Orders.findById(orderId)
    .populate(orderPopulate)
    .select('-__v')
    .lean();

  return { order: confirmedOrder, job };
};

/** Moves a confirmed order into processing. Vendor/author access only. */
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
  await order.save();
  await notifyOrderUser(order, 'processing');
  await invalidateOrderCaches();

  return Orders.findById(orderId).populate(orderPopulate).select('-__v').lean();
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
  confirmOrder,
  processOrder,
  deleteOrder,
};


