import { Model, Types } from 'mongoose';

import {
  COIN_EARNING_ACTION,
  COIN_TRANSACTION_STATUS,
  COIN_TRANSACTION_TYPE,
} from '@/app/modules/coin/coin.constant';

export type TCoinTransactionType =
  (typeof COIN_TRANSACTION_TYPE)[keyof typeof COIN_TRANSACTION_TYPE];

export type TCoinTransactionStatus =
  (typeof COIN_TRANSACTION_STATUS)[keyof typeof COIN_TRANSACTION_STATUS];

export type TCoinEarningAction =
  (typeof COIN_EARNING_ACTION)[keyof typeof COIN_EARNING_ACTION];

export interface ICoinAccount {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  balance: number;
  lastActivityAt?: Date | null;
  inactiveReminderSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICoinTransaction {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  type: TCoinTransactionType;
  action?: TCoinEarningAction | null;
  coins: number;
  remainingCoins: number;
  expiresAt?: Date | null;
  expiryWarningSentAt?: Date | null;
  status: TCoinTransactionStatus;
  referenceType?: string | null;
  reference?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ICoinAccountModel = Model<ICoinAccount, Record<string, unknown>>;

export type ICoinTransactionModel = Model<
  ICoinTransaction,
  Record<string, unknown>
>;
