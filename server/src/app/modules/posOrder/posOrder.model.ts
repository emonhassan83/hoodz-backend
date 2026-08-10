import { Schema, model } from 'mongoose';
import { POS_ORDER_STATUS } from '@/app/modules/posOrder/posOrder.constant';
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
    totalCost: { type: Number, required: true, min: 0 },
    soldBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    shop: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(POS_ORDER_STATUS),
      default: POS_ORDER_STATUS.completed,
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

posOrderSchema.index({ shop: 1, createdAt: -1 });
posOrderSchema.index({ soldBy: 1, createdAt: -1 });

export const PosOrder = model<IPosOrder, IPosOrderModel>('PosOrder', posOrderSchema);
