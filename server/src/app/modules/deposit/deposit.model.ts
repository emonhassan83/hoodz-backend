import { Schema, model } from 'mongoose';

import { DEPOSIT_STATUS } from '@/app/modules/deposit/deposit.constant';
import {
  IDeposit,
  IDepositModel,
} from '@/app/modules/deposit/deposit.interface';
import { generateCryptoString } from '@/app/utils/generateCryptoString';

const DepositSchema = new Schema<IDeposit, IDepositModel>(
  {
    id: {
      type: String,
      default: () => generateCryptoString(10),
      unique: true,
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    jobIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
      index: true,
    }],
    amount: { type: Number, required: true, min: 0 },
    fawryRefNo: { type: String, required: true, trim: true, index: true },
    receiptFiles: { type: [String], required: true, default: [] },
    status: {
      type: String,
      enum: Object.values(DEPOSIT_STATUS),
      default: DEPOSIT_STATUS.pending,
      index: true,
    },
    note: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

DepositSchema.index({ author: 1, status: 1, createdAt: -1 });
DepositSchema.index({ jobIds: 1, status: 1 });

export const Deposit = model<IDeposit, IDepositModel>(
  'Deposit',
  DepositSchema
);




