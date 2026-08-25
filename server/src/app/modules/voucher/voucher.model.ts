import { Schema, model } from 'mongoose';
import {
  VOUCHER_DISCOUNT_TYPE,
  VOUCHER_STATUS,
  VOUCHER_TYPE,
} from '@/app/modules/voucher/voucher.constant';
import { IVoucher, IVoucherModel } from './voucher.interface';

const voucherSchema = new Schema<IVoucher, IVoucherModel>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: null,
      trim: true,
    },
    voucherType: {
      type: String,
      enum: Object.values(VOUCHER_TYPE),
      required: true,
      index: true,
    },
    shop: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    discountType: {
      type: String,
      enum: Object.values(VOUCHER_DISCOUNT_TYPE),
      required: true,
      index: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    giftDetails: {
      name: { type: String, default: null, trim: true },
      bannerImage: { type: [String], default: [] },
      description: { type: String, default: null, trim: true },
    },
    minSpend: {
      type: Number,
      default: 0,
      min: 0,
    },
    expiryDate: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(VOUCHER_STATUS),
      default: VOUCHER_STATUS.active,
      index: true,
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

voucherSchema.index({ voucherType: 1, status: 1, expiryDate: 1 });
voucherSchema.index({ shop: 1, status: 1, expiryDate: 1 });
voucherSchema.index({ user: 1, status: 1, expiryDate: 1 });

export const Voucher = model<IVoucher, IVoucherModel>('Voucher', voucherSchema);
