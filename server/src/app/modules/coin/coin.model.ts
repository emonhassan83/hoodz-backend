import { Schema, model } from 'mongoose';

import {
  ICoinAccount,
  ICoinAccountModel,
  ICoinTransaction,
  ICoinTransactionModel,
} from './coin.interface';
import {
  COIN_EARNING_ACTION,
  COIN_TRANSACTION_STATUS,
  COIN_TRANSACTION_TYPE,
} from '@/app/modules/coin/coin.constant';

const coinAccountSchema = new Schema<ICoinAccount, ICoinAccountModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    balance: { type: Number, default: 0, min: 0 },
    lastActivityAt: { type: Date, default: null },
    inactiveReminderSentAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

const coinTransactionSchema = new Schema<
  ICoinTransaction,
  ICoinTransactionModel
>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(COIN_TRANSACTION_TYPE),
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: Object.values(COIN_EARNING_ACTION),
      default: null,
      index: true,
    },
    coins: { type: Number, required: true, min: 0 },
    remainingCoins: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date, default: null, index: true },
    expiryWarningSentAt: { type: Date, default: null, index: true },
    status: {
      type: String,
      enum: Object.values(COIN_TRANSACTION_STATUS),
      default: COIN_TRANSACTION_STATUS.active,
      index: true,
    },
    referenceType: { type: String, default: null, trim: true },
    reference: { type: Schema.Types.ObjectId, default: null },
  },
  {
    timestamps: true,
  }
);

coinTransactionSchema.index({
  user: 1,
  status: 1,
  expiresAt: 1,
  createdAt: 1,
});
coinTransactionSchema.index(
  {
    user: 1,
    type: 1,
    action: 1,
    referenceType: 1,
    reference: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      reference: { $type: 'objectId' },
      action: { $type: 'string' },
    },
  }
);

export const CoinAccount = model<ICoinAccount, ICoinAccountModel>(
  'CoinAccount',
  coinAccountSchema
);

export const CoinTransaction = model<
  ICoinTransaction,
  ICoinTransactionModel
>('CoinTransaction', coinTransactionSchema);
