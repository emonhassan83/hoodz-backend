import { Schema, model } from 'mongoose';

import { IVoucherLog, IVoucherLogModel } from './voucherLog.interface';

const voucherLogSchema = new Schema<IVoucherLog, IVoucherLogModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    voucher: {
      type: Schema.Types.ObjectId,
      ref: 'Voucher',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

voucherLogSchema.index({ user: 1, voucher: 1 }, { unique: true });

export const VoucherLog = model<IVoucherLog, IVoucherLogModel>(
  'VoucherLog',
  voucherLogSchema
);
