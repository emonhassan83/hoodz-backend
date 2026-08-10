import { Model, Types } from 'mongoose';

import {
  TTopUpPaymentMethod,
  TTopUpStatus,
} from '@/app/modules/topUp/topUp.types';

export interface ITopUp {
  _id: Types.ObjectId;
  id: string;
  user: Types.ObjectId;
  savedCard?: Types.ObjectId | null;
  amount: number;
  paymentMethod: TTopUpPaymentMethod;
  status: TTopUpStatus;
  transactionId?: string | null;
  paymentIntentId?: string | null;
  saveCardRequested: boolean;
  isPaid: boolean;
  balanceAppliedAt?: Date | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ITopUpModel = Model<ITopUp, Record<string, unknown>>;
