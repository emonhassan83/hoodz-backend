import { HttpStatusCode } from 'axios';
import { ClientSession, Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { TEnrichedCartItem } from '@/app/modules/cart/cart.types';
import { Items } from '@/app/modules/items/items.model';
import { DELIVERY_TYPE } from '@/app/modules/orders/orders.constant';
import { IOrders } from '@/app/modules/orders/orders.interface';
import { TCreateOrderPayload } from '@/app/modules/orders/orders.types';
import { PRODUCT_INVENTORY_TYPE } from '@/app/modules/product/product.constant';
import { Product } from '@/app/modules/product/product.model';
import { Setting } from '@/app/modules/settings/settings.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';

type TDeliveryChargeSetting = {
  state: string;
  regularDeliveryCharge: number;
  instantDeliveryCharge: number;
};

/** Groups cart items by product vendor/author for multi-vendor checkout. */
export const groupCartItemsByAuthor = (items: TEnrichedCartItem[]) =>
  items.reduce<Map<string, TEnrichedCartItem[]>>((groupedItems, item) => {
    const authorId = item.product.vendorId.toString();
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
  }).select('vendorId title images price discount discountPrice stock inventoryType variants');

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
        vendorId: product.vendorId,
        title: product.title,
        images: product.images,
        price: product.price,
        discountPrice: product.discountPrice,
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
