import { Model, Types } from 'mongoose';

import {
  TDeliveryType,
  TOrderBillingDetails,
  TOrderGiftDetails,
  TOrderStatus,
  TPaymentStatus,
} from '@/app/modules/orders/orders.types';

export interface IOrders {
  _id: Types.ObjectId;
  id: string;
  user?: Types.ObjectId | null;
  author: Types.ObjectId;
  amount: number;
  coinDiscount: number;
  voucher?: Types.ObjectId | null;
  voucherCode?: string | null;
  voucherDiscount: number;
  giftDetails?: TOrderGiftDetails | null;
  deliveryCharge: number;
  totalAmount: number;
  status: TOrderStatus;
  paymentStatus: TPaymentStatus;
  transactionId?: string | null;
  billingDetails: TOrderBillingDetails;
  deliveryType: TDeliveryType;
  confirmedAt?: Date | null;
  processedAt?: Date | null;
  isOtpVerified: boolean;
  isStockDeducted: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type IOrdersModel = Model<IOrders, Record<string, unknown>>;


// Formula: totalAmount = amount - coinDiscount - voucherDiscount + deliveryCharge