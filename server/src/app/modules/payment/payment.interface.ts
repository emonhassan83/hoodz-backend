import { Model, Types } from 'mongoose';

import {
  PAYMENT_METHOD,
  PAYMENT_STATUS,
} from '@/app/modules/payment/payment.constant';

export type IPaymentStatus =
  (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export type IPaymentMethod =
  (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

export interface IPayment {
  _id: Types.ObjectId;
  id: string;
  account: Types.ObjectId;
  order: Types.ObjectId;
  transactionId?: string | null;
  paymentIntentId?: string | null;
  amount: number;
  status: IPaymentStatus;
  paymentMethod: IPaymentMethod;
  isPaid: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type IPaymentModel = Model<IPayment, Record<string, unknown>>;

