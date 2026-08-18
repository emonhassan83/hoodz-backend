import { HttpStatusCode } from 'axios';
import { ClientSession, Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { TEnrichedCartItem } from '@/app/modules/cart/cart.types';
import { Items } from '@/app/modules/items/items.model';
import { DELIVERY_TYPE } from '@/app/modules/orders/orders.constant';
import { IOrders } from '@/app/modules/orders/orders.interface';
import {
  TCheckoutVoucherQuote,
  TCreateOrderPayload,
} from '@/app/modules/orders/orders.types';
import { PRODUCT_INVENTORY_TYPE } from '@/app/modules/product/product.constant';
import { Product } from '@/app/modules/product/product.model';
import { Setting } from '@/app/modules/settings/settings.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import {
  VOUCHER_STATUS,
  VOUCHER_TYPE,
} from '@/app/modules/voucher/voucher.constant';
import {
  calculateVoucherDiscountAmount,
  formatCheckoutGiftDetails,
  getActiveVoucherByCodeOrThrow,
} from '@/app/modules/voucher/voucher.helpers';
import { Voucher } from '@/app/modules/voucher/voucher.model';

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

/** Marks a one-time compensation voucher as used. */
export const consumeCheckoutVoucher = async (
  quote: TCheckoutVoucherQuote,
  session: ClientSession
) => {
  if (!quote.consumeOnCreate || !quote.voucherId) return;

  await Voucher.updateOne(
    { _id: quote.voucherId },
    { status: VOUCHER_STATUS.deactivated },
    { session }
  );
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
  item: TEnrichedCartItem,
  session: ClientSession
) => {
  const product = await Product.findById(item.productId).session(session);
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
  await product.save({ session });
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


