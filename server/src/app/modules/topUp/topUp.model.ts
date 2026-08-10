import { Schema, model } from 'mongoose';

import {
  TOP_UP_PAYMENT_METHOD,
  TOP_UP_STATUS,
} from '@/app/modules/topUp/topUp.constant';
import { ITopUp, ITopUpModel } from './topUp.interface';
import { generateCryptoString } from '@/app/utils/generateCryptoString';

const topUpSchema = new Schema<ITopUp, ITopUpModel>(
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
    savedCard: {
      type: Schema.Types.ObjectId,
      ref: 'SavedCard',
      default: null,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    paymentMethod: {
      type: String,
      enum: Object.values(TOP_UP_PAYMENT_METHOD),
      default: TOP_UP_PAYMENT_METHOD.card,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(TOP_UP_STATUS),
      default: TOP_UP_STATUS.pending,
      index: true,
    },
    transactionId: {
      type: String,
      default: null,
      index: true,
    },
    paymentIntentId: {
      type: String,
      default: null,
      index: true,
    },
    saveCardRequested: {
      type: Boolean,
      default: false,
    },
    isPaid: {
      type: Boolean,
      default: false,
      index: true,
    },
    balanceAppliedAt: {
      type: Date,
      default: null,
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

topUpSchema.index({ user: 1, createdAt: -1 });
topUpSchema.index({ status: 1, isDeleted: 1 });

export const TopUp = model<ITopUp, ITopUpModel>('TopUp', topUpSchema);
