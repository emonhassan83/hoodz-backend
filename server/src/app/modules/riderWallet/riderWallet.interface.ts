import { Model, Types } from 'mongoose';

import {
  RIDER_WALLET_TRANSACTION_STATUS,
  RIDER_WALLET_TRANSACTION_TYPE,
} from '@/app/modules/riderWallet/riderWallet.constant';

export type TRiderWalletTransactionType =
  (typeof RIDER_WALLET_TRANSACTION_TYPE)[keyof typeof RIDER_WALLET_TRANSACTION_TYPE];
export type TRiderWalletTransactionStatus =
  (typeof RIDER_WALLET_TRANSACTION_STATUS)[keyof typeof RIDER_WALLET_TRANSACTION_STATUS];

export interface IRiderWalletTransaction {
  _id: Types.ObjectId;
  id: string;
  rider: Types.ObjectId;
  job?: Types.ObjectId | null;
  type: TRiderWalletTransactionType;
  amount: number;
  status: TRiderWalletTransactionStatus;
  availableAt?: Date | null;
  note?: string | null;
  rejectionReason?: string | null;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type IRiderWalletTransactionModel = Model<
  IRiderWalletTransaction,
  Record<string, unknown>
>;


