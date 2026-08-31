import { Schema, model } from 'mongoose';
import { WITHDRAW_STATUS } from '@/app/modules/withdraw/withdraw.constant';
import { IWithdraw, IWithdrawModel } from './withdraw.interface';
import { generateCryptoString } from '@/app/utils/generateCryptoString';

const withdrawSchema = new Schema<IWithdraw, IWithdrawModel>(
  {
    id: {
      type: String,
      default: () => generateCryptoString(4),
      unique: true,
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: Object.values(WITHDRAW_STATUS),
      default: WITHDRAW_STATUS.pending,
      index: true,
    },
    note: {
      type: String,
      default: null,
      trim: true,
    },
    files: {
      type: [String],
      default: [],
    },
    completedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    processedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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

withdrawSchema.index({ author: 1, status: 1, createdAt: -1 });
withdrawSchema.index({ status: 1, isDeleted: 1, createdAt: -1 });

export const Withdraw = model<IWithdraw, IWithdrawModel>('Withdraw', withdrawSchema);
