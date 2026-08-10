import { Model, Types } from 'mongoose';

import {
  TWalletTransactionDirection,
  TWalletTransactionReferenceType,
  TWalletTransactionStatus,
  TWalletTransactionType,
} from '@/app/modules/walletTransaction/walletTransaction.types';

export interface IWalletTransaction {
  _id: Types.ObjectId;
  id: string;
  user: Types.ObjectId;
  type: TWalletTransactionType;
  amount: number;
  direction: TWalletTransactionDirection;
  status: TWalletTransactionStatus;
  referenceType?: TWalletTransactionReferenceType | null;
  reference?: Types.ObjectId | null;
  savedCard?: Types.ObjectId | null;
  paymobTransactionId?: string | null;
  note?: string | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type IWalletTransactionModel = Model<IWalletTransaction, Record<string, unknown>>;
