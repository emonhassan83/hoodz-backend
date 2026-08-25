import { Schema, model } from 'mongoose';

import { IPosOrder, IPosOrderModel } from './posOrder.interface';

const posOrderColorSchema = new Schema(
  {
    code: { type: String, default: null, trim: true },
    name: { type: String, default: null, trim: true },
  },
  { _id: false }
);

const posOrderItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    variant: {
      size: { type: String, default: null, trim: true },
      color: { type: posOrderColorSchema, default: null },
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false }
);

const posOrderSchema = new Schema<IPosOrder, IPosOrderModel>(
  {
    items: {
      type: [posOrderItemSchema],
      required: true,
      validate: [(value: unknown[]) => value.length > 0, 'Items are required'],
    },
    subTotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    shop: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

posOrderSchema.index({ shop: 1, createdAt: -1 });

export const PosOrder = model<IPosOrder, IPosOrderModel>('PosOrder', posOrderSchema);
