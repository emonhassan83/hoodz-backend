import { Types } from 'mongoose';

import {
  DELIVERY_TYPE,
  ORDER_STATUS,
  PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';
import {
  TVoucherDiscountType,
  TVoucherType,
} from '@/app/modules/voucher/voucher.types';

export type TOrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
export type TPaymentStatus =
  (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];
export type TDeliveryType = (typeof DELIVERY_TYPE)[keyof typeof DELIVERY_TYPE];

export type TOrderBillingDetails = {
  name?: string | null;
  address?: string | null;
  phoneNumber?: string | null;
  email: string;
  buildingNo?: number | null;
  floorNo?: number | null;
  apartment?: number | null;
  city?: string | null;
  country?: string | null;
  note?: string | null;
};

export type TCreateOrderPayload = {
  items: {
    product: string;
    quantity: number;
    size?: string | null;
    color?: TOrderItemColor | null;
  }[];
  orderData: {
    billingDetails: TOrderBillingDetails;
    deliveryType: TDeliveryType;
    deliveryCharge?: number;
    transactionId?: string | null;
    redeemCoins?: number;
    voucherCode?: string | null;
  };
};

export type TOrderGiftDetails = {
  name?: string | null;
  bannerImage?: string[];
  description?: string | null;
};

export type TCheckoutVoucherQuote = {
  voucherId: Types.ObjectId | null;
  code: string | null;
  voucherType: TVoucherType | null;
  discountType: TVoucherDiscountType | null;
  voucherDiscount: number;
  giftDetails: TOrderGiftDetails | null;
  perOrderDiscounts: number[];
  perOrderGifts: Array<TOrderGiftDetails | null>;
  consumeOnCreate: boolean;
};

export type TChangeOrderStatusPayload = {
  status?: TOrderStatus;
  paymentStatus?: TPaymentStatus;
  transactionId?: string | null;
  isOtpVerified?: boolean;
};

export type TOrderRequester = {
  userId: string;
  role: string;
};

export type TOrderItemColor = {
  code: string;
  name: string;
};

export type TOrderItemPayload = {
  product: Types.ObjectId;
  author: Types.ObjectId;
  order: Types.ObjectId;
  quantity: number;
  price: number;
  totalPrice: number;
  size?: string | null;
  color?: TOrderItemColor | null;
};


