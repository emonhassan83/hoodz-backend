import { Schema, model } from 'mongoose';
import {
  WALLET_TRANSACTION_DIRECTION,
  WALLET_TRANSACTION_REFERENCE_TYPE,
  WALLET_TRANSACTION_STATUS,
  WALLET_TRANSACTION_TYPE,
} from '@/app/modules/walletTransaction/walletTransaction.constant';
import { IWalletTransaction, IWalletTransactionModel } from './walletTransaction.interface';
import { generateCryptoString } from '@/app/utils/generateCryptoString';

const walletTransactionSchema = new Schema<IWalletTransaction, IWalletTransactionModel>(
  {
    id: {
      type: String,
      default: () => generateCryptoString(10),
      unique: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(WALLET_TRANSACTION_TYPE),
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    direction: {
      type: String,
      enum: Object.values(WALLET_TRANSACTION_DIRECTION),
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(WALLET_TRANSACTION_STATUS),
      default: WALLET_TRANSACTION_STATUS.completed,
      index: true,
    },
    referenceType: {
      type: String,
      enum: Object.values(WALLET_TRANSACTION_REFERENCE_TYPE),
      default: null,
      index: true,
    },
    reference: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    savedCard: {
      type: Schema.Types.ObjectId,
      ref: 'SavedCard',
      default: null,
    },
    paymobTransactionId: {
      type: String,
      default: null,
      index: true,
    },
    note: {
      type: String,
      default: null,
      trim: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index(
  { user: 1, type: 1, referenceType: 1, reference: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false, type: WALLET_TRANSACTION_TYPE.top_up },
  }
);

export const WalletTransaction = model<IWalletTransaction, IWalletTransactionModel>('WalletTransaction', walletTransactionSchema);
