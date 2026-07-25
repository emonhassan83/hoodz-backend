import { Schema, model } from 'mongoose';

import {
  RIDER_WALLET_TRANSACTION_STATUS,
  RIDER_WALLET_TRANSACTION_TYPE,
} from '@/app/modules/riderWallet/riderWallet.constant';
import {
  IRiderWalletTransaction,
  IRiderWalletTransactionModel,
} from '@/app/modules/riderWallet/riderWallet.interface';
import { generateCryptoString } from '@/app/utils/generateCryptoString';

const riderWalletTransactionSchema = new Schema<
  IRiderWalletTransaction,
  IRiderWalletTransactionModel
>(
  {
    id: {
      type: String,
      default: () => generateCryptoString(10),
      unique: true,
      index: true,
    },
    rider: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    job: {
      type: Schema.Types.ObjectId,
      ref: 'Job',
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(RIDER_WALLET_TRANSACTION_TYPE),
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: Object.values(RIDER_WALLET_TRANSACTION_STATUS),
      default: RIDER_WALLET_TRANSACTION_STATUS.pending,
      index: true,
    },
    availableAt: { type: Date, default: null },
    note: { type: String, default: null, trim: true },
    rejectionReason: { type: String, default: null, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

riderWalletTransactionSchema.index({ rider: 1, type: 1, status: 1 });
riderWalletTransactionSchema.index(
  { rider: 1, job: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      job: { $type: 'objectId' },
      type: RIDER_WALLET_TRANSACTION_TYPE.earning,
    },
  }
);

export const RiderWalletTransaction = model<
  IRiderWalletTransaction,
  IRiderWalletTransactionModel
>('RiderWalletTransaction', riderWalletTransactionSchema);


