import { Model, Types } from 'mongoose';

import {
  TDeliveryType,
  TOrderBillingDetails,
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
  deliveryCharge: number;
  totalAmount: number;
  status: TOrderStatus;
  paymentStatus: TPaymentStatus;
  transactionId?: string | null;
  billingDetails: TOrderBillingDetails;
  deliveryType: TDeliveryType;
  isOtpVerified: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type IOrdersModel = Model<IOrders, Record<string, unknown>>;


