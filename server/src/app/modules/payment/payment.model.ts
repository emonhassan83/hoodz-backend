import { Schema, model } from 'mongoose';

import {
  PAYMENT_METHOD,
  PAYMENT_STATUS,
} from '@/app/modules/payment/payment.constant';
import { IPayment, IPaymentModel } from '@/app/modules/payment/payment.interface';
import { generateCryptoString } from '@/app/utils/generateCryptoString';

const paymentSchema = new Schema<IPayment, IPaymentModel>(
  {
    id: {
      type: String,
      default: () => generateCryptoString(10),
      unique: true,
      index: true,
    },
    account: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
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
    savedCard: {
      type: Schema.Types.ObjectId,
      ref: 'SavedCard',
      default: null,
    },
    saveCardRequested: {
      type: Boolean,
      default: false,
    },
    subtotalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    coinDiscount: {
      type: Number,
      default: 0,
      min: 0,
    },
    deliveryCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.pending,
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PAYMENT_METHOD),
      required: true,
      index: true,
    },
    isPaid: {
      type: Boolean,
      default: false,
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

paymentSchema.index({ account: 1, createdAt: -1 });
paymentSchema.index({ order: 1, isDeleted: 1 });

export const Payment = model<IPayment, IPaymentModel>('Payment', paymentSchema);

