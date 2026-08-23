import { Schema, model } from 'mongoose';

import {
  DELIVERY_TYPE,
  ORDER_STATUS,
  PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';
import { IOrders, IOrdersModel } from '@/app/modules/orders/orders.interface';
import { generateCryptoString } from '@/app/utils/generateCryptoString';

const ordersSchema = new Schema<IOrders, IOrdersModel>(
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
      default: null,
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    coinDiscount: { type: Number, default: 0, min: 0 },
    voucher: {
      type: Schema.Types.ObjectId,
      ref: 'Voucher',
      default: null,
      index: true,
    },
    voucherCode: { type: String, default: null, trim: true, uppercase: true },
    voucherDiscount: { type: Number, default: 0, min: 0 },
    giftDetails: {
      name: { type: String, default: null, trim: true },
      bannerImage: { type: [String], default: [] },
      description: { type: String, default: null, trim: true },
    },
    deliveryCharge: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.pending,
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.unpaid,
      index: true,
    },
    transactionId: {
      type: String,
      default: null,
    },
    billingDetails: {
      name: { type: String, default: null },
      address: { type: String, default: null },
      phoneNumber: { type: String, default: null },
      email: {
        type: String,
        required: [true, 'billing email is required'],
        default: null,
      },
      buildingNo: { type: Number, default: null },
      floorNo: { type: Number, default: null },
      apartment: { type: Number, default: null },
      city: { type: String, default: null },
      country: { type: String, default: null },
      note: { type: String, default: null },
      deliveryLocation: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point',
        },
        coordinates: {
          type: [Number],
          default: [0, 0],
        },
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
      },
    },
    deliveryType: {
      type: String,
      enum: Object.values(DELIVERY_TYPE),
      required: true,
    },
    cancelledAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    riderAssignedAt: { type: Date, default: null },
    pickedUpAt: { type: Date, default: null },
    onTheWayAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    isOtpVerified: {
      type: Boolean,
      default: false,
    },
    isStockDeducted: {
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

ordersSchema.pre('save', function calculateTotal() {
  this.totalAmount = Number(
    (
      (this.amount ?? 0) -
      (this.coinDiscount ?? 0) -
      (this.voucherDiscount ?? 0) +
      (this.deliveryCharge ?? 0)
    ).toFixed(2)
  );
});

ordersSchema.index({ user: 1, isDeleted: 1, createdAt: -1 });
ordersSchema.index({ author: 1, isDeleted: 1, createdAt: -1 });

export const Orders = model<IOrders, IOrdersModel>('Order', ordersSchema);


