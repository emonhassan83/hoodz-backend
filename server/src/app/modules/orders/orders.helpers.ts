import { HttpStatusCode } from 'axios';
import { ClientSession, Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { buildCartItemMatch } from '@/app/modules/cart/cart.helpers';
import { TEnrichedCartItem } from '@/app/modules/cart/cart.types';
import { Cart } from '@/app/modules/cart/cart.model';
import { CoinService } from '@/app/modules/coin/coin.services';
import { Grievance } from '@/app/modules/grievance/grievance.model';
import { Items } from '@/app/modules/items/items.model';
import { Job } from '@/app/modules/job/job.model';
import { Kyc } from '@/app/modules/kyc/kyc.model';
import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';
import { DELIVERY_TYPE, ORDER_ACTIVE_STATUSES, ORDER_LIST_FILTER, ORDER_STATUS, PAYMENT_STATUS } from '@/app/modules/orders/orders.constant';
import { IOrders } from '@/app/modules/orders/orders.interface';
import { Orders } from '@/app/modules/orders/orders.model';
import { PAYMENT_METHOD } from '@/app/modules/payment/payment.constant';
import { Payment } from '@/app/modules/payment/payment.model';
import { User } from '@/app/modules/user/user.model';
import { sendNotificationViaQueue } from '@/app/utils/notification-queue.service';
import { getEmailQueueInstance } from '@/app/utils/queueHelper';
import {
  TCheckoutVoucherQuote,
  TCreateOrderPayload,
} from '@/app/modules/orders/orders.types';
import { deleteCachePattern } from '@/app/redis/helpers';
import { clearCartCache } from '@/app/redis/helpers/cart';
import { PRODUCT_INVENTORY_TYPE } from '@/app/modules/product/product.constant';
import { Product } from '@/app/modules/product/product.model';
import { Setting } from '@/app/modules/settings/settings.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import {
  VOUCHER_STATUS,
  VOUCHER_TYPE,
} from '@/app/modules/voucher/voucher.constant';
import {
  assertVoucherNotUsedByUser,
  calculateVoucherDiscountAmount,
  createVoucherLog,
  formatCheckoutGiftDetails,
  getActiveVoucherByCodeOrThrow,
} from '@/app/modules/voucher/voucher.helpers';
import { Voucher } from '@/app/modules/voucher/voucher.model';

const ORDER_STATUS_AT_FIELD = {
  [ORDER_STATUS.cancelled]: 'cancelledAt',
  [ORDER_STATUS.confirmed]: 'confirmedAt',
  [ORDER_STATUS.processing]: 'processedAt',
  [ORDER_STATUS.rider_assigned]: 'riderAssignedAt',
  [ORDER_STATUS.picked_up]: 'pickedUpAt',
  [ORDER_STATUS.on_the_way]: 'onTheWayAt',
  [ORDER_STATUS.delivered]: 'deliveredAt',
} as const;

export const getOrderStatusTimestampUpdate = (status?: string) => {
  if (!status) return {};
  const field =
    ORDER_STATUS_AT_FIELD[status as keyof typeof ORDER_STATUS_AT_FIELD];
  if (!field) return {};
  return { [field]: new Date() };
};

const ORDER_STEPPER_BY_STATUS: Record<string, number> = {
  [ORDER_STATUS.pending]: 1,
  [ORDER_STATUS.confirmed]: 2,
  [ORDER_STATUS.processing]: 3,
  [ORDER_STATUS.rider_assigned]: 4,
  [ORDER_STATUS.picked_up]: 5,
  [ORDER_STATUS.on_the_way]: 6,
  [ORDER_STATUS.delivered]: 7,
};

/** Maps order status to UI stepper step (1-7). Cancelled has no step. */
export const getOrderSteper = (status?: string | null) =>
  status ? (ORDER_STEPPER_BY_STATUS[status] ?? null) : null;

/** Normalizes checkout lat/lng into GeoJSON [longitude, latitude]. */
export const normalizeBillingDeliveryLocation = (
  billingDetails: TCreateOrderPayload['orderData']['billingDetails']
) => {
  const location =
    billingDetails.deliveryLocation ?? (billingDetails as { location?: { latitude?: number; longitude?: number } }).location;
  const latitude = location?.latitude;
  const longitude = location?.longitude;
  if (latitude === undefined || longitude === undefined) {
    return billingDetails;
  }

  return {
    ...billingDetails,
    deliveryLocation: {
      type: 'Point' as const,
      coordinates: [longitude, latitude] as [number, number],
      latitude,
      longitude,
    },
  };
};

type TDeliveryChargeSetting = {
  state: string;
  regularDeliveryCharge: number;
  instantDeliveryCharge: number;
};

/** Groups cart items by product vendor/author for multi-vendor checkout. */
export const groupCartItemsByAuthor = (items: TEnrichedCartItem[]) =>
  items.reduce<Map<string, TEnrichedCartItem[]>>((groupedItems, item) => {
    const authorId = item.product.vendor.toString();
    const existingItems = groupedItems.get(authorId) ?? [];
    groupedItems.set(authorId, [...existingItems, item]);
    return groupedItems;
  }, new Map<string, TEnrichedCartItem[]>());

/** Splits a checkout-level delivery charge across vendor orders without losing cents. */
export const distributeDeliveryCharge = (
  deliveryCharge: number,
  orderCount: number
) => {
  if (orderCount <= 0) return [];

  const totalCents = Math.round(deliveryCharge * 100);
  const baseCents = Math.floor(totalCents / orderCount);
  const remainder = totalCents % orderCount;

  return Array.from({ length: orderCount }, (_, index) =>
    Number(((baseCents + (index < remainder ? 1 : 0)) / 100).toFixed(2))
  );
};

const getAuthorSubtotal = (items: TEnrichedCartItem[]) =>
  Number(items.reduce((total, item) => total + item.totalPrice, 0).toFixed(2));

const emptyVoucherQuote = (orderCount: number): TCheckoutVoucherQuote => ({
  voucherId: null,
  code: null,
  voucherType: null,
  discountType: null,
  voucherDiscount: 0,
  giftDetails: null,
  perOrderDiscounts: Array.from({ length: orderCount }, () => 0),
  perOrderGifts: Array.from({ length: orderCount }, () => null),
  consumeOnCreate: false,
});

/** Splits a checkout-level money amount by vendor subtotals without losing cents. */
const distributeAmountBySubtotals = (total: number, subtotals: number[]) => {
  const totalWeight = subtotals.reduce((sum, value) => sum + value, 0);
  if (total <= 0 || totalWeight <= 0) return subtotals.map(() => 0);

  const totalCents = Math.round(total * 100);
  const allocations = subtotals.map((subtotal, index) => {
    const rawCents = (subtotal / totalWeight) * totalCents;
    return {
      index,
      cents: Math.floor(rawCents),
      fraction: rawCents - Math.floor(rawCents),
    };
  });
  let remainingCents =
    totalCents - allocations.reduce((sum, item) => sum + item.cents, 0);

  allocations
    .sort((left, right) => right.fraction - left.fraction)
    .forEach((allocation) => {
      if (remainingCents <= 0) return;
      allocation.cents += 1;
      remainingCents -= 1;
    });

  return allocations
    .sort((left, right) => left.index - right.index)
    .map((allocation) => Number((allocation.cents / 100).toFixed(2)));
};

/** Resolves a checkout voucher code into per-order discount or gift. */
export const applyCheckoutVoucherOrThrow = async (
  traceId: string,
  userId: string,
  voucherCode: string | null | undefined,
  groupedItems: [string, TEnrichedCartItem[]][],
  basketSubtotal: number
): Promise<TCheckoutVoucherQuote> => {
  if (!voucherCode?.trim()) return emptyVoucherQuote(groupedItems.length);

  const voucher = await getActiveVoucherByCodeOrThrow(traceId, voucherCode);
  await assertVoucherNotUsedByUser(traceId, userId, voucher._id);

  if (
    voucher.voucherType === VOUCHER_TYPE.compensation &&
    voucher.user?.toString() !== userId
  ) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'This compensation voucher is not assigned to you',
      traceId
    );
  }

  const authorSubtotals = groupedItems.map(([, items]) => getAuthorSubtotal(items));
  const quote = emptyVoucherQuote(groupedItems.length);
  const giftDetails = formatCheckoutGiftDetails(voucher);

  quote.voucherId = voucher._id;
  quote.code = voucher.code;
  quote.voucherType = voucher.voucherType;
  quote.discountType = voucher.discountType;
  quote.giftDetails = giftDetails;
  quote.consumeOnCreate = voucher.voucherType === VOUCHER_TYPE.compensation;

  if (voucher.voucherType === VOUCHER_TYPE.shop) {
    const shopId = voucher.shop?.toString();
    const shopIndex = groupedItems.findIndex(([authorId]) => authorId === shopId);
    if (shopIndex < 0) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'This shop voucher is not valid for the current items',
        traceId
      );
    }

    const shopSubtotal = authorSubtotals[shopIndex] ?? 0;
    if (shopSubtotal < (voucher.minSpend ?? 0)) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        `Minimum spend for this voucher is ${voucher.minSpend}`,
        traceId
      );
    }

    quote.voucherDiscount = calculateVoucherDiscountAmount(voucher, shopSubtotal);
    quote.perOrderDiscounts[shopIndex] = quote.voucherDiscount;
    quote.perOrderGifts[shopIndex] = giftDetails;
    return quote;
  }

  if (basketSubtotal < (voucher.minSpend ?? 0)) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      `Minimum spend for this voucher is ${voucher.minSpend}`,
      traceId
    );
  }

  quote.voucherDiscount = calculateVoucherDiscountAmount(voucher, basketSubtotal);
  quote.perOrderDiscounts = distributeAmountBySubtotals(
    quote.voucherDiscount,
    authorSubtotals
  );

  if (giftDetails) {
    const largestIndex = authorSubtotals.reduce(
      (maxIndex, subtotal, index) =>
        subtotal > (authorSubtotals[maxIndex] ?? 0) ? index : maxIndex,
      0
    );
    quote.perOrderGifts[largestIndex] = giftDetails;
  }

  return quote;
};

/** Marks a one-time compensation voucher as used and logs the user usage. */
export const consumeCheckoutVoucher = async (
  quote: TCheckoutVoucherQuote,
  userId: string,
  session: ClientSession
) => {
  if (!quote.voucherId) return;

  if (quote.consumeOnCreate) {
    await Voucher.updateOne(
      { _id: quote.voucherId },
      { status: VOUCHER_STATUS.deactivated },
      { session }
    );
  }

  await createVoucherLog(userId, quote.voucherId, session);
};

/** Returns delivery charge from admin settings by city/state and delivery type. */
export const getDeliveryChargeFromSettingsOrThrow = async (
  traceId: string,
  city: string | null | undefined,
  deliveryType: TCreateOrderPayload['orderData']['deliveryType']
) => {
  if (!city) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Billing city is required', traceId);
  }

  const setting = await Setting.findOne({
    key: 'deliveryCharge',
    vendor: null,
  }).lean();

  const deliveryCharges = Array.isArray(setting?.value)
    ? (setting.value as TDeliveryChargeSetting[])
    : [];
  const matchedState = deliveryCharges.find(
    (item) => item.state.toLowerCase() === city.toLowerCase()
  );

  if (!matchedState) {
    throw new ApiError(
      HttpStatusCode.NotFound,
      'Delivery charge is not available for this city',
      traceId
    );
  }

  return deliveryType === DELIVERY_TYPE.instant
    ? matchedState.instantDeliveryCharge
    : matchedState.regularDeliveryCharge;
};

/** Resolves frontend checkout items into backend-priced, vendor-aware order items. */
export const resolveCheckoutItemsOrThrow = async (
  traceId: string,
  items: TCreateOrderPayload['items']
): Promise<TEnrichedCartItem[]> => {
  const products = await Product.find({
    _id: { $in: items.map((item) => item.product) },
    isDeleted: false,
  }).select('vendor title banner price discount discountPrice stock inventoryType variants');

  const productById = new Map(
    products.map((product) => [product._id.toString(), product])
  );

  return items.map((item) => {
    const product = productById.get(item.product);
    if (!product) {
      throw new ApiError(HttpStatusCode.NotFound, 'Product not found', traceId);
    }

    if (product.inventoryType === PRODUCT_INVENTORY_TYPE.colorOnly && !item.color?.code) {
      throw new ApiError(HttpStatusCode.BadRequest, 'Color is required', traceId);
    }

    if (
      product.inventoryType === PRODUCT_INVENTORY_TYPE.sizeColor &&
      (!item.size || !item.color?.code)
    ) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'Size and color are required',
        traceId
      );
    }

    const optionStock =
      product.inventoryType === PRODUCT_INVENTORY_TYPE.single
        ? product.stock
        : product.variants.find((variant) => {
            if (product.inventoryType === PRODUCT_INVENTORY_TYPE.colorOnly) {
              return variant.color?.code === item.color?.code;
            }

            return (
              variant.size === item.size &&
              variant.color?.code === item.color?.code
            );
          })?.quantity;

    if (optionStock === undefined) {
      throw new ApiError(HttpStatusCode.NotFound, 'Product option not found', traceId);
    }

    if (optionStock < item.quantity) {
      throw new ApiError(HttpStatusCode.BadRequest, 'Product stock is not enough', traceId);
    }

    const unitPrice = product.discountPrice || product.price;
    const isDiscounted =
      product.discount > 0 ||
      (product.discountPrice > 0 && product.discountPrice < product.price);
    return {
      productId: product._id,
      size:
        product.inventoryType === PRODUCT_INVENTORY_TYPE.single
          ? null
          : item.size || null,
      color:
        product.inventoryType === PRODUCT_INVENTORY_TYPE.single
          ? null
          : item.color || null,
      quantity: item.quantity,
      product: {
        _id: product._id,
        vendor: product.vendor,
        title: product.title,
        banner: product.banner ?? null,
        inventoryType: product.inventoryType,
        price: product.price,
        discount: product.discount,
        discountPrice: product.discountPrice,
        isDiscounted,
      },
      unitPrice,
      totalPrice: Number((unitPrice * item.quantity).toFixed(2)),
    };
  });
};

/** Decrements stock for a checked-out cart item and increments sold count. */
export const decrementProductStockOrThrow = async (
  traceId: string,
  item: Pick<TEnrichedCartItem, 'productId' | 'quantity' | 'size' | 'color'>,
  session?: ClientSession | null
) => {
  const productQuery = Product.findById(item.productId);
  if (session) productQuery.session(session);
  const product = await productQuery;
  if (!product || product.isDeleted) {
    throw new ApiError(HttpStatusCode.NotFound, 'Product not found', traceId);
  }

  if (product.stock < item.quantity) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Product stock is not enough', traceId);
  }

  if (product.inventoryType === PRODUCT_INVENTORY_TYPE.single) {
    product.stock -= item.quantity;
  } else {
    const variant = product.variants.find((productVariant) => {
      if (product.inventoryType === PRODUCT_INVENTORY_TYPE.colorOnly) {
        return productVariant.color?.code === item.color?.code;
      }

      return (
        productVariant.size === item.size &&
        productVariant.color?.code === item.color?.code
      );
    });

    if (!variant || variant.quantity < item.quantity) {
      throw new ApiError(HttpStatusCode.BadRequest, 'Product option stock is not enough', traceId);
    }

    variant.quantity -= item.quantity;
    product.stock -= item.quantity;
  }

  product.sold += item.quantity;
  await product.save(session ? { session } : undefined);
};

/** Deducts sold/stock/variant quantity once after an order is paid or COD-confirmed. */
export const applyOrderInventoryOrThrow = async (
  traceId: string,
  orderIds: Array<string | Types.ObjectId>,
  session?: ClientSession | null
) => {
  const uniqueOrderIds = [...new Set(orderIds.map((id) => id.toString()))];
  if (!uniqueOrderIds.length) return;

  const orderQuery = Orders.find({
    _id: { $in: uniqueOrderIds },
    isDeleted: false,
    isStockDeducted: { $ne: true },
  });
  if (session) orderQuery.session(session);
  const orders = await orderQuery.select('_id');
  if (!orders.length) return;

  const itemQuery = Items.find({
    order: { $in: orders.map((order) => order._id) },
  });
  if (session) itemQuery.session(session);
  const items = await itemQuery;

  for (const item of items) {
    await decrementProductStockOrThrow(
      traceId,
      {
        productId: item.product,
        quantity: item.quantity,
        size: item.size,
        color: item.color,
      },
      session
    );
  }

  const updateQuery = Orders.updateMany(
    { _id: { $in: orders.map((order) => order._id) } },
    { isStockDeducted: true }
  );
  if (session) updateQuery.session(session);
  await updateQuery;
};

/** Builds item documents for a newly created order. */
export const createOrderItems = async (
  orderId: Types.ObjectId,
  authorId: string,
  items: TEnrichedCartItem[],
  session: ClientSession
) =>
  Items.insertMany(
    items.map((item) => ({
      order: orderId,
      product: item.productId,
      author: authorId,
      quantity: item.quantity,
      price: item.unitPrice,
      totalPrice: item.totalPrice,
      size: item.size ?? null,
      color: item.color ?? null,
    })),
    { session }
  );

const ORDER_LIST_CARD_FIELDS =
  '_id id deliveryCharge totalAmount status paymentStatus transactionId deliveryType isDeleted createdAt';

/** Maps paginated orders into list-card payloads with order-wise items. */
export const mapOrdersToListCards = async (
  orders: Array<Record<string, any>>,
  authorId?: string
) => {
  if (!orders.length) return [];

  const itemFilter: Record<string, unknown> = {
    order: { $in: orders.map((order) => order._id) },
  };
  if (authorId) itemFilter.author = authorId;

  const items = await Items.find(itemFilter)
    .populate({ path: 'product', select: '_id title banner' })
    .select('_id order product color quantity')
    .lean();

  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items) {
    const orderId = item.order.toString();
    const orderItems = itemsByOrder.get(orderId) ?? [];
    orderItems.push(item);
    itemsByOrder.set(orderId, orderItems);
  }

  return orders.map((order) => {
    const orderItems = itemsByOrder.get(order._id.toString()) ?? [];
    return {
      _id: order._id,
      items: orderItems.map((item) => {
        const product = item.product as
          | { _id?: unknown; title?: string; banner?: string | null }
          | null;
        return {
          _id: item._id,
          product: product
            ? {
                _id: product._id,
                title: product.title,
                banner: product.banner ?? null,
              }
            : null,
          color: item.color ?? null,
        };
      }),
      totalItem: orderItems.reduce(
        (total, item) => total + (item.quantity ?? 0),
        0
      ),
      deliveryCharge: order.deliveryCharge,
      totalAmount: order.totalAmount,
      status: order.status,
      paymentStatus: order.paymentStatus,
      transactionId: order.transactionId ?? null,
      deliveryType: order.deliveryType,
      isDeleted: order.isDeleted,
      id: order.id,
      createdAt: order.createdAt,
    };
  });
};

export const orderListCardSelect = ORDER_LIST_CARD_FIELDS;

/**
 * Hides abandoned unpaid pending checkouts and failed payments,
 * but always keeps COD unpaid orders visible.
 */
export const buildVisibleOrdersFilter = async (
  extra: Record<string, unknown> = {}
) => {
  const codOrderIds = await Payment.distinct('order', {
    paymentMethod: PAYMENT_METHOD.cod,
    isDeleted: { $ne: true },
  });

  return {
    isDeleted: false,
    ...extra,
    $nor: [
      {
        paymentStatus: PAYMENT_STATUS.unpaid,
        status: ORDER_STATUS.pending,
        _id: { $nin: codOrderIds },
      },
      { paymentStatus: PAYMENT_STATUS.failed },
    ],
  };
};

/** Maps my-orders list filter query to order.status. */
export const applyMyOrdersListFilter = (
  base: Record<string, unknown>,
  query: Record<string, unknown>
) => {
  const filter = { ...base };

  if (query.filter === ORDER_LIST_FILTER.completed) {
    filter.status = ORDER_STATUS.delivered;
  } else if (query.filter === ORDER_LIST_FILTER.cancelled) {
    filter.status = ORDER_STATUS.cancelled;
  } else if (query.filter === ORDER_LIST_FILTER.active) {
    filter.status = { $in: [...ORDER_ACTIVE_STATUSES] };
  }

  return filter;
};

export const stripOrderListQueryParams = (query: Record<string, unknown>) => {
  const restQuery = { ...query };
  delete restQuery.filter;
  return restQuery;
};

/** Adds hasGrievanceIssued for the current user's orders. */
export const attachHasGrievanceIssued = async <
  T extends { _id: Types.ObjectId | string }
>(
  userId: string,
  cards: T[]
) => {
  if (!cards.length) return [];

  const grievances = await Grievance.find({
    user: userId,
    order: { $in: cards.map((card) => card._id) },
  })
    .select('order')
    .lean();
  const issuedOrderIds = new Set(
    grievances.map((grievance) => grievance.order.toString())
  );

  return cards.map((card) => ({
    ...card,
    hasGrievanceIssued: issuedOrderIds.has(String(card._id)),
  }));
};

/** Throws when a requester cannot access or mutate an order. */
export const assertOrderAccess = (
  traceId: string,
  order: IOrders | Record<string, any>,
  requester: { userId: string; role: string },
  allowAuthor = true
) => {
  const isAdmin = requester.role === USER_ROLE.admin;
  const userId = order.user?._id?.toString() ?? order.user?.toString();
  const authorId = order.author?._id?.toString() ?? order.author?.toString();
  const isOwner = userId === requester.userId;
  const isAuthor = authorId === requester.userId;

  if (!isAdmin && !isOwner && !(allowAuthor && isAuthor)) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this order', traceId);
  }
};

export type TOrderUserNotice =
  | 'paid'
  | 'confirmed'
  | 'processing'
  | 'rider_assigned'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered';

const orderNoticeCopy: Record<
  TOrderUserNotice,
  { title: string; body: (orderId: string) => string }
> = {
  paid: {
    title: 'Payment received',
    body: (orderId) =>
      `We received your payment for order ${orderId}. The shop will confirm it shortly.`,
  },
  confirmed: {
    title: 'Order confirmed',
    body: (orderId) =>
      `The shop confirmed your order ${orderId}. They will start preparing it soon.`,
  },
  processing: {
    title: 'Order is being prepared',
    body: (orderId) =>
      `Your order ${orderId} is now being processed by the shop.`,
  },
  rider_assigned: {
    title: 'Rider assigned',
    body: (orderId) => `A rider has been assigned to your order ${orderId}.`,
  },
  picked_up: {
    title: 'Order picked up',
    body: (orderId) => `Your order ${orderId} has been picked up from the shop.`,
  },
  on_the_way: {
    title: 'Order on the way',
    body: (orderId) => `Your order ${orderId} is on the way to you.`,
  },
  delivered: {
    title: 'Order delivered',
    body: (orderId) => `Your order ${orderId} has been delivered. Please rate your rider.`,
  },
};

/** Emails and notifies the buyer about payment or order status changes. */
export const notifyOrderUser = async (
  order: Pick<IOrders, '_id' | 'id' | 'user' | 'billingDetails'> | Record<string, any>,
  notice: TOrderUserNotice
) => {
  const userId = order.user?._id?.toString?.() ?? order.user?.toString?.();
  if (!userId) return;

  const orderId = order.id || order._id?.toString?.();
  const copy = orderNoticeCopy[notice];
  const title = copy.title;
  const body = copy.body(orderId);

  const user = await User.findById(userId).select('name email fcmToken').lean();
  const email = order.billingDetails?.email || user?.email;
  const name = order.billingDetails?.name || user?.name || 'there';

  await sendNotificationViaQueue({
    userId,
    fcmToken: user?.fcmToken,
    channel: 'both',
    title,
    message: body,
    data: {
      modelType: NOTIFICATION_MODEL_TYPE.Order,
      reference: order._id?.toString?.(),
      notice,
    },
  }).catch((error) => {
    console.warn('[Order] Failed to queue order notification', error);
  });

  if (!email) return;

  const emailQueue = await getEmailQueueInstance();
  await emailQueue
    .add(
      'send-order-status-email',
      { email, name, orderId, title, body },
      {
        priority: 1,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      }
    )
    .catch((error) => {
      console.warn('[Order] Failed to queue order email', error);
    });
};

export const orderPopulate = [
  { path: 'user', select: 'name email phone profileAvatar' },
  { path: 'author', select: 'name email phone profileAvatar coverPhoto' },
];

/** Assigned delivery rider card for order details, including KYC vehicle. */
export const getOrderAssignedRiderCard = async (orderId: string) => {
  const job = await Job.findOne({
    order: orderId,
    rider: { $ne: null },
  })
    .select('rider')
    .lean();
  if (!job?.rider) return null;

  const [rider, kyc] = await Promise.all([
    User.findById(job.rider)
      .select('name profileAvatar phone avgRating ratingCount')
      .lean(),
    Kyc.findOne({ user: job.rider }).select('vehicle').lean(),
  ]);
  if (!rider) return null;

  return {
    _id: rider._id,
    name: rider.name ?? null,
    profileAvatar: rider.profileAvatar ?? null,
    phone: rider.phone ?? null,
    avgRating: rider.avgRating ?? 0,
    ratingCount: rider.ratingCount ?? 0,
    vehicle: kyc?.vehicle ?? null,
  };
};

export const invalidateOrderCaches = async () => {
  await Promise.all([
    deleteCachePattern('order:*'),
    deleteCachePattern('product:*'),
    deleteCachePattern('cart:*'),
  ]);
};

export const getBasketSubtotal = (items: TEnrichedCartItem[]) =>
  Number(items.reduce((total, item) => total + item.totalPrice, 0).toFixed(2));

export const getCoinEligibleSubtotal = (items: TEnrichedCartItem[]) =>
  Number(
    items
      .filter((item) => !item.product.isDiscounted)
      .reduce((total, item) => total + item.totalPrice, 0)
      .toFixed(2)
  );

export const distributeCoinDiscount = (
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

export const buildCheckoutQuote = async (
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

export const removeCheckedOutItemsFromCart = async (
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

export const notifyOrdersPaid = async (orderIds: Array<string | Types.ObjectId>) => {
  await applyOrderInventoryOrThrow('payment', orderIds);
  await creditShopBalanceForPaidOrders(orderIds);

  const orders = await Orders.find({
    _id: { $in: orderIds },
    isDeleted: false,
  })
    .select('_id id user billingDetails')
    .lean();

  await Promise.all(orders.map((order) => notifyOrderUser(order, 'paid')));
};

/** Credits shop (order.author) balance once after the order is paid. */
export const creditShopBalanceForPaidOrders = async (
  orderIds: Array<string | Types.ObjectId>,
  session?: ClientSession | null
) => {
  const uniqueOrderIds = [...new Set(orderIds.map((id) => id.toString()))];
  if (!uniqueOrderIds.length) return;

  const orderQuery = Orders.find({
    _id: { $in: uniqueOrderIds },
    isDeleted: false,
    isShopBalanceCredited: { $ne: true },
    paymentStatus: PAYMENT_STATUS.paid,
  });
  if (session) orderQuery.session(session);
  const orders = await orderQuery.select(
    '_id author amount coinDiscount voucherDiscount'
  );

  for (const order of orders) {
    const shopCredit = Number(
      (
        (order.amount ?? 0) -
        (order.coinDiscount ?? 0) -
        (order.voucherDiscount ?? 0)
      ).toFixed(2)
    );
    if (shopCredit > 0 && order.author) {
      await User.findByIdAndUpdate(
        order.author,
        { $inc: { balance: shopCredit } },
        session ? { session } : undefined
      );
    }

    const flagQuery = Orders.updateOne(
      { _id: order._id, isShopBalanceCredited: { $ne: true } },
      { isShopBalanceCredited: true }
    );
    if (session) flagQuery.session(session);
    await flagQuery;
  }
};


